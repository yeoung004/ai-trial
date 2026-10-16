import type { z } from "zod";

import { CouncilError } from "./logic.js";

import type { Execution } from "./Execution.js";
import { isAuthenticationFailure } from "./RetryPolicy.js";
export async function runJudge<T>(
  execution: Execution,
  schema: z.ZodType<T>,
  system: string,
  prompt: string,
): Promise<T> {
  execution.throwIfAborted();
  execution.emit("JUDGING");
  execution.event("JUDGE_STARTED");
  try {
    const result = await execution.call({
      model: execution.model(execution.request.models.judgeModelId, "judge"),
      stage: "judge",
      system,
      prompt,
      schema,
      maxOutputTokens: execution.budget("judge"),
    });
    execution.event("JUDGE_COMPLETED");
    return result;
  } catch (error) {
    if ((error as { retryable?: boolean }).retryable === false) throw error;
    execution.throwIfAborted();
    const reason = isAuthenticationFailure(error)
      ? "Final Judge authentication failed. Check the selected provider credentials."
      : "The Final Judge failed after one retry. No final answer was produced.";
    const model = execution.request.models.registry.find(
      (item) => item.id === execution.request.models.judgeModelId,
    );
    throw new CouncilError(
      "JUDGE_FAILED",
      reason,
      model ? { modelId: model.id, provider: model.provider } : undefined,
    );
  }
}
