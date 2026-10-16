import { Execution } from "./Execution.js";
import { runYesNo } from "./YesNoCouncil.js";
import { runDebate } from "./DebateCouncil.js";

import type {
  CouncilRequest,
  CouncilResult,
  StageEvent,
  RoleGenerationResult,
  CallStage,
  TerminationReason,
  CouncilStage,
} from "../../shared/types.js";
import { type ModelAdapter } from "./provider.js";

import { CouncilError, binaryProposition } from "./logic.js";

export { CouncilError } from "./logic.js";
export type {
  ModelAdapter,
  StructuredCall,
  StructuredResponse,
} from "./provider.js";

export interface EngineLogEvent {
  sessionId: string;
  stage: CouncilStage | CallStage;
  model?: string;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number | null;
  retryCount?: number;
  terminationReason?: TerminationReason;
}

export interface CouncilDependencies {
  adapter?: ModelAdapter;
  signal?: AbortSignal;
  onStage?: (event: StageEvent) => void;
  logger?: (event: EngineLogEvent) => void;
}

function validateRequest(execution: Execution, requireJudge: boolean) {
  const { request } = execution;
  if (
    !request ||
    !["YES_NO", "DEBATE"].includes(request.mode) ||
    !["AUTO", "MANUAL", "HYBRID"].includes(request.roleMode)
  ) {
    throw new CouncilError(
      "INVALID_REQUEST",
      "Choose a valid council mode and role mode.",
    );
  }
  if (
    !request.question?.trim() ||
    request.question.length > 10000 ||
    (request.context?.length ?? 0) > 20000
  ) {
    throw new CouncilError(
      "INVALID_REQUEST",
      "Question or context is missing or too long.",
    );
  }
  if (!Array.isArray(request.models?.registry))
    throw new CouncilError("INVALID_REQUEST", "A model registry is required.");
  const ids = request.models.registry.map((model) => model.id);
  if (new Set(ids).size !== ids.length)
    throw new CouncilError(
      "INVALID_REQUEST",
      "Model registry IDs must be unique.",
    );
  if (requireJudge) execution.model(request.models.judgeModelId, "judge");
  execution.model(request.models.defaultExpertModelId);
}

export async function generateRoles(
  request: CouncilRequest,
  dependencies: CouncilDependencies = {},
): Promise<RoleGenerationResult> {
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

export async function runCouncil(
  request: CouncilRequest,
  dependencies: CouncilDependencies = {},
): Promise<CouncilResult> {
  const execution = new Execution(request, dependencies);
  try {
    execution.emit("ANALYZING");
    validateRequest(execution, true);
    execution.throwIfAborted();
    const proposition =
      request.mode === "YES_NO"
        ? binaryProposition(request.question)
        : undefined;
    execution.preflightBudget();
    const roles = await execution.generateRoles();
    execution.event("ROLES_CREATED", { roles });
    execution.preflightBudget(roles);
    execution.throwIfAborted();
    return request.mode === "YES_NO"
      ? await runYesNo(execution, roles, proposition!)
      : await runDebate(execution, roles);
  } catch (error) {
    execution.emit("FAILED");
    if (
      error instanceof CouncilError ||
      (error as { retryable?: boolean }).retryable === false
    )
      throw error;
    if (dependencies.signal?.aborted)
      throw new CouncilError("CANCELLED", "Council execution was cancelled.");
    throw new CouncilError(
      "ENGINE_FAILED",
      "Council execution failed unexpectedly.",
    );
  }
}
