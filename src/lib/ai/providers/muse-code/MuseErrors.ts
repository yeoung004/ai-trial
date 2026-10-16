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
