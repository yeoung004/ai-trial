import type { z } from "zod";
import type { CallStage, ModelConfig } from "../../../shared/types.js";
export interface StructuredCall<T> {
  model: ModelConfig;
  stage: CallStage;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxOutputTokens: number;
  signal?: AbortSignal;
}

export interface StructuredResponse<T> {
  object: T;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  tokensKnown?: boolean;
}

/** Injectable seam for provider-independent engine tests. */
export interface ModelAdapter {
  generate<T>(call: StructuredCall<T>): Promise<StructuredResponse<T>>;
}

export interface ModelDescriptor {
  id: string;
  providerId: string;
  model: string;
  displayName: string;
  available: boolean;
  contextWindow?: number;
  inputPricePerMillion?: number;
  outputPricePerMillion?: number;
  capabilities?: {
    structuredOutput?: boolean;
    reasoning?: boolean;
    vision?: boolean;
    text?: boolean;
  };
  metadata?: Record<string, unknown>;
}
export interface ProviderHealth {
  status:
    | "connected"
    | "unavailable"
    | "authentication_required"
    | "rate_limited";
  message?: string;
}
export interface ProviderCapabilities {
  modelDiscovery: boolean;
  structuredOutput: boolean;
  streaming: boolean;
  usageReporting: boolean;
}
export interface ProviderSnapshot {
  id: string;
  displayName: string;
  health: ProviderHealth;
  models: ModelDescriptor[];
  source: "live" | "cached" | "fallback";
  fetchedAt?: number;
  error?: string;
}
