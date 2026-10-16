import type { ModelConfig } from "../../../../shared/types.js";

// Fallback identifiers are not availability guarantees. Prices are editable metadata.
export const fallbackModels: ModelConfig[] = [
  {
    id: "google:gemini-3.7-flash",
    provider: "google",
    model: "gemini-3.7-flash",
    displayName: "Gemini 3.7 Flash",
    tier: "economy",
    enabled: true,
  }
];
