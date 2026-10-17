export type AIProviderErrorCode =
  | "AUTHENTICATION" | "BILLING" | "RATE_LIMIT" | "MODEL_UNAVAILABLE"
  | "NETWORK" | "OUTPUT_LIMIT" | "INVALID_RESPONSE" | "UNKNOWN";

const messages: Record<AIProviderErrorCode, string> = {
  AUTHENTICATION: "AI provider authentication failed. Check the selected provider credentials.",
  BILLING: "AI provider billing error. Check the selected provider billing configuration.",
  RATE_LIMIT: "AI provider rate limit reached. Try again later.",
  MODEL_UNAVAILABLE: "The selected AI model is unavailable. Refresh models in Settings.",
  NETWORK: "Could not reach the selected AI provider. Check the connection and try again.",
  OUTPUT_LIMIT: "The model response exceeded its output token limit. Increase the stage output budget in Settings → Advanced and try again.",
  INVALID_RESPONSE: "The model returned an invalid structured response. Try again or select another model for this stage.",
  UNKNOWN: "The selected AI provider could not complete the request.",
};
export class AIProviderError extends Error {
  readonly retryable: boolean;
  constructor(readonly code: AIProviderErrorCode) {
    super(messages[code]);
    this.name = "AIProviderError";
    this.retryable = ["NETWORK", "RATE_LIMIT", "OUTPUT_LIMIT", "INVALID_RESPONSE"].includes(code);
  }
}

/** Never return raw SDK errors, response bodies, headers, or credentials to clients. */
export function mapProviderError(error: unknown): AIProviderError {
  if (error instanceof AIProviderError) return error;
  const value = typeof error === "object" && error !== null ? error : {};
  if ("name" in value && value.name === "AI_NoObjectGeneratedError") {
    return new AIProviderError("finishReason" in value && value.finishReason === "length" ? "OUTPUT_LIMIT" : "INVALID_RESPONSE");
  }
  if ("name" in value && ["AI_NoOutputGeneratedError", "AI_TypeValidationError", "ZodError"].includes(String(value.name))) {
    return new AIProviderError("INVALID_RESPONSE");
  }
  const status = "statusCode" in value ? value.statusCode : "status" in value ? value.status : undefined;
  if (status === 401 || status === 403) return new AIProviderError("AUTHENTICATION");
  if (status === 402) return new AIProviderError("BILLING");
  if (status === 429) return new AIProviderError("RATE_LIMIT");
  if (status === 404) return new AIProviderError("MODEL_UNAVAILABLE");
  if ((typeof status === "number" && (status >= 500 || status === 408)) ||
      (error instanceof Error && ["TypeError", "TimeoutError"].includes(error.name))) {
    return new AIProviderError("NETWORK");
  }
  return new AIProviderError("UNKNOWN");
}
