import { expect, it } from "vitest";
import { generationError } from "./MuseErrors";

it("explains the observed Muse billing rejection without exposing raw diagnostics", () => {
  const error = generationError("API error 402 [request_id=private]: Billing verification failed. Please check your payment method. (billing_error)");
  expect(error.code).toBe("MUSE_BILLING_REQUIRED");
  expect(error.message).toContain("payment method");
  expect(error.message).not.toContain("private");
  expect(error.retryable).toBe(false);
});
it("does not misdiagnose unknown failures as billing", () => {
  expect(generationError("connection closed").code).toBe("MUSE_GENERATION_FAILED");
});
