export class MuseError extends Error {
  readonly retryable = false;
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "MuseError";
  }
}
export function disconnected() {
  return new MuseError(
    "MUSE_UNAVAILABLE",
    "Muse CLI was not found. Install it or set MUSE_BIN to its executable path, then refresh AI Settings.",
  );
}

/** Report known provider failures without exposing raw host diagnostics. */
export function generationError(message?: string) {
  if (/billing_error|billing verification failed|\b402\b/i.test(message ?? "")) {
    return new MuseError(
      "MUSE_BILLING_REQUIRED",
      "Muse is signed in, but rejected generation because billing verification failed. Check your payment method in your Muse account, then try again.",
    );
  }
  return new MuseError(
    "MUSE_GENERATION_FAILED",
    "Muse did not complete its reasoning turn.",
  );
}
