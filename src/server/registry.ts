import type { ModelConfig } from "../shared/types";
import { PROVIDER_IDS } from "../shared/types";
import { fallbackModels as openaiModels } from "../lib/ai/providers/openai/fallbackModels.js";
import { fallbackModels as anthropicModels } from "../lib/ai/providers/anthropic/fallbackModels.js";
import { fallbackModels as googleModels } from "../lib/ai/providers/google/fallbackModels.js";
import { fallbackModels as gatewayModels } from "../lib/ai/providers/gateway/fallbackModels.js";

export const DEFAULT_MODELS: ModelConfig[] = [...openaiModels, ...anthropicModels, ...googleModels, ...gatewayModels];
const PROVIDERS = new Set<string>(PROVIDER_IDS);

const TIERS = new Set(["economy", "standard", "premium", "judge"]);

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Model ${field} must be a nonempty string`);
  }
  return value.trim();
}

function optionalNonnegativeNumber(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Model ${field} must be a nonnegative number`);
  }
  return value;
}

/** Validate and whitelist the fields that may be persisted in the model registry. */
export function validateModels(value: unknown): ModelConfig[] {
  if (!Array.isArray(value)) throw new Error("Model registry must be an array");

  const ids = new Set<string>();
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`Model at index ${index} must be an object`);
    }
    const raw = item as Record<string, unknown>;
    const id = requiredString(raw.id, "id");
    if (ids.has(id)) throw new Error(`Duplicate model id: ${id}`);
    ids.add(id);

    const provider = requiredString(raw.provider, "provider");
    if (!PROVIDERS.has(provider)) throw new Error(`Unsupported provider: ${provider}`);
    const tier = requiredString(raw.tier, "tier");
    if (!TIERS.has(tier)) throw new Error(`Unsupported model tier: ${tier}`);
    if (typeof raw.enabled !== "boolean") {
      throw new Error(`Model ${id} enabled must be a boolean`);
    }

    const inputCostPerMillion = optionalNonnegativeNumber(
      raw.inputCostPerMillion,
      "inputCostPerMillion",
    );
    const outputCostPerMillion = optionalNonnegativeNumber(
      raw.outputCostPerMillion,
      "outputCostPerMillion",
    );
    const maxContextTokens = raw.maxContextTokens;
    if (
      maxContextTokens !== undefined &&
      (!Number.isSafeInteger(maxContextTokens) || (maxContextTokens as number) <= 0)
    ) {
      throw new Error(`Model ${id} maxContextTokens must be a positive integer`);
    }

    return {
      id,
      provider: provider as ModelConfig["provider"],
      model: requiredString(raw.model, "model"),
      displayName: requiredString(raw.displayName, "displayName"),
      tier: tier as ModelConfig["tier"],
      enabled: raw.enabled,
      ...(inputCostPerMillion !== undefined && { inputCostPerMillion }),
      ...(outputCostPerMillion !== undefined && { outputCostPerMillion }),
      ...(maxContextTokens !== undefined && { maxContextTokens: maxContextTokens as number }),
    };
  });
}

/** A Judge must be explicitly selected for each execution. Tier is advisory. */
export function requireJudgeModel(
  selectedId: string | null | undefined,
  models: readonly ModelConfig[],
): ModelConfig {
  if (!selectedId) throw new Error("Select a Final Judge model before running the council");
  const selected = models.find((model) => model.id === selectedId && model.enabled);
  if (!selected) throw new Error("The selected Final Judge model is unavailable or disabled");
  return selected;
}
