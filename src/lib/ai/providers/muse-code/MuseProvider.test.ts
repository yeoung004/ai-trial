import { describe, expect, it, vi } from "vitest";
import type { Connection, FoldedItem } from "@muse-code/sdk";
import { requireSubscription, readUsage } from "./MuseUsageReader";
import { readModels } from "./MuseModelCatalog";
import { finalText, parseJSON } from "./MuseEventMapper";
function connection(responses: Record<string, unknown>[]) {
  return {
    request: vi.fn().mockImplementation(async () => responses.shift()),
  } as unknown as Connection;
}
const usage = {
  observedAtMs: 42,
  window: { usedPercent: 25, resetsAtMs: 1000 },
  weekly: { usedPercent: 45, resetsAtMs: 2000 },
};
describe("Muse subscription boundary", () => {
  it.each(["envKey", "apiKey", "loggedOut", "futureLane"])(
    "refuses %s without requesting an inference",
    async (state) => {
      const c = connection([{ state }]);
      await expect(requireSubscription(c)).rejects.toMatchObject({
        code: "MUSE_AUTH_REQUIRED",
        retryable: false,
      });
      expect(c.request).toHaveBeenCalledTimes(1);
    },
  );
  it("requires actual subscription usage even after browser sign-in", async () => {
    await expect(
      requireSubscription(connection([{ state: "accountLogin" }, {}])),
    ).rejects.toMatchObject({ code: "MUSE_ALLOWANCE_UNAVAILABLE" });
  });
  it("normalizes usage windows and rejects quota exhaustion", async () => {
    expect(await readUsage(connection([{ usage }]))).toEqual({
      observedAtMs: 42,
      fiveHourWindow: usage.window,
      weeklyWindow: usage.weekly,
    });
    await expect(
      requireSubscription(
        connection([
          { state: "accountLogin" },
          {
            usage: { ...usage, weekly: { ...usage.weekly, usedPercent: 101 } },
          },
        ]),
      ),
    ).rejects.toMatchObject({ code: "MUSE_ALLOWANCE_UNAVAILABLE" });
  });
  it("uses the session MSP catalog and excludes paid routes", async () => {
    const c = connection([
      {
        models: [
          {
            modelId: "subscription-reasoner",
            providerId: "meta",
            displayLabel: "Subscription reasoner",
          },
          { modelId: "paid-model", providerId: "openai", displayLabel: "Paid" },
        ],
      },
    ]);
    expect(await readModels(c, "isolated-session")).toHaveLength(1);
    expect(c.request).toHaveBeenCalledWith("model/list", {
      sessionId: "isolated-session",
    });
  });
  it("uses only completed assistant text and rejects malformed JSON", () => {
    const items = [
      { kind: "reasoning", status: "completed", text: "private" },
      { kind: "agentMessage", status: "completed", text: '{"answer":"yes"}' },
      {
        kind: "agentMessage",
        status: "completed",
        cutOff: true,
        text: "partial",
      },
    ] as FoldedItem[];
    expect(parseJSON(finalText(items))).toEqual({ answer: "yes" });
    expect(() => parseJSON("not JSON")).toThrow();
  });
});
