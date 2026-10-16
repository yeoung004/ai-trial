import {
  estimatedJudgeCost,
  ensurePricing,
  estimatedRoleCost,
  preflightBudget,
  canAffordOptional,
} from "./BudgetController.js";
import { generateRoles } from "./RoleGenerator.js";
import { runJudge } from "./JudgeRunner.js";

import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type {
  CouncilRequest,
  StageEvent,
  ModelCallUsage,
  UsageSummary,
  ExpertRole,
  ModelConfig,
  CallStage,
  DebateExpertRun,
  CouncilStage,
} from "../../shared/types.js";
import {
  aiSdkModelAdapter,
  type ModelAdapter,
  type StructuredResponse,
} from "./provider.js";

import { CouncilError, estimatedCost } from "./logic.js";

import type { CouncilDependencies, EngineLogEvent } from "./index.js";
type BudgetKey =
  | "roleGenerator"
  | "yesNoExpert"
  | "debateInitial"
  | "debateRebuttal"
  | "crossEvaluation"
  | "judge";

export class Execution {
  readonly sessionId: string;
  readonly createdAt = new Date().toISOString();
  readonly startTime = Date.now();
  readonly calls: ModelCallUsage[] = [];
  readonly adapter: ModelAdapter;
  readonly failedExpertIndices = new Set<number>();
  degraded = false;

  constructor(
    readonly request: CouncilRequest,
    readonly deps: CouncilDependencies,
  ) {
    this.sessionId = request?.id?.trim() || randomUUID();
    this.adapter = deps.adapter ?? aiSdkModelAdapter;
  }

  throwIfAborted() {
    if (this.deps.signal?.aborted)
      throw new CouncilError("CANCELLED", "Council execution was cancelled.");
  }

  emit(
    stage: CouncilStage,
    message?: string,
    round?: number,
    roles?: ExpertRole[],
  ) {
    const event: StageEvent = {
      sessionId: this.sessionId,
      stage,
      at: new Date().toISOString(),
      ...(message ? { message } : {}),
      ...(round ? { round } : {}),
      ...(roles ? { roles } : {}),
    };
    try {
      this.deps.onStage?.(event);
    } catch {
      /* UI callbacks cannot alter council execution. */
    }
    this.log({ sessionId: this.sessionId, stage });
  }

  event(
    type: NonNullable<StageEvent["type"]>,
    details: Partial<StageEvent> = {},
  ) {
    try {
      this.deps.onStage?.({
        sessionId: this.sessionId,
        stage: type.startsWith("JUDGE") ? "JUDGING" : "RUNNING_EXPERTS",
        at: new Date().toISOString(),
        type,
        ...details,
      });
    } catch {
      /* Rendering cannot alter execution. */
    }
  }

  log(event: EngineLogEvent) {
    try {
      if (this.deps.logger) this.deps.logger(event);
      else if (process.env.NODE_ENV === "development")
        console.debug("[council]", event);
    } catch {
      /* Observability must not alter execution. */
    }
  }

  model(
    id: string | undefined,
    kind: "judge" | "other" = "other",
  ): ModelConfig {
    if (!id?.trim()) {
      throw new CouncilError(
        kind === "judge" ? "JUDGE_MODEL_REQUIRED" : "MODEL_NOT_AVAILABLE",
        kind === "judge"
          ? "Configure a Final Judge model before running a council."
          : "Configure a model for this stage.",
      );
    }
    const model = this.request.models.registry.find(
      (item) => item.id === id && item.enabled,
    );
    if (!model)
      throw new CouncilError(
        "MODEL_NOT_AVAILABLE",
        `Model ${id} is not in the enabled registry.`,
        { modelId: id },
      );
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
      throw new CouncilError(
        "INVALID_REQUEST",
        `${key} output token budget must be between 50 and 2000.`,
      );
    }
    return value;
  }

  usage(): UsageSummary {
    const totalInputTokens = this.calls.reduce(
      (sum, call) => sum + call.inputTokens,
      0,
    );
    const totalOutputTokens = this.calls.reduce(
      (sum, call) => sum + call.outputTokens,
      0,
    );
    return {
      calls: [...this.calls],
      totalCalls: this.calls.length,
      totalInputTokens,
      totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      totalCost: this.calls.reduce((sum, call) => sum + call.estimatedCost, 0),
      costComplete: this.calls.every((call) => call.costKnown),
      totalLatencyMs: Date.now() - this.startTime,
    };
  }

  async call<T>(args: {
    model: ModelConfig;
    stage: CallStage;
    system: string;
    prompt: string;
    schema: z.ZodType<T>;
    maxOutputTokens: number;
    expertIndex?: number;
    round?: number;
    validate?: (object: T) => void;
  }): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt++) {
      this.throwIfAborted();
      const started = performance.now();
      let response: StructuredResponse<T> | undefined;
      try {
        response = await this.adapter.generate<T>({
          model: args.model,
          stage: args.stage,
          system: args.system,
          prompt: args.prompt,
          schema: args.schema,
          maxOutputTokens: args.maxOutputTokens,
          signal: this.deps.signal,
        });
        const object = args.schema.parse(response.object);
        args.validate?.(object);
        const entry: ModelCallUsage = {
          provider: args.model.provider,
          model: args.model.model,
          modelId: args.model.id,
          stage: args.stage,
          expertIndex: args.expertIndex,
          round: args.round,
          attempt,
          success: true,
          tokensKnown: response.tokensKnown !== false,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          estimatedCost: estimatedCost(
            args.model,
            response.inputTokens,
            response.outputTokens,
          ),
          costKnown:
            response.tokensKnown !== false &&
            args.model.inputCostPerMillion !== undefined &&
            args.model.outputCostPerMillion !== undefined,
          latencyMs:
            response.latencyMs || Math.round(performance.now() - started),
        };
        this.calls.push(entry);
        this.log({
          sessionId: this.sessionId,
          stage: args.stage,
          model: args.model.id,
          latencyMs: entry.latencyMs,
          inputTokens: entry.inputTokens,
          outputTokens: entry.outputTokens,
          estimatedCost: entry.estimatedCost,
          retryCount: attempt - 1,
        });
        return object;
      } catch (error) {
        lastError = error;
        const latencyMs = Math.round(performance.now() - started);
        const entry: ModelCallUsage = {
          provider: args.model.provider,
          model: args.model.model,
          modelId: args.model.id,
          stage: args.stage,
          expertIndex: args.expertIndex,
          round: args.round,
          attempt,
          success: false,
          tokensKnown: !!response && response.tokensKnown !== false,
          inputTokens: response?.inputTokens ?? 0,
          outputTokens: response?.outputTokens ?? 0,
          estimatedCost: response
            ? estimatedCost(
                args.model,
                response.inputTokens,
                response.outputTokens,
              )
            : 0,
          latencyMs: response?.latencyMs || latencyMs,
          costKnown:
            !!response &&
            response.tokensKnown !== false &&
            args.model.inputCostPerMillion !== undefined &&
            args.model.outputCostPerMillion !== undefined,
          error: error instanceof Error ? error.name : "ProviderError",
        };
        this.calls.push(entry);
        this.log({
          sessionId: this.sessionId,
          stage: args.stage,
          model: args.model.id,
          latencyMs,
          retryCount: attempt - 1,
        });
        this.throwIfAborted();
        if ((error as { retryable?: boolean }).retryable === false) throw error;
      }
    }
    throw lastError;
  }

  generateRoles() {
    return generateRoles(this);
  }

  expertModel(role: ExpertRole, index: number): ModelConfig {
    const override =
      role.modelOverride || this.request.models.expertModelOverrides?.[index];
    return this.model(override || this.request.models.defaultExpertModelId);
  }

  estimatedJudgeCost() {
    return estimatedJudgeCost(this);
  }
  ensurePricing(model: ModelConfig) {
    return ensurePricing(this, model);
  }
  estimatedRoleCost() {
    return estimatedRoleCost(this);
  }
  preflightBudget(roles?: ExpertRole[]) {
    return preflightBudget(this, roles);
  }
  canAffordOptional(
    stage: "debate_rebuttal" | "cross_evaluation",
    runs: DebateExpertRun[],
  ) {
    return canAffordOptional(this, stage, runs);
  }

  judge<T>(schema: z.ZodType<T>, system: string, prompt: string) {
    return runJudge(this, schema, system, prompt);
  }
}
