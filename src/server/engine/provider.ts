import { generateText, gateway, Output } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { z } from "zod";
import type { CallStage, ModelConfig } from "../../shared/types.js";

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
}

/** Injectable seam for provider-independent engine tests. */
export interface ModelAdapter {
  generate<T>(call: StructuredCall<T>): Promise<StructuredResponse<T>>;
}

function requiredKey(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the selected model provider`);
  return value;
}

function resolveModel(config: ModelConfig) {
  switch (config.provider) {
    case "gateway":
      if (!config.model.includes("/")) {
        throw new Error("Gateway model IDs must include a provider prefix");
      }
      if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
        throw new Error("AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN is required for gateway models");
      }
      return gateway(config.model);
    case "openai":
      return createOpenAI({ apiKey: requiredKey("OPENAI_API_KEY") })(config.model);
    case "anthropic":
      return createAnthropic({ apiKey: requiredKey("ANTHROPIC_API_KEY") })(config.model);
    case "google":
      return createGoogleGenerativeAI({ apiKey: requiredKey("GOOGLE_GENERATIVE_AI_API_KEY") })(config.model);
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
    return {
      object: call.schema.parse(result.output),
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
      latencyMs: Math.round(performance.now() - started),
    };
  },
};
