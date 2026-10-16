export function isAuthenticationFailure(error: unknown): boolean {
  return (
    error instanceof Error &&
    /api.?key|authentication|credential|unauthorized|forbidden|\b401\b|\b403\b/i.test(
      error.message,
    )
  );
}
