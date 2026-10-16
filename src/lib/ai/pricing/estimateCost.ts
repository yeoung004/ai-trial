import type { ModelConfig } from "../../../shared/types.js";

export function estimatedCost(model: ModelConfig, inputTokens: number, outputTokens: number): number | null {
  const input = model.inputCostPerMillion;
  const output = model.outputCostPerMillion;
  if (input === undefined || output === undefined || !Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0) return null;
  return (input * inputTokens + output * outputTokens) / 1_000_000;
}
