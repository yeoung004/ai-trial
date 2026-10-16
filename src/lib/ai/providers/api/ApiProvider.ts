import { z } from "zod";
import type { AIProvider } from "../../core/AIProvider.js";
import type {
  ModelDescriptor,
  ProviderHealth,
  StructuredCall,
} from "../../core/types.js";
import { AIProviderError, mapProviderError } from "../../core/errors.js";
import { fallbackModels as openaiModels } from "../openai/fallbackModels.js";
import { fallbackModels as anthropicModels } from "../anthropic/fallbackModels.js";
import { fallbackModels as googleModels } from "../google/fallbackModels.js";
import { fallbackModels as gatewayModels } from "../gateway/fallbackModels.js";
import type { ModelConfig } from "../../../../shared/types.js";
import { aiSdkModelAdapter } from "./ApiGeneration.js";

export const apiConnections = [
  {
    id: "openai",
    name: "OpenAI",
    key: "OPENAI_API_KEY",
    url: "https://api.openai.com/v1/models",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    key: "ANTHROPIC_API_KEY",
    url: "https://api.anthropic.com/v1/models",
  },
  {
    id: "google",
    name: "Google Gemini",
    key: "GOOGLE_GENERATIVE_AI_API_KEY",
    url: "https://generativelanguage.googleapis.com/v1beta/models",
  },
  {
    id: "meta",
    name: "Meta Model API",
    key: "META_API_KEY",
    url: "https://api.meta.ai/v1/models",
  },
  {
    id: "compatible",
    name: "OpenAI-compatible API",
    key: "COMPATIBLE_API_KEY",
    url: "",
  },
  {
    id: "gateway",
    name: "AI Gateway",
    key: "AI_GATEWAY_API_KEY",
    url: "https://ai-gateway.vercel.sh/v1/models",
  },
] as const;
const rowSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    display_name: z.string().optional(),
    displayName: z.string().optional(),
    inputTokenLimit: z.number().optional(),
    supportedGenerationMethods: z.array(z.string()).optional(),
  })
  .passthrough();
export function isTextModel(id: string): boolean {
  return !/embed|whisper|tts|transcrib|dall-e|moderation|segmen|image|audio|speech|realtime|veo|imagen/i.test(
    id,
  );
}
export class ApiProvider implements AIProvider {
  readonly capabilities = { modelDiscovery: true, structuredOutput: true, streaming: false, usageReporting: true };
  get fallbackModels(): ModelDescriptor[] {
    const catalogs: Record<string, ModelConfig[]> = {
      openai: openaiModels, anthropic: anthropicModels, google: googleModels, gateway: gatewayModels,
    };
    return (catalogs[this.id] ?? []).map((model) => ({
      id: model.id, providerId: model.provider, model: model.model,
      displayName: model.displayName, available: model.enabled,
      contextWindow: model.maxContextTokens,
      inputPricePerMillion: model.inputCostPerMillion,
      outputPricePerMillion: model.outputCostPerMillion,
      capabilities: { text: true },
    }));
  }
  constructor(readonly connection: (typeof apiConnections)[number]) {}
  get id() {
    return this.connection.id;
  }
  get displayName() {
    return this.connection.name;
  }
  configured() {
    return (
      !!process.env[this.connection.key] &&
      (this.id !== "compatible" || !!process.env.COMPATIBLE_BASE_URL)
    );
  }
  async listModels(): Promise<ModelDescriptor[]> {
    try { return await this.discoverModels(); }
    catch (error) { throw mapProviderError(error); }
  }
  private async discoverModels(): Promise<ModelDescriptor[]> {
    if (!this.configured()) throw new AIProviderError("AUTHENTICATION");
    const base =
      this.id === "compatible"
        ? `${process.env.COMPATIBLE_BASE_URL!.replace(/\/$/, "")}/models`
        : this.connection.url;
    const headers: Record<string, string> =
      this.id === "anthropic"
        ? {
            "x-api-key": process.env[this.connection.key]!,
            "anthropic-version": "2023-06-01",
          }
        : this.id === "google"
          ? { "x-goog-api-key": process.env[this.connection.key]! }
          : { Authorization: `Bearer ${process.env[this.connection.key]}` };
    const models: ModelDescriptor[] = [];
    let cursor = "";
    for (let page = 0; page < 30; page++) {
      const url = new URL(base);
      if (this.id === "google") {
        url.searchParams.set("pageSize", "1000");
        if (cursor) url.searchParams.set("pageToken", cursor);
      }
      if (this.id === "anthropic") {
        url.searchParams.set("limit", "1000");
        if (cursor) url.searchParams.set("after_id", cursor);
      }
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok)
        throw Object.assign(
          new Error(`Model discovery failed (${response.status})`),
          { status: response.status },
        );
      const body = (await response.json()) as Record<string, unknown>;
      const rows = z.array(rowSchema).parse(body.data ?? body.models);
      for (const row of rows) {
        const model = (row.id ?? row.name ?? "").replace(/^models\//, "");
        if (!model) continue;
        models.push({
          id: `${this.id}:${model}`,
          providerId: this.id,
          model,
          displayName: row.display_name ?? row.displayName ?? model,
          available: true,
          contextWindow: row.inputTokenLimit,
          capabilities: {
            text: row.supportedGenerationMethods
              ? row.supportedGenerationMethods.includes("generateContent")
              : isTextModel(model),
          },
        });
      }
      const next =
        this.id === "google"
          ? body.nextPageToken
          : this.id === "anthropic" && body.has_more
            ? body.last_id
            : null;
      if (typeof next !== "string" || !next || next === cursor) return models;
      cursor = next;
    }
    throw new Error("Model catalog pagination limit reached");
  }
  async healthCheck(): Promise<ProviderHealth> {
    if (!this.configured())
      return {
        status: "authentication_required",
        message: `Set ${this.connection.key} in the server environment.`,
      };
    try {
      await this.listModels();
      return { status: "connected" };
    } catch (error) {
      const mapped = mapProviderError(error);
      return {
        status:
          mapped.code === "AUTHENTICATION"
            ? "authentication_required"
            : mapped.code === "RATE_LIMIT"
              ? "rate_limited"
              : "unavailable",
        message: mapped.message,
      };
    }
  }
  async generate<T>(request: StructuredCall<T>) {
    if (request.model.provider !== this.id) throw new AIProviderError("MODEL_UNAVAILABLE");
    try { return await aiSdkModelAdapter.generate(request); }
    catch (error) {
      if (request.signal?.aborted) throw error;
      throw mapProviderError(error);
    }
  }
}
