import { generateText, gateway, Output } from "ai";
import { AIProviderError } from "../../core/errors.js";
import { createCompatibleModel } from "../shared/OpenAICompatibleProvider.js";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type {
  ModelAdapter,
  StructuredCall,
  StructuredResponse,
} from "../../core/types.js";
import type { ModelConfig } from "../../../../shared/types.js";

function requiredKey(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new AIProviderError("AUTHENTICATION");
  return value;
}

function resolveModel(config: ModelConfig) {
  switch (config.provider) {
    case "gateway":
      if (!config.model.includes("/")) {
        throw new Error("Gateway model IDs must include a provider prefix");
      }
      if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
        throw new Error(
          "AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN is required for gateway models",
        );
      }
      return gateway(config.model);
    case "compatible":
      return createCompatibleModel({
        providerId: config.provider,
        apiKey: requiredKey("COMPATIBLE_API_KEY"),
        baseURL: requiredKey("COMPATIBLE_BASE_URL"),
      }, config.model);
    case "meta":
      return createCompatibleModel({
        providerId: config.provider,
        apiKey: requiredKey("META_API_KEY"),
        baseURL: "https://api.meta.ai/v1",
      }, config.model);
    case "openai":
      return createOpenAI({ apiKey: requiredKey("OPENAI_API_KEY") })(
        config.model,
      );
    case "anthropic":
      return createAnthropic({ apiKey: requiredKey("ANTHROPIC_API_KEY") })(
        config.model,
      );
    case "google":
      return createGoogleGenerativeAI({
        apiKey: requiredKey("GOOGLE_GENERATIVE_AI_API_KEY"),
      })(config.model);
  }
}

/** AI SDK 7 adapter. Credentials are read only inside the server process. */
export const aiSdkModelAdapter: ModelAdapter = {
  async generate<T>(call: StructuredCall<T>): Promise<StructuredResponse<T>> {
    const started = performance.now();
    const result = await generateText({
      model: resolveModel(call.model),
      system: call.system,
      prompt: call.prompt,
      output: Output.object({ schema: call.schema }),
      maxOutputTokens: call.maxOutputTokens,
      abortSignal: call.signal,
      // The engine owns the single retry and records each attempt.
      maxRetries: 0,
    });
    if (result.finishReason === "length") throw new AIProviderError("OUTPUT_LIMIT");
    return {
      object: call.schema.parse(result.output),
      tokensKnown:
        result.usage.inputTokens !== undefined &&
        result.usage.outputTokens !== undefined,
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
      latencyMs: Math.round(performance.now() - started),
    };
  },
};
