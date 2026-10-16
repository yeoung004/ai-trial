import { z } from "zod";
import type { Connection } from "@muse-code/sdk";
import type { ProviderUsage } from "../../core/types.js";
import { MuseError } from "./MuseErrors.js";
const window = z.object({
  usedPercent: z.number().nonnegative(),
  resetsAtMs: z.number(),
});
const usage = z.object({ observedAtMs: z.number(), window, weekly: window });
export async function readUsage(
  connection: Connection,
): Promise<ProviderUsage | null> {
  const result = await connection.request("usage/read", {});
  if (!result.usage) return null;
  const value = usage.parse(result.usage);
  return {
    observedAtMs: value.observedAtMs,
    fiveHourWindow: value.window,
    weeklyWindow: value.weekly,
  };
}
export async function requireSubscription(connection: Connection) {
  // account/read is experimental: older hosts fail closed, never guess billing.
  const account = await connection.request("account/read", {});
  if (account.state !== "accountLogin")
    throw new MuseError(
      "MUSE_AUTH_REQUIRED",
      "Muse Code is not connected with a browser account. Sign in locally; API-key billing is disabled for this provider.",
    );
  const usage = await readUsage(connection);
  // MSP reports only the last observed usage, not a live allowance probe.
  // A fresh host can legitimately have no snapshot before its first turn.
  if (!usage) return null;
  if (
    [usage.fiveHourWindow, usage.weeklyWindow].some(
      (w) => w && w.usedPercent >= 100,
    )
  )
    throw new MuseError(
      "MUSE_ALLOWANCE_UNAVAILABLE",
      "Muse allowance unavailable.",
    );
  return usage;
}
