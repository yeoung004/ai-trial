import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import type { CouncilRequest, CouncilResult, ModelConfig } from "../../shared/types";
import { runCouncil } from "../engine";
import { aiSdkModelAdapter } from "../engine/provider";
import { requireJudgeModel } from "../registry";
import { getModels } from "../storage";
import { EVALUATION_CASES, type EvaluationCase } from "./cases";

const baselineSchema = z.object({
  answer: z.string().trim().min(1).max(2_500),
  confidence: z.number().min(0).max(100),
  decision: z.enum(["YES", "NO"]).nullable(),
});

export interface EvaluationMetrics {
  answer: string;
  confidence: number;
  decision: "YES" | "NO" | null;
  referenceDecisionMatch: boolean | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number | null;
  latencyMs: number;
  callCount: number;
}

export type EvaluationArm =
  | { status: "complete"; metrics: EvaluationMetrics }
  | { status: "failed"; error: string; latencyMs: number };

export interface EvaluationReport {
  id: string;
  createdAt: string;
  models: { judgeModelId: string; expertModelId: string; roleGeneratorModelId: string };
  /** Usefulness and nuanced correctness are intentionally scored by a reviewer. */
  cases: Array<{
    id: string;
    mode: EvaluationCase["mode"];
    question: string;
    context?: string;
    criteria: string[];
    referenceDecision?: "YES" | "NO";
    baseline: EvaluationArm;
    council: EvaluationArm;
    review: {
      baseline: { usefulness1to5: number | null; correctness1to5: number | null };
      council: { usefulness1to5: number | null; correctness1to5: number | null };
    };
  }>;
}

export interface EvaluationOptions {
  judgeModelId: string;
  expertModelId: string;
  roleGeneratorModelId?: string;
  cases?: readonly EvaluationCase[];
}

function selectedModel(id: string, registry: readonly ModelConfig[]): ModelConfig {
  const model = registry.find((entry) => entry.id === id && entry.enabled);
  if (!model) throw new Error(`Evaluation model is unavailable or disabled: ${id}`);
  return model;
}

function pricedCost(model: ModelConfig, inputTokens: number, outputTokens: number): number | null {
  if (model.inputCostPerMillion === undefined || model.outputCostPerMillion === undefined) return null;
  return (
    inputTokens * model.inputCostPerMillion + outputTokens * model.outputCostPerMillion
  ) / 1_000_000;
}

function councilCost(result: CouncilResult, registry: readonly ModelConfig[]): number | null {
  let cost = 0;
  for (const call of result.usage.calls) {
    const model = registry.find((entry) => entry.id === call.modelId);
    if (!model) return null;
    const callCost = pricedCost(model, call.inputTokens, call.outputTokens);
    if (callCost === null) return null;
    cost += callCost;
  }
  return cost;
}

function councilAnswer(result: CouncilResult): { answer: string; decision: "YES" | "NO" | null } {
  if (result.mode === "YES_NO") {
    return {
      decision: result.judge.decision,
      answer: `${result.judge.decision}: ${result.judge.summary}\nMain reason: ${result.judge.main_reason}\nKey risk: ${result.judge.key_risk}`,
    };
  }
  return {
    decision: null,
    answer: `${result.judge.conclusion}\nWhy: ${result.judge.why_this_wins}\nCounterargument: ${result.judge.strongest_counterargument}\nRecommendation: ${result.judge.recommendation}`,
  };
}

function referenceMatch(reference: "YES" | "NO" | undefined, decision: "YES" | "NO" | null): boolean | null {
  return reference && decision ? reference === decision : null;
}

async function baselineArm(testCase: EvaluationCase, judge: ModelConfig): Promise<EvaluationArm> {
  const started = performance.now();
  try {
    const response = await aiSdkModelAdapter.generate({
      model: judge,
      stage: "judge",
      system: "Answer the user's question directly as one careful assistant. Give a concise, useful conclusion and calibrated confidence. Do not describe hidden reasoning. For a binary question, set decision to YES or NO; otherwise set it to null.",
      prompt: `Question: ${testCase.question}${testCase.context ? `\nContext: ${testCase.context}` : ""}\nMode: ${testCase.mode === "YES_NO" ? "binary decision" : "open debate"}`,
      schema: baselineSchema,
      maxOutputTokens: 800,
    });
    const { answer, confidence, decision } = response.object;
    return {
      status: "complete",
      metrics: {
        answer,
        confidence,
        decision,
        referenceDecisionMatch: referenceMatch(testCase.referenceDecision, decision),
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        totalTokens: response.inputTokens + response.outputTokens,
        costUsd: pricedCost(judge, response.inputTokens, response.outputTokens),
        latencyMs: response.latencyMs,
        callCount: 1,
      },
    };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : String(error), latencyMs: Math.round(performance.now() - started) };
  }
}

async function councilArm(
  testCase: EvaluationCase,
  registry: ModelConfig[],
  options: Required<Pick<EvaluationOptions, "judgeModelId" | "expertModelId" | "roleGeneratorModelId">>,
): Promise<EvaluationArm> {
  const request: CouncilRequest = {
    id: randomUUID(),
    mode: testCase.mode,
    question: testCase.question,
    ...(testCase.context && { context: testCase.context }),
    roleMode: "AUTO",
    models: {
      registry,
      roleGeneratorModelId: options.roleGeneratorModelId,
      defaultExpertModelId: options.expertModelId,
      judgeModelId: options.judgeModelId,
    },
    settings: { adaptiveCompute: "BALANCED" },
  };
  const started = performance.now();
  try {
    const result = await runCouncil(request, {});
    const answer = councilAnswer(result);
    return {
      status: "complete",
      metrics: {
        answer: answer.answer,
        confidence: result.judge.confidence,
        decision: answer.decision,
        referenceDecisionMatch: referenceMatch(testCase.referenceDecision, answer.decision),
        inputTokens: result.usage.totalInputTokens,
        outputTokens: result.usage.totalOutputTokens,
        totalTokens: result.usage.totalTokens,
        costUsd: councilCost(result, registry),
        latencyMs: Math.round(performance.now() - started),
        callCount: result.usage.totalCalls,
      },
    };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : String(error), latencyMs: Math.round(performance.now() - started) };
  }
}

/** Sequential arms avoid provider contention when comparing latency. */
export async function runEvaluation(options: EvaluationOptions): Promise<EvaluationReport> {
  const registry = await getModels();
  const judge = requireJudgeModel(options.judgeModelId, registry);
  selectedModel(options.expertModelId, registry);
  const roleGeneratorModelId = options.roleGeneratorModelId ?? options.expertModelId;
  selectedModel(roleGeneratorModelId, registry);
  const modelSelection = {
    judgeModelId: judge.id,
    expertModelId: options.expertModelId,
    roleGeneratorModelId,
  };
  const report: EvaluationReport = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    models: modelSelection,
    cases: [],
  };
  for (const testCase of options.cases ?? EVALUATION_CASES) {
    const baseline = await baselineArm(testCase, judge);
    const council = await councilArm(testCase, registry, modelSelection);
    report.cases.push({
      id: testCase.id,
      mode: testCase.mode,
      question: testCase.question,
      ...(testCase.context && { context: testCase.context }),
      criteria: [...testCase.criteria],
      ...(testCase.referenceDecision && { referenceDecision: testCase.referenceDecision }),
      baseline,
      council,
      review: {
        baseline: { usefulness1to5: null, correctness1to5: null },
        council: { usefulness1to5: null, correctness1to5: null },
      },
    });
  }
  return report;
}

export async function saveEvaluationReport(report: EvaluationReport): Promise<string> {
  const directory = path.join(process.env.COUNCIL_DATA_DIR ?? path.join(process.cwd(), "data"), "evals");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const target = path.join(directory, `${report.createdAt.replace(/[:.]/g, "-")}-${report.id}.json`);
  const temporary = `${target}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await rename(temporary, target);
    return target;
  } finally {
    await rm(temporary, { force: true });
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const argument = (name: string) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const judgeModelId = argument("--judge");
  const expertModelId = argument("--expert");
  const roleGeneratorModelId = argument("--role");
  const caseId = argument("--case");
  if (!judgeModelId || !expertModelId) {
    throw new Error("Usage: npx tsx src/server/evals/run.ts --judge MODEL_ID --expert MODEL_ID [--role MODEL_ID] [--case CASE_ID]");
  }
  const cases = caseId ? EVALUATION_CASES.filter((item) => item.id === caseId) : EVALUATION_CASES;
  if (!cases.length) throw new Error(`Unknown evaluation case: ${caseId}`);
  const report = await runEvaluation({ judgeModelId, expertModelId, roleGeneratorModelId, cases });
  const output = await saveEvaluationReport(report);
  console.log(`Evaluation saved to ${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
