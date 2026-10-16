import type { ModelConfig } from "../../../../shared/types.js";

// Fallback identifiers are not availability guarantees. Prices are editable metadata.
export const fallbackModels: ModelConfig[] = [
  {
    id: "openai:gpt-5.4-nano",
    provider: "openai",
    model: "gpt-5.4-nano",
    displayName: "GPT-5.4 Nano",
    tier: "economy",
    inputCostPerMillion: 0.2,
    outputCostPerMillion: 1.25,
    enabled: true,
  },
  {
    id: "openai:gpt-5.4-mini",
    provider: "openai",
    model: "gpt-5.4-mini",
    displayName: "GPT-5.4 Mini",
    tier: "standard",
    inputCostPerMillion: 0.75,
    outputCostPerMillion: 4.5,
    enabled: true,
  },
  {
    id: "openai:gpt-5.6-sol",
    provider: "openai",
    model: "gpt-5.6-sol",
    displayName: "GPT-5.6 Sol",
    tier: "judge",
    inputCostPerMillion: 4,
    outputCostPerMillion: 20,
    enabled: true,
  }
];
