export type AIProviderErrorCode =
  | "AUTHENTICATION" | "BILLING" | "RATE_LIMIT" | "MODEL_UNAVAILABLE"
  | "NETWORK" | "UNKNOWN";

const messages: Record<AIProviderErrorCode, string> = {
  AUTHENTICATION: "AI provider authentication failed. Check the selected provider credentials.",
  BILLING: "AI provider billing error. Check the selected provider billing configuration.",
  RATE_LIMIT: "AI provider rate limit reached. Try again later.",
  MODEL_UNAVAILABLE: "The selected AI model is unavailable. Refresh models in Settings.",
  NETWORK: "Could not reach the selected AI provider. Check the connection and try again.",
  UNKNOWN: "The selected AI provider could not complete the request.",
};
export class AIProviderError extends Error {
  readonly retryable: boolean;
  constructor(readonly code: AIProviderErrorCode) {
    super(messages[code]);
    this.name = "AIProviderError";
    this.retryable = code === "NETWORK" || code === "RATE_LIMIT";
  }
}

/** Never return raw SDK errors, response bodies, headers, or credentials to clients. */
export function mapProviderError(error: unknown): AIProviderError {
  if (error instanceof AIProviderError) return error;
  const value = typeof error === "object" && error !== null ? error : {};
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
