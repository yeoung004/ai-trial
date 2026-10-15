import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type {
  CouncilRequest, CouncilResult, StageEvent, ModelCallUsage, UsageSummary,
  RoleGenerationResult, ExpertRole, RoleInput, ModelConfig, CallStage,
  YesNoExpertRun, YesNoCouncilResult, DebateExpertRun, DebateRound,
  DebateCouncilResult, CrossEvaluationResult, CrossEvaluationRun,
  TerminationReason, CouncilStage,
} from "../../shared/types.js";
import { aiSdkModelAdapter, type ModelAdapter, type StructuredResponse } from "./provider.js";
import {
  roleGenerationSchema, yesNoExpertSchema, yesNoJudgeSchema,
  debateExpertSchema, crossEvaluationSchema, debateJudgeSchema,
} from "./schemas.js";
import {
  CouncilError, binaryProposition, detectConsensus, disagreements,
  severeDisagreement, estimatedCost, rankCandidates, stancesCompatible,
  hasHighSeverityObjection,
} from "./logic.js";

export { CouncilError } from "./logic.js";
export type { ModelAdapter, StructuredCall, StructuredResponse } from "./provider.js";

export interface EngineLogEvent {
  sessionId: string;
  stage: CouncilStage | CallStage;
  model?: string;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number;
  retryCount?: number;
  terminationReason?: TerminationReason;
}

export interface CouncilDependencies {
  adapter?: ModelAdapter;
  signal?: AbortSignal;
  onStage?: (event: StageEvent) => void;
  logger?: (event: EngineLogEvent) => void;
}

type BudgetKey = "roleGenerator" | "yesNoExpert" | "debateInitial" | "debateRebuttal" | "crossEvaluation" | "judge";

const ROLE_SYSTEM = `You are the Role Architect for a multi-agent decision system. Do not answer the user's question. Select concrete, professionally distinct perspectives with minimal overlap. Optimize coverage rather than prestige. Preserve locked roles and generate only missing roles. Each reason is one sentence and each primary_question gives one focused responsibility. Return concise structured data only. Never provide hidden chain-of-thought.`;
const YES_NO_EXPERT_SYSTEM = `You are one specialist in a five-person expert council. Evaluate only from your assigned professional domain. You are not the final decision maker. Give a YES or NO vote, calibrated confidence, relevance and evidence strength from 0 to 100, a concise reason of at most two short sentences, and one critical caveat. Classify factual support as KNOWN, INFERRED, or UNCERTAIN. Do not provide hidden chain-of-thought.`;
const YES_NO_JUDGE_SYSTEM = `You are the Final Judge. Weigh specialist positions by relevance, evidence strength, confidence calibration, logical consistency, professional scope and caveats. Do not blindly follow the vote count. Resolve contradictions and penalize unsupported certainty. Decide YES or NO with a concise summary, main reason and key risk. Do not provide hidden chain-of-thought.`;
const DEBATE_INITIAL_SYSTEM = `You are an independent specialist in a three-person expert council. The other specialists' opinions are hidden in Round 1. Give your strongest professional position in a compact structured answer. Distinguish known facts, inference and uncertainty. Do not predict consensus or provide hidden chain-of-thought. Limit the stance to 25 words, claims to 3, evidence to 2 items, and new_information to 2 items.`;
const DEBATE_REBUTTAL_SYSTEM = `You are a specialist in a structured debate. Address only the strongest unresolved disagreement or genuinely new evidence. Do not restate arguments unless needed to answer a new objection. State whether your position changed and what new information mattered. Keep all fields concise. Do not provide hidden chain-of-thought.`;
const CROSS_EVALUATION_SYSTEM = `Assess only the other experts' candidate positions, never your own. For each candidate give accuracy, relevance and evidence scores from 0 to 100 and one very short fatal flaw or an empty string if none. Do not provide hidden chain-of-thought.`;
const DEBATE_JUDGE_SYSTEM = `You are the Final Judge of a structured expert debate. Review expert relevance, evidence quality, unresolved objections, confidence calibration, apparent consensus and overlooked domains. Candidate ranking is advisory only. Give a concise final conclusion, strongest reason, strongest counterargument, why it wins and practical recommendation. Do not provide hidden chain-of-thought.`;

const inputEstimate: Record<CallStage, number> = {
  role_generation: 350,
  yes_no_expert: 500,
  debate_initial: 500,
  debate_rebuttal: 800,
  cross_evaluation: 650,
  judge: 1400,
};

class Execution {
  readonly sessionId: string;
  readonly createdAt = new Date().toISOString();
  readonly startTime = Date.now();
  readonly calls: ModelCallUsage[] = [];
  readonly adapter: ModelAdapter;
  readonly failedExpertIndices = new Set<number>();
  degraded = false;

  constructor(readonly request: CouncilRequest, readonly deps: CouncilDependencies) {
    this.sessionId = request?.id?.trim() || randomUUID();
    this.adapter = deps.adapter ?? aiSdkModelAdapter;
  }

  throwIfAborted() {
    if (this.deps.signal?.aborted) throw new CouncilError("CANCELLED", "Council execution was cancelled.");
  }

  emit(stage: CouncilStage, message?: string, round?: number) {
    const event: StageEvent = { sessionId: this.sessionId, stage, at: new Date().toISOString(), ...(message ? { message } : {}), ...(round ? { round } : {}) };
    try { this.deps.onStage?.(event); } catch { /* UI callbacks cannot alter council execution. */ }
    this.log({ sessionId: this.sessionId, stage });
  }

  log(event: EngineLogEvent) {
    try {
      if (this.deps.logger) this.deps.logger(event);
      else if (process.env.NODE_ENV === "development") console.debug("[council]", event);
    } catch { /* Observability must not alter execution. */ }
  }

  model(id: string | undefined, kind: "judge" | "other" = "other"): ModelConfig {
    if (!id?.trim()) {
      throw new CouncilError(kind === "judge" ? "JUDGE_MODEL_REQUIRED" : "MODEL_NOT_AVAILABLE", kind === "judge" ? "Configure a Final Judge model before running a council." : "Configure a model for this stage.");
    }
    const model = this.request.models.registry.find((item) => item.id === id && item.enabled);
    if (!model) throw new CouncilError("MODEL_NOT_AVAILABLE", `Model ${id} is not in the enabled registry.`, { modelId: id });
    return model;
  }

  budget(key: BudgetKey): number {
    const adaptive = this.request.settings?.adaptiveCompute ?? "BALANCED";
    const defaults: Record<BudgetKey, number> = {
      roleGenerator: 320,
      yesNoExpert: adaptive === "LOW" ? 100 : 120,
      debateInitial: adaptive === "LOW" ? 180 : 220,
      debateRebuttal: adaptive === "LOW" ? 110 : 140,
      crossEvaluation: 100,
      judge: adaptive === "LOW" ? 500 : adaptive === "HIGH" ? 800 : 650,
    };
    const value = this.request.settings?.tokenBudgets?.[key] ?? defaults[key];
    if (!Number.isInteger(value) || value < 50 || value > 2000) {
      throw new CouncilError("INVALID_REQUEST", `${key} output token budget must be between 50 and 2000.`);
    }
    return value;
  }

  usage(): UsageSummary {
    const totalInputTokens = this.calls.reduce((sum, call) => sum + call.inputTokens, 0);
    const totalOutputTokens = this.calls.reduce((sum, call) => sum + call.outputTokens, 0);
    return {
      calls: [...this.calls], totalCalls: this.calls.length,
      totalInputTokens, totalOutputTokens, totalTokens: totalInputTokens + totalOutputTokens,
      totalCost: this.calls.reduce((sum, call) => sum + call.estimatedCost, 0),
      costComplete: this.calls.every((call) => call.costKnown),
      totalLatencyMs: Date.now() - this.startTime,
    };
  }

  async call<T>(args: {
    model: ModelConfig; stage: CallStage; system: string; prompt: string;
    schema: z.ZodType<T>; maxOutputTokens: number; expertIndex?: number; round?: number;
    validate?: (object: T) => void;
  }): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt++) {
      this.throwIfAborted();
      const started = performance.now();
      let response: StructuredResponse<T> | undefined;
      try {
        response = await this.adapter.generate<T>({
          model: args.model, stage: args.stage, system: args.system,
          prompt: args.prompt, schema: args.schema,
          maxOutputTokens: args.maxOutputTokens, signal: this.deps.signal,
        });
        const object = args.schema.parse(response.object);
        args.validate?.(object);
        const entry: ModelCallUsage = {
          provider: args.model.provider, model: args.model.model, modelId: args.model.id,
          stage: args.stage, expertIndex: args.expertIndex, round: args.round,
          attempt, success: true, inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          estimatedCost: estimatedCost(args.model, response.inputTokens, response.outputTokens),
          costKnown: args.model.inputCostPerMillion !== undefined && args.model.outputCostPerMillion !== undefined,
          latencyMs: response.latencyMs || Math.round(performance.now() - started),
        };
        this.calls.push(entry);
        this.log({ sessionId: this.sessionId, stage: args.stage, model: args.model.id, latencyMs: entry.latencyMs, inputTokens: entry.inputTokens, outputTokens: entry.outputTokens, estimatedCost: entry.estimatedCost, retryCount: attempt - 1 });
        return object;
      } catch (error) {
        lastError = error;
        const latencyMs = Math.round(performance.now() - started);
        const entry: ModelCallUsage = {
          provider: args.model.provider, model: args.model.model, modelId: args.model.id,
          stage: args.stage, expertIndex: args.expertIndex, round: args.round,
          attempt, success: false,
          inputTokens: response?.inputTokens ?? 0,
          outputTokens: response?.outputTokens ?? 0,
          estimatedCost: response ? estimatedCost(args.model, response.inputTokens, response.outputTokens) : 0,
          latencyMs: response?.latencyMs || latencyMs,
          costKnown: !!response && args.model.inputCostPerMillion !== undefined && args.model.outputCostPerMillion !== undefined,
          error: error instanceof Error ? error.name : "ProviderError",
        };
        this.calls.push(entry);
        this.log({ sessionId: this.sessionId, stage: args.stage, model: args.model.id, latencyMs, retryCount: attempt - 1 });
        this.throwIfAborted();
      }
    }
    throw lastError;
  }

  roleInput(role: RoleInput, index: number): ExpertRole {
    const title = role.title?.trim();
    if (!title) throw new CouncilError("INVALID_REQUEST", `Expert role ${index + 1} needs a title.`);
    return {
      id: `expert-${index + 1}`, title,
      domain: role.domain?.trim() || title,
      reason: role.reason?.trim() || "Selected by the user for this council.",
      primaryQuestion: role.primaryQuestion?.trim() || `What does ${title} expertise imply for this decision?`,
      ...(role.instructions?.trim() ? { instructions: role.instructions.trim() } : {}),
      ...(role.modelOverride ? { modelOverride: role.modelOverride } : {}),
    };
  }

  validateRoles(roles: ExpertRole[], count: number): ExpertRole[] {
    if (roles.length !== count) throw new CouncilError("INVALID_REQUEST", `This mode requires exactly ${count} expert roles.`);
    const seen = new Set<string>();
    const ids = new Set<string>();
    for (const [index, role] of roles.entries()) {
      if (!role.id?.trim() || !role.title?.trim() || !role.domain?.trim() || !role.primaryQuestion?.trim()) {
        throw new CouncilError("INVALID_REQUEST", `Expert role ${index + 1} is incomplete.`);
      }
      if (ids.has(role.id)) throw new CouncilError("INVALID_REQUEST", "Expert role IDs must be unique.");
      ids.add(role.id);
      const key = role.title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
      if (seen.has(key)) throw new CouncilError("INVALID_REQUEST", "Expert roles must have distinct titles.");
      seen.add(key);
    }
    return roles;
  }

  async generateRoles(): Promise<ExpertRole[]> {
    const count = this.request.mode === "YES_NO" ? 5 : 3;
    if (this.request.approvedRoles) return this.validateRoles(this.request.approvedRoles, count);
    const input = this.request.roles ?? [];
    if (input.length > count) throw new CouncilError("INVALID_REQUEST", `This mode accepts at most ${count} roles.`);
    if (this.request.roleMode === "MANUAL") {
      return this.validateRoles(input.map((role, index) => this.roleInput(role, index)), count);
    }
    const slots = this.request.roleMode === "HYBRID" ? input.map((role, index) => role.locked === false ? null : this.roleInput(role, index)) : [];
    const locked = slots.filter((role): role is ExpertRole => role !== null);
    const needed = count - locked.length;
    if (needed === 0) return this.validateRoles(locked, count);
    this.emit("GENERATING_ROLES");
    const model = this.model(this.request.models.roleGeneratorModelId || this.request.models.defaultExpertModelId);
    const schema = roleGenerationSchema(needed);
    let generated: z.infer<typeof schema>;
    try {
      generated = await this.call({
        model, stage: "role_generation", system: ROLE_SYSTEM,
        prompt: JSON.stringify({ question: this.request.question, lockedRoles: locked.map((role) => ({ title: role.title, domain: role.domain, primaryQuestion: role.primaryQuestion })), generateCount: needed }),
        schema, maxOutputTokens: this.budget("roleGenerator"),
        validate: (object) => {
          const names = [...locked.map((role) => role.title), ...object.roles.map((role) => role.role)].map((name) => name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""));
          if (new Set(names).size !== names.length) throw new Error("Duplicate generated roles");
        },
      });
    } catch {
      this.throwIfAborted();
      throw new CouncilError("ROLE_GENERATION_FAILED", "The Role Generator could not produce valid distinct expert roles.");
    }
    const queue = [...generated.roles];
    const combined: ExpertRole[] = [];
    for (let index = 0; index < count; index++) {
      const existing = slots[index];
      if (existing) combined.push(existing);
      else {
        const next = queue.shift()!;
        combined.push({ id: `expert-${index + 1}`, title: next.role, domain: next.domain, reason: next.reason, primaryQuestion: next.primary_question });
      }
    }
    return this.validateRoles(combined, count);
  }

  expertModel(role: ExpertRole, index: number): ModelConfig {
    const override = role.modelOverride || this.request.models.expertModelOverrides?.[index];
    return this.model(override || this.request.models.defaultExpertModelId);
  }

  estimatedJudgeCost(): number {
    const model = this.model(this.request.models.judgeModelId, "judge");
    this.ensurePricing(model);
    return estimatedCost(model, inputEstimate.judge, this.budget("judge"));
  }

  ensurePricing(model: ModelConfig) {
    if (this.request.settings?.maxCost !== undefined &&
      (model.inputCostPerMillion === undefined || model.outputCostPerMillion === undefined ||
        !Number.isFinite(model.inputCostPerMillion) || !Number.isFinite(model.outputCostPerMillion) ||
        model.inputCostPerMillion < 0 || model.outputCostPerMillion < 0)) {
      throw new CouncilError("BUDGET_EXCEEDED", "A cost limit requires input and output pricing for every selected model.", { modelId: model.id });
    }
  }

  estimatedRoleCost(): number {
    if (this.request.approvedRoles || this.request.roleMode === "MANUAL") return 0;
    const count = this.request.mode === "YES_NO" ? 5 : 3;
    const locked = this.request.roleMode === "HYBRID" ? (this.request.roles ?? []).filter((role) => role.locked !== false).length : 0;
    if (locked >= count) return 0;
    const model = this.model(this.request.models.roleGeneratorModelId || this.request.models.defaultExpertModelId);
    this.ensurePricing(model);
    return estimatedCost(model, inputEstimate.role_generation, this.budget("roleGenerator"));
  }

  preflightBudget(roles?: ExpertRole[]) {
    const limit = this.request.settings?.maxCost;
    if (limit === undefined) return;
    if (!Number.isFinite(limit) || limit <= 0) throw new CouncilError("INVALID_REQUEST", "Maximum cost must be a positive dollar amount.");
    const count = this.request.mode === "YES_NO" ? 5 : 3;
    let estimate = this.estimatedJudgeCost() + this.estimatedRoleCost();
    for (let index = 0; index < count; index++) {
      const roleOverride = this.request.roles?.[index]?.modelOverride;
      const model = roles?.[index] ? this.expertModel(roles[index], index) : this.model(roleOverride || this.request.models.expertModelOverrides?.[index] || this.request.models.defaultExpertModelId);
      this.ensurePricing(model);
      const stage: CallStage = this.request.mode === "YES_NO" ? "yes_no_expert" : "debate_initial";
      estimate += estimatedCost(model, inputEstimate[stage], this.budget(this.request.mode === "YES_NO" ? "yesNoExpert" : "debateInitial"));
    }
    if (estimate > limit) {
      throw new CouncilError("BUDGET_EXCEEDED", "The estimated mandatory council calls exceed the cost limit.", { estimatedCost: estimate, maxCost: limit });
    }
  }

  canAffordOptional(stage: "debate_rebuttal" | "cross_evaluation", runs: DebateExpertRun[]): boolean {
    const limit = this.request.settings?.maxCost;
    if (limit === undefined) return true;
    const key = stage === "debate_rebuttal" ? "debateRebuttal" : "crossEvaluation";
    const optional = runs.reduce((sum, run) => {
      const model = this.expertModel(run.role, run.expertIndex);
      this.ensurePricing(model);
      return sum + estimatedCost(model, inputEstimate[stage], this.budget(key));
    }, 0);
    return this.usage().totalCost + optional + this.estimatedJudgeCost() <= limit;
  }

  async judge<T>(schema: z.ZodType<T>, system: string, prompt: string): Promise<T> {
    this.throwIfAborted();
    this.emit("JUDGING");
    try {
      return await this.call({ model: this.model(this.request.models.judgeModelId, "judge"), stage: "judge", system, prompt, schema, maxOutputTokens: this.budget("judge") });
    } catch {
      this.throwIfAborted();
      throw new CouncilError("JUDGE_FAILED", "The Final Judge failed after one retry. No final answer was produced.");
    }
  }
}

function validateRequest(execution: Execution, requireJudge: boolean) {
  const { request } = execution;
  if (!request || !["YES_NO", "DEBATE"].includes(request.mode) || !["AUTO", "MANUAL", "HYBRID"].includes(request.roleMode)) {
    throw new CouncilError("INVALID_REQUEST", "Choose a valid council mode and role mode.");
  }
  if (!request.question?.trim() || request.question.length > 10000 || (request.context?.length ?? 0) > 20000) {
    throw new CouncilError("INVALID_REQUEST", "Question or context is missing or too long.");
  }
  if (!Array.isArray(request.models?.registry)) throw new CouncilError("INVALID_REQUEST", "A model registry is required.");
  const ids = request.models.registry.map((model) => model.id);
  if (new Set(ids).size !== ids.length) throw new CouncilError("INVALID_REQUEST", "Model registry IDs must be unique.");
  if (requireJudge) execution.model(request.models.judgeModelId, "judge");
  execution.model(request.models.defaultExpertModelId);
}

function words(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function validateDebateBrevity(answer: { stance: string; core_claims: string[]; strongest_evidence: string[]; main_objection: string; new_information: string[]; remaining_uncertainty: string }) {
  if (words(answer.stance) > 25 || answer.core_claims.some((claim) => words(claim) > 30) ||
    answer.strongest_evidence.some((item) => words(item) > 30) || words(answer.main_objection) > 40 ||
    answer.new_information.some((item) => words(item) > 30) || words(answer.remaining_uncertainty) > 30) {
    throw new Error("Debate output exceeded the concise field limits");
  }
}

export async function generateRoles(request: CouncilRequest, dependencies: CouncilDependencies = {}): Promise<RoleGenerationResult> {
  const execution = new Execution(request, dependencies);
  try {
    execution.emit("ANALYZING");
    validateRequest(execution, false);
    execution.throwIfAborted();
    const roles = await execution.generateRoles();
    execution.emit("COMPLETE");
    return { roles, usage: execution.usage() };
  } catch (error) {
    execution.emit("FAILED");
    throw error;
  }
}

async function runYesNo(execution: Execution, roles: ExpertRole[], proposition: string): Promise<YesNoCouncilResult> {
  const { request } = execution;
  execution.emit("RUNNING_EXPERTS");
  const settled = await Promise.allSettled(roles.map(async (role, expertIndex): Promise<YesNoExpertRun> => {
    const model = execution.expertModel(role, expertIndex);
    const answer = await execution.call({
      model, stage: "yes_no_expert", expertIndex, system: YES_NO_EXPERT_SYSTEM,
      prompt: JSON.stringify({ originalQuestion: request.question, binaryProposition: proposition, context: request.context, assignedRole: role.title, domain: role.domain, responsibility: role.primaryQuestion, customInstructions: role.instructions }),
      schema: yesNoExpertSchema, maxOutputTokens: execution.budget("yesNoExpert"),
      validate: (object) => {
        if (words(object.reason) > 50 || words(object.critical_caveat) > 25) throw new Error("YES / NO output exceeded the concise field limits");
      },
    });
    return { expertId: role.id, expertIndex, role, modelId: model.id, answer };
  }));
  execution.throwIfAborted();
  const experts = settled.flatMap((item, index) => {
    if (item.status === "fulfilled") return [item.value];
    execution.degraded = true;
    execution.failedExpertIndices.add(index);
    return [];
  });
  if (experts.length < 4) throw new CouncilError("EXPERT_QUORUM_FAILED", "Fewer than four YES / NO experts returned valid results.");
  const expert_consensus = {
    yes: experts.filter((run) => run.answer.vote === "YES").length,
    no: experts.filter((run) => run.answer.vote === "NO").length,
  };
  const judge = await execution.judge(yesNoJudgeSchema, YES_NO_JUDGE_SYSTEM, JSON.stringify({
    originalQuestion: request.question, binaryProposition: proposition, context: request.context,
    failedExperts: [...execution.failedExpertIndices].map((index) => `Expert ${String.fromCharCode(65 + index)}`),
    experts: experts.map((run) => ({ expert: `Expert ${String.fromCharCode(65 + run.expertIndex)}`, profession: run.role.title, domain: run.role.domain, primaryQuestion: run.role.primaryQuestion, ...run.answer })),
  }));
  const terminationReason: TerminationReason = "YES_NO_COMPLETE";
  execution.log({ sessionId: execution.sessionId, stage: "COMPLETE", terminationReason });
  execution.emit("COMPLETE");
  return {
    status: "complete", mode: "YES_NO", sessionId: execution.sessionId,
    question: request.question, binaryProposition: proposition, roles, experts,
    judge: { ...judge, expert_consensus }, usage: execution.usage(),
    degraded: execution.degraded, failedExpertIndices: [...execution.failedExpertIndices],
    terminationReason, createdAt: execution.createdAt,
  };
}

async function debateRound(execution: Execution, roles: ExpertRole[], round: number, previous: DebateExpertRun[], dispute: string[]): Promise<DebateExpertRun[]> {
  const { request } = execution;
  execution.emit(round === 1 ? "ROUND_1" : round === 2 ? "ROUND_2" : "ROUND_3", undefined, round);
  const active = round === 1 ? roles.map((role, expertIndex) => ({ role, expertIndex })) : previous.map((run) => ({ role: run.role, expertIndex: run.expertIndex }));
  const settled = await Promise.allSettled(active.map(async ({ role, expertIndex }): Promise<DebateExpertRun> => {
    const model = execution.expertModel(role, expertIndex);
    const own = previous.find((run) => run.expertIndex === expertIndex);
    const prompt = round === 1
      ? { question: request.question, context: request.context, role: role.title, domain: role.domain, responsibility: role.primaryQuestion, customInstructions: role.instructions, round: 1 }
      : {
          question: request.question, context: request.context, role: role.title, responsibility: role.primaryQuestion, customInstructions: role.instructions, round,
          ownPreviousPosition: own?.answer,
          otherPositions: previous.filter((run) => run.expertIndex !== expertIndex).map((run) => ({ expert: `Expert ${String.fromCharCode(65 + run.expertIndex)}`, stance: run.answer.stance, confidence: run.answer.confidence, core_claims: run.answer.core_claims, strongest_evidence: run.answer.strongest_evidence, main_objection: run.answer.main_objection })),
          unresolvedDisagreements: dispute,
        };
    const answer = await execution.call({
      model, stage: round === 1 ? "debate_initial" : "debate_rebuttal", expertIndex, round,
      system: round === 1 ? DEBATE_INITIAL_SYSTEM : DEBATE_REBUTTAL_SYSTEM,
      prompt: JSON.stringify(prompt), schema: debateExpertSchema,
      maxOutputTokens: execution.budget(round === 1 ? "debateInitial" : "debateRebuttal"),
      validate: validateDebateBrevity,
    });
    return { expertId: role.id, expertIndex, role, modelId: model.id, round, answer };
  }));
  execution.throwIfAborted();
  const successful = settled.flatMap((item, index) => {
    if (item.status === "fulfilled") return [item.value];
    execution.degraded = true;
    execution.failedExpertIndices.add(active[index].expertIndex);
    return [];
  });
  if (round === 1 && successful.length < 2) throw new CouncilError("EXPERT_QUORUM_FAILED", "Fewer than two debate experts returned valid results.");
  if (round === 1) return successful;
  return previous.map((run) => successful.find((next) => next.expertIndex === run.expertIndex) ?? run);
}

async function crossEvaluate(execution: Execution, finalRuns: DebateExpertRun[]): Promise<CrossEvaluationResult> {
  execution.emit("CROSS_EVALUATION");
  const settled = await Promise.allSettled(finalRuns.map(async (run): Promise<CrossEvaluationRun> => {
    const candidates = finalRuns.filter((other) => other.expertId !== run.expertId);
    const response = await execution.call({
      model: execution.expertModel(run.role, run.expertIndex), stage: "cross_evaluation",
      expertIndex: run.expertIndex, system: CROSS_EVALUATION_SYSTEM,
      prompt: JSON.stringify({ question: execution.request.question, evaluatorRole: run.role.title, candidates: candidates.map((candidate) => ({ candidate_id: candidate.expertId, stance: candidate.answer.stance, claims: candidate.answer.core_claims, evidence: candidate.answer.strongest_evidence, objection: candidate.answer.main_objection })) }),
      schema: crossEvaluationSchema(candidates.length),
      maxOutputTokens: execution.budget("crossEvaluation"),
      validate: (object) => {
        const expected = candidates.map((candidate) => candidate.expertId).sort();
        const received = object.evaluations.map((evaluation) => evaluation.candidate_id).sort();
        if (expected.join("|") !== received.join("|")) throw new Error("Invalid candidate IDs in cross-evaluation");
      },
    });
    return { evaluatorId: run.expertId, evaluatorIndex: run.expertIndex, evaluations: response.evaluations };
  }));
  execution.throwIfAborted();
  const runs = settled.flatMap((item) => item.status === "fulfilled" ? [item.value] : []);
  if (runs.length < finalRuns.length) execution.degraded = true;
  const scores = rankCandidates(finalRuns, runs, execution.request.settings?.candidateWeights);
  return { runs, scores, leadingCandidateId: runs.length ? scores[0]?.candidateId : undefined };
}

async function runDebate(execution: Execution, roles: ExpertRole[]): Promise<DebateCouncilResult> {
  const { request } = execution;
  const consensusOptions = request.settings?.consensus ?? {};
  let finalRuns = await debateRound(execution, roles, 1, [], []);
  const rounds: DebateRound[] = [];
  let terminationReason: TerminationReason = "MAX_ROUNDS";
  const majorityStance = (runs: DebateExpertRun[]) => runs.find((candidate) => runs.filter((run) => stancesCompatible(run.answer.stance, candidate.answer.stance, consensusOptions.stanceSimilarity)).length >= 2)?.answer.stance ?? "";
  let previousMajority = majorityStance(finalRuns);
  let unchangedStreak = 0;
  const adaptive = request.settings?.adaptiveCompute ?? "BALANCED";
  const maxRounds = request.settings?.maxDebateRounds ?? (adaptive === "LOW" ? 2 : 3);
  if (![1, 2, 3].includes(maxRounds)) throw new CouncilError("INVALID_REQUEST", "Debate rounds must be between one and three.");

  for (let round = 1; round <= maxRounds; round++) {
    execution.emit("CHECK_CONSENSUS", undefined, round);
    const consensus = detectConsensus(finalRuns, consensusOptions);
    const dispute = disagreements(finalRuns, consensusOptions.stanceSimilarity);
    rounds.push({ round, experts: [...finalRuns], consensus, disagreements: dispute });
    if (consensus) {
      terminationReason = `CONSENSUS_ROUND_${round}` as TerminationReason;
      break;
    }
    if (round >= maxRounds) { terminationReason = "MAX_ROUNDS"; break; }
    if (adaptive === "LOW" && round === 1 && !severeDisagreement(finalRuns, consensusOptions.stanceSimilarity)) {
      terminationReason = "MAX_ROUNDS";
      break;
    }
    if (round === 2 && adaptive === "BALANCED" && !severeDisagreement(finalRuns, consensusOptions.stanceSimilarity)) {
      terminationReason = "MAX_ROUNDS";
      break;
    }
    if (!execution.canAffordOptional("debate_rebuttal", finalRuns)) {
      terminationReason = "BUDGET_LIMIT";
      break;
    }
    const prior = finalRuns;
    finalRuns = await debateRound(execution, roles, round + 1, prior, dispute);
    if (detectConsensus(finalRuns, consensusOptions)) continue;
    const changed = finalRuns.some((run) => {
      const before = prior.find((old) => old.expertId === run.expertId);
      return !!before && (run.answer.changed_mind || !stancesCompatible(before.answer.stance, run.answer.stance, 0.95));
    });
    const newInformation = finalRuns.some((run) => run.round === round + 1 && run.answer.new_information.length > 0);
    unchangedStreak = changed ? 0 : unchangedStreak + 1;
    const majority = majorityStance(finalRuns);
    const stableMajority = majority && previousMajority && stancesCompatible(majority, previousMajority, consensusOptions.stanceSimilarity);
    const highConfidenceContradiction = !!majority && finalRuns.some((run) => run.answer.confidence >= 75 && !stancesCompatible(run.answer.stance, majority, consensusOptions.stanceSimilarity));
    previousMajority = majority;
    if (round + 1 >= 2 && !changed && !newInformation) {
      execution.emit("CHECK_CONSENSUS", undefined, round + 1);
      rounds.push({ round: round + 1, experts: [...finalRuns], consensus: false, disagreements: disagreements(finalRuns, consensusOptions.stanceSimilarity) });
      terminationReason = "NO_NEW_INFORMATION";
      break;
    }
    if (unchangedStreak >= 2) {
      execution.emit("CHECK_CONSENSUS", undefined, round + 1);
      rounds.push({ round: round + 1, experts: [...finalRuns], consensus: false, disagreements: disagreements(finalRuns, consensusOptions.stanceSimilarity) });
      terminationReason = "STABLE_POSITIONS";
      break;
    }
    if (stableMajority && !highConfidenceContradiction && !finalRuns.some((run) => run.answer.confidence >= 75 && hasHighSeverityObjection(run))) {
      execution.emit("CHECK_CONSENSUS", undefined, round + 1);
      rounds.push({ round: round + 1, experts: [...finalRuns], consensus: false, disagreements: disagreements(finalRuns, consensusOptions.stanceSimilarity) });
      terminationReason = "STABLE_MAJORITY";
      break;
    }
    // Round 3 is only useful after Round 2 contributed new evidence or a changed position.
    if (round + 1 === 2 && !newInformation && !changed) break;
  }

  execution.throwIfAborted();
  const hasConsensus = rounds.at(-1)?.consensus ?? false;
  let crossEvaluation: CrossEvaluationResult | undefined;
  if (!hasConsensus) {
    if (execution.canAffordOptional("cross_evaluation", finalRuns)) {
      crossEvaluation = await crossEvaluate(execution, finalRuns);
    } else {
      terminationReason = "BUDGET_LIMIT";
    }
  }
  const judge = await execution.judge(debateJudgeSchema, DEBATE_JUDGE_SYSTEM, JSON.stringify({
    question: request.question, context: request.context,
    failedExperts: [...execution.failedExpertIndices].map((index) => `Expert ${String.fromCharCode(65 + index)}`),
    consensus: hasConsensus,
    finalPositions: finalRuns.map((run) => ({ expert: `Expert ${String.fromCharCode(65 + run.expertIndex)}`, candidate_id: run.expertId, profession: run.role.title, domain: run.role.domain, primaryQuestion: run.role.primaryQuestion, ...run.answer })),
    unresolvedDisagreements: hasConsensus ? [] : disagreements(finalRuns, consensusOptions.stanceSimilarity),
    crossEvaluation,
    leadingCandidateId: crossEvaluation?.leadingCandidateId,
    candidateScores: crossEvaluation?.scores,
  }));
  execution.log({ sessionId: execution.sessionId, stage: "COMPLETE", terminationReason });
  execution.emit("COMPLETE");
  return {
    status: "complete", mode: "DEBATE", sessionId: execution.sessionId,
    question: request.question, roles, experts: finalRuns, rounds, crossEvaluation,
    judge, usage: execution.usage(), degraded: execution.degraded,
    failedExpertIndices: [...execution.failedExpertIndices], terminationReason,
    createdAt: execution.createdAt,
  };
}

export async function runCouncil(request: CouncilRequest, dependencies: CouncilDependencies = {}): Promise<CouncilResult> {
  const execution = new Execution(request, dependencies);
  try {
    execution.emit("ANALYZING");
    validateRequest(execution, true);
    execution.throwIfAborted();
    const proposition = request.mode === "YES_NO" ? binaryProposition(request.question) : undefined;
    execution.preflightBudget();
    const roles = await execution.generateRoles();
    execution.preflightBudget(roles);
    execution.throwIfAborted();
    return request.mode === "YES_NO" ? await runYesNo(execution, roles, proposition!) : await runDebate(execution, roles);
  } catch (error) {
    execution.emit("FAILED");
    if (error instanceof CouncilError) throw error;
    if (dependencies.signal?.aborted) throw new CouncilError("CANCELLED", "Council execution was cancelled.");
    throw new CouncilError("ENGINE_FAILED", "Council execution failed unexpectedly.");
  }
}
