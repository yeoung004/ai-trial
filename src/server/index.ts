import express from 'express';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import path from 'node:path';
import { z } from 'zod';
import { generateRoles, runCouncil } from './engine';
import { getModels, getSession, listSessions, saveModels, saveSession } from './storage';
import { validateModels } from './registry';
import type { CouncilRequest, ModelConfig, RoleGenerationResult, UsageSummary } from '../shared/types';

for (const envFile of ['.env', '.env.local']) {
  if (existsSync(envFile)) loadEnvFile(envFile);
}

type Execution = {
  id: string;
  status: 'running' | 'complete' | 'failed' | 'cancelled';
  stage: string;
  createdAt: string;
  result?: unknown;
  error?: { code: string; message: string; details?: unknown };
  warning?: { code: string; message: string };
  events: unknown[];
  controller: AbortController;
};

class ApiError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

const requestSchema = z.object({
  question: z.string().trim().min(1).max(10_000),
  context: z.string().max(20_000).optional(),
  mode: z.enum(['YES_NO', 'DEBATE']),
  roleMode: z.enum(['AUTO', 'MANUAL', 'HYBRID']),
  roles: z.array(z.object({ title: z.string().trim().min(1).max(120) }).passthrough()).max(5).optional(),
  approvedRoles: z.array(z.object({ title: z.string().trim().min(1).max(120) }).passthrough()).max(5).optional(),
  models: z.object({
    roleGeneratorModelId: z.string().optional(),
    defaultExpertModelId: z.string().min(1),
    judgeModelId: z.string().min(1),
    expertModelOverrides: z.record(z.string(), z.string()).optional(),
  }),
  settings: z.record(z.string(), z.unknown()).optional(),
});

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

const executions = new Map<string, Execution>();
const previews = new Map<string, { question: string; mode: string; preview: RoleGenerationResult; createdAt: number }>();

function combinedUsage(preview: UsageSummary | undefined, run: UsageSummary): UsageSummary {
  if (!preview) return run;
  return {
    calls: [...preview.calls, ...run.calls],
    totalCalls: preview.totalCalls + run.totalCalls,
    totalInputTokens: preview.totalInputTokens + run.totalInputTokens,
    totalOutputTokens: preview.totalOutputTokens + run.totalOutputTokens,
    totalTokens: preview.totalTokens + run.totalTokens,
    totalCost: preview.totalCost + run.totalCost,
    totalLatencyMs: preview.totalLatencyMs + run.totalLatencyMs,
    costComplete: preview.costComplete && run.costComplete,
  };
}

function publicExecution(execution: Execution) {
  const { controller: _controller, ...visible } = execution;
  return visible;
}

function safeError(error: unknown): { code: string; message: string; details?: unknown } {
  if (error instanceof z.ZodError) {
    return { code: 'INVALID_REQUEST', message: error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ') };
  }
  if (error instanceof Error) {
    const typed = error as Error & { code?: string; details?: unknown };
    if (typed.code) return { code: typed.code, message: typed.message, details: typed.details };
    console.error('Council execution failed:', error);
  }
  return { code: 'EXECUTION_FAILED', message: 'The council could not finish this request. Check server logs and provider configuration.' };
}

function summary(record: Record<string, unknown>) {
  const result = (record.result ?? {}) as Record<string, unknown>;
  const usage = (result.usage ?? {}) as Record<string, unknown>;
  return {
    id: record.id,
    createdAt: record.createdAt,
    question: record.question,
    mode: record.mode,
    status: record.status ?? 'complete',
    decision: ((result.judge ?? {}) as Record<string, unknown>).decision,
    conclusion: ((result.judge ?? {}) as Record<string, unknown>).conclusion,
    cost: usage.totalCost ?? usage.estimatedCost ?? 0,
    tokens: usage.totalTokens ?? 0,
  };
}

async function parsedRequest(body: unknown): Promise<CouncilRequest> {
  const parsed = requestSchema.parse(body);
  const registry = await getModels();
  const ids = new Set(registry.filter((model: ModelConfig) => model.enabled).map((model: ModelConfig) => model.id));
  const selection = parsed.models;
  for (const id of [selection.defaultExpertModelId, selection.judgeModelId, ...Object.values(selection.expertModelOverrides ?? {})]) {
    if (!ids.has(id)) throw new ApiError('MODEL_UNAVAILABLE', `Selected model is unavailable: ${id}`);
  }
  if (parsed.roleMode !== 'MANUAL' && !parsed.approvedRoles?.length && !selection.roleGeneratorModelId) {
    throw new ApiError('ROLE_GENERATOR_REQUIRED', 'Select a Role Generator model for automatic roles.');
  }
  if (selection.roleGeneratorModelId && !ids.has(selection.roleGeneratorModelId)) {
    throw new ApiError('MODEL_UNAVAILABLE', 'Selected Role Generator model is unavailable.');
  }
  return { ...parsed, models: { ...selection, registry } } as CouncilRequest;
}

app.get('/api/bootstrap', async (_req, res) => {
  try {
    const [models, records] = await Promise.all([getModels(), listSessions()]);
    res.json({
      models,
      history: records.map((record) => summary(record as Record<string, unknown>)),
      providerKeys: {
        gateway: Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN),
        openai: Boolean(process.env.OPENAI_API_KEY),
        anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
        google: Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY),
      },
    });
  } catch (error) { res.status(500).json({ error: safeError(error) }); }
});

app.put('/api/models', async (req, res) => {
  try {
    const models = validateModels(req.body?.models);
    await saveModels(models);
    res.json({ models });
  } catch (error) {
    res.status(400).json({ error: {
      code: 'INVALID_MODELS',
      message: error instanceof Error ? error.message : 'Model registry is invalid.',
    } });
  }
});

app.post('/api/roles', async (req, res) => {
  try {
    const councilRequest = await parsedRequest(req.body);
    const priorId = typeof req.body?.previewId === 'string' ? req.body.previewId : undefined;
    const prior = priorId ? previews.get(priorId) : undefined;
    if (priorId && (!prior || prior.question !== councilRequest.question || prior.mode !== councilRequest.mode)) {
      throw new ApiError('PREVIEW_EXPIRED', 'Role preview expired or no longer matches this question. Preview roles again.');
    }
    const next = await generateRoles({ ...councilRequest, approvedRoles: undefined });
    const preview: RoleGenerationResult = { ...next, usage: combinedUsage(prior?.preview.usage, next.usage) };
    const previewId = randomUUID();
    previews.set(previewId, { question: councilRequest.question, mode: councilRequest.mode, preview, createdAt: Date.now() });
    for (const [id, value] of previews) if (Date.now() - value.createdAt > 30 * 60_000) previews.delete(id);
    res.json({ ...preview, previewId });
  } catch (error) {
    res.status(error instanceof z.ZodError ? 400 : 422).json({ error: safeError(error) });
  }
});

app.post('/api/executions', async (req, res) => {
  let councilRequest: CouncilRequest;
  try { councilRequest = await parsedRequest(req.body); }
  catch (error) { res.status(400).json({ error: safeError(error) }); return; }

  const previewId = typeof req.body?.previewId === 'string' ? req.body.previewId : undefined;
  const previewRecord = previewId ? previews.get(previewId) : undefined;
  if (previewId && (!previewRecord || Date.now() - previewRecord.createdAt > 30 * 60_000 || previewRecord.question !== councilRequest.question || previewRecord.mode !== councilRequest.mode)) {
    res.status(400).json({ error: { code: 'PREVIEW_EXPIRED', message: 'Role preview expired or no longer matches this question. Preview roles again.' } });
    return;
  }
  if (previewRecord && councilRequest.settings?.maxCost !== undefined) {
    const remaining = councilRequest.settings.maxCost - previewRecord.preview.usage.totalCost;
    if (remaining <= 0) {
      res.status(400).json({ error: { code: 'BUDGET_EXCEEDED', message: 'Role preview already used the request budget. Increase the budget or use manual roles.' } });
      return;
    }
    councilRequest = { ...councilRequest, settings: { ...councilRequest.settings, maxCost: remaining } };
  }
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const execution: Execution = {
    id, status: 'running', stage: 'ANALYZING', createdAt, events: [], controller: new AbortController(),
  };
  executions.set(id, execution);
  if (executions.size > 100) {
    const oldestCompleted = [...executions.values()].find((item) => item.status !== 'running');
    if (oldestCompleted) executions.delete(oldestCompleted.id);
  }
  res.status(202).json({ id });

  void runCouncil({ ...councilRequest, id }, {
    signal: execution.controller.signal,
    onStage: (event) => {
      if (execution.status !== 'running') return;
      execution.events.push(event);
      if (execution.events.length > 50) execution.events.shift();
      const stage = (event as { stage?: string }).stage;
      if (stage) execution.stage = stage;
    },
  }).then(async (result) => {
    if (execution.status !== 'running') return;
    if (previewRecord) {
      result = { ...result, usage: combinedUsage(previewRecord.preview.usage, result.usage) };
    }
    execution.result = result;
    execution.stage = 'SAVING';
    try {
      await saveSession({
        id, createdAt, status: 'complete', question: councilRequest.question,
        mode: councilRequest.mode, roleMode: councilRequest.roleMode,
        roles: result.roles,
        models: {
          roleGeneratorModelId: councilRequest.models.roleGeneratorModelId,
          defaultExpertModelId: councilRequest.models.defaultExpertModelId,
          judgeModelId: councilRequest.models.judgeModelId,
          expertModelOverrides: councilRequest.models.expertModelOverrides,
        },
        result,
      });
    } catch (error) {
      console.error('Council history could not be saved:', error);
      execution.warning = { code: 'HISTORY_SAVE_FAILED', message: 'The answer is ready, but this run could not be saved to history.' };
    }
    if (execution.status === 'running') {
      execution.status = 'complete';
      execution.stage = 'COMPLETE';
    }
  }).catch((error) => {
    if (execution.status === 'cancelled') return;
    execution.status = 'failed';
    execution.stage = 'FAILED';
    execution.error = safeError(error);
  });
});

app.get('/api/executions/:id', async (req, res) => {
  const execution = executions.get(req.params.id);
  if (execution) { res.json(publicExecution(execution)); return; }
  const record = await getSession(req.params.id);
  if (record) { res.json({ id: record.id, status: record.status ?? 'complete', stage: 'COMPLETE', result: record.result, createdAt: record.createdAt, events: [] }); return; }
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Execution not found.' } });
});

app.delete('/api/executions/:id', (req, res) => {
  const execution = executions.get(req.params.id);
  if (!execution) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Execution not found.' } }); return; }
  if (execution.status === 'running') {
    execution.status = 'cancelled';
    execution.stage = 'CANCELLED';
    execution.controller.abort();
  }
  res.json(publicExecution(execution));
});

app.get('/api/history', async (_req, res) => {
  try { res.json({ history: (await listSessions()).map((record) => summary(record as Record<string, unknown>)) }); }
  catch (error) { res.status(500).json({ error: safeError(error) }); }
});

app.get('/api/history/:id', async (req, res) => {
  const record = await getSession(req.params.id);
  if (record) { res.json(record); return; }
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Session not found.' } });
});

const dist = path.resolve('dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '127.0.0.1';
app.listen(port, host, () => console.log(`Council API listening on http://${host}:${port}`));
