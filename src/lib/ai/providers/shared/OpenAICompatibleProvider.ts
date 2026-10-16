import { createOpenAI } from "@ai-sdk/openai";

/** Shared chat/completions transport for compatible APIs; credentials stay server-side. */
export function createCompatibleModel(config: {
  providerId: string;
  baseURL: string;
  apiKey: string;
}, modelId: string) {
  return createOpenAI({ name: config.providerId, baseURL: config.baseURL, apiKey: config.apiKey }).chat(modelId);
}
