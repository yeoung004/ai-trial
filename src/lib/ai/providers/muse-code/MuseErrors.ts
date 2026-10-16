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
    "Muse Code is not connected. Install the matching local CLI and sign in, then refresh AI Settings.",
  );
}
