import { expect, it } from "vitest";
import { mapProviderError } from "./errors";
it.each([
  [401, "AUTHENTICATION"], [403, "AUTHENTICATION"], [402, "BILLING"],
  [429, "RATE_LIMIT"], [404, "MODEL_UNAVAILABLE"], [503, "NETWORK"], [400, "UNKNOWN"],
])("normalizes provider HTTP %s without leaking diagnostics", (statusCode, code) => {
  const error = mapProviderError({ statusCode, message: "secret", responseBody: "secret" });
  expect(error.code).toBe(code);
  expect(error.message).not.toContain("secret");
});
it("preserves normalized errors and maps network timeouts", () => {
  const error = mapProviderError(new DOMException("timeout", "TimeoutError"));
  expect(error.code).toBe("NETWORK");
  expect(mapProviderError(error)).toBe(error);
});
it("distinguishes truncated JSON from invalid structured output", () => {
  expect(mapProviderError({ name: "AI_NoObjectGeneratedError", finishReason: "length", text: "private" })).toMatchObject({ code: "OUTPUT_LIMIT", retryable: true });
  expect(mapProviderError({ name: "AI_NoObjectGeneratedError", finishReason: "stop" }).code).toBe("INVALID_RESPONSE");
});
it.each(["AI_NoOutputGeneratedError", "AI_TypeValidationError", "ZodError"])("makes %s eligible for the bounded structured-response retry", (name) => {
  expect(mapProviderError({ name })).toMatchObject({ code: "INVALID_RESPONSE", retryable: true });
});
