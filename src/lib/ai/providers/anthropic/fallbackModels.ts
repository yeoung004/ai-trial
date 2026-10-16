import type { ModelConfig } from "../../../../shared/types.js";

// Fallback identifiers are not availability guarantees. Prices are editable metadata.
export const fallbackModels: ModelConfig[] = [
  {
    id: "anthropic:claude-sonnet-5-5",
    provider: "anthropic",
    model: "claude-sonnet-5-5",
    displayName: "Claude Sonnet 5.5",
    tier: "standard",
    enabled: true,
  },
  {
    id: "anthropic:claude-opus-5-5",
    provider: "anthropic",
    model: "claude-opus-5-5",
    displayName: "Claude Opus 5.5",
    tier: "judge",
    enabled: true,
  }
];
