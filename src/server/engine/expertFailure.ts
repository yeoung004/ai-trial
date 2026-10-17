import { AIProviderError } from "../../lib/ai/core/errors.js";
import type { Execution } from "./Execution.js";
import type { ExpertRole } from "../../shared/types.js";

export function recordExpertFailure(execution: Execution, role: ExpertRole, expertIndex: number, error: unknown, round?: number) {
  const failure = {
    expertId: role.id,
    code: error instanceof AIProviderError ? error.code : "INVALID_RESPONSE",
    message: error instanceof AIProviderError ? error.message : "The expert could not return a valid response after retrying.",
  };
  execution.degraded = true;
  execution.failedExpertIndices.add(expertIndex);
  execution.event("EXPERT_FAILED", { expertId: role.id, round, errorCode: failure.code, message: failure.message });
  return failure;
}
