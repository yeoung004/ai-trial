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
