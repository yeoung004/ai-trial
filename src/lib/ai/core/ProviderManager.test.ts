import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ProviderRegistry } from "./ProviderRegistry";
import { ProviderManager } from "./ProviderManager";
import type { AIProvider } from "./AIProvider";
const descriptor = {
  id: "muse:reasoner",
  providerId: "muse",
  model: "reasoner",
  displayName: "Reasoner",
  available: true,
};
function provider(id = "muse"): AIProvider {
  return {
    id,
    displayName: id,
    capabilities: { structuredOutput: true, subscription: id === "muse" },
    listModels: vi.fn(async () => [descriptor]),
    healthCheck: vi.fn(async () => ({ status: "connected" as const })),
    generate: vi.fn(),
  };
}
describe("provider isolation and cache", () => {
  it("shares concurrent discovery and keeps catalogs for fifteen minutes", async () => {
    let now = 1000;
    const p = provider();
    const manager = new ProviderManager(
      new ProviderRegistry([p]),
      [],
      () => now,
    );
    await Promise.all([manager.snapshot("muse"), manager.snapshot("muse")]);
    now += 899999;
    await manager.snapshot("muse");
    expect(p.listModels).toHaveBeenCalledTimes(1);
    now += 2;
    await manager.snapshot("muse");
    expect(p.listModels).toHaveBeenCalledTimes(2);
  });
  it("reports stale data after refresh failure and explicit fallback on cold failure", async () => {
    const p = provider();
    const manager = new ProviderManager(new ProviderRegistry([p]));
    await manager.snapshot("muse");
    vi.mocked(p.listModels).mockRejectedValue(new Error("offline"));
    expect(await manager.snapshot("muse", true)).toMatchObject({
      source: "cached",
      models: [descriptor],
      error: "Could not refresh models.",
    });
    expect(
      await new ProviderManager(new ProviderRegistry([p]), [
        descriptor,
      ]).snapshot("muse"),
    ).toMatchObject({ source: "fallback", models: [descriptor] });
  });
  it("never invokes another provider when Muse exhausts its allowance", async () => {
    const muse = provider();
    const paid = provider("openai");
    vi.mocked(muse.generate).mockRejectedValue(
      new Error("allowance unavailable"),
    );
    const manager = new ProviderManager(new ProviderRegistry([muse, paid]));
    await expect(
      manager.generate({
        model: {
          id: "muse:reasoner",
          provider: "muse",
          model: "reasoner",
          displayName: "Reasoner",
          tier: "standard",
          enabled: true,
        },
        stage: "judge",
        system: "Judge",
        prompt: "Question",
        schema: z.object({ answer: z.string() }),
        maxOutputTokens: 500,
      }),
    ).rejects.toThrow("allowance unavailable");
    expect(paid.generate).not.toHaveBeenCalled();
  });
});
