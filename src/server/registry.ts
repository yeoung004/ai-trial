import type { ModelConfig } from "../shared/types";

// These are model identifiers, not availability guarantees. A provider key (or
// gateway key) still has to be configured before a model can be called. Gateway
// prices were read from its model catalog on 2026-10-15 and are editable.
// Direct OpenAI prices were checked against official OpenAI model/pricing pages.
export const DEFAULT_MODELS: ModelConfig[] = [
  {
    id: "gateway:gpt-5.4-nano",
    provider: "gateway",
    model: "openai/gpt-5.4-nano",
    displayName: "GPT-5.4 Nano (Gateway)",
    tier: "economy",
    inputCostPerMillion: 0.2,
    outputCostPerMillion: 1.25,
    enabled: true,
  },
  {
    id: "gateway:gpt-5.4-mini",
    provider: "gateway",
    model: "openai/gpt-5.4-mini",
    displayName: "GPT-5.4 Mini (Gateway)",
    tier: "standard",
    inputCostPerMillion: 0.75,
    outputCostPerMillion: 4.5,
    enabled: true,
  },
  {
    id: "gateway:gpt-5.6-sol",
    provider: "gateway",
    model: "openai/gpt-5.6-sol",
    displayName: "GPT-5.6 Sol (Gateway)",
    tier: "judge",
    inputCostPerMillion: 4,
    outputCostPerMillion: 20,
    enabled: true,
  },
  {
    id: "gateway:claude-sonnet-5.5",
    provider: "gateway",
    model: "anthropic/claude-sonnet-5.5",
    displayName: "Claude Sonnet 5.5 (Gateway)",
    tier: "standard",
    inputCostPerMillion: 2,
    outputCostPerMillion: 10,
    enabled: true,
  },
  {
    id: "gateway:claude-opus-5.5",
    provider: "gateway",
    model: "anthropic/claude-opus-5.5",
    displayName: "Claude Opus 5.5 (Gateway)",
    tier: "judge",
    inputCostPerMillion: 4,
    outputCostPerMillion: 20,
    enabled: true,
  },
  {
    id: "gateway:gemini-3.7-flash",
    provider: "gateway",
    model: "google/gemini-3.7-flash",
    displayName: "Gemini 3.7 Flash (Gateway)",
    tier: "economy",
    inputCostPerMillion: 0.75,
    outputCostPerMillion: 3.75,
    enabled: true,
  },
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
  },
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
  },
  {
    id: "google:gemini-3.7-flash",
    provider: "google",
    model: "gemini-3.7-flash",
    displayName: "Gemini 3.7 Flash",
    tier: "economy",
    enabled: true,
  },
];

const PROVIDERS = new Set(["gateway", "openai", "anthropic", "google"]);
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
