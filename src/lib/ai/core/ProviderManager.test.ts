import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ProviderRegistry } from "./ProviderRegistry";
import { ProviderManager } from "./ProviderManager";
import type { AIProvider } from "./AIProvider";
const descriptor = {
  id: "anthropic:reasoner",
  providerId: "anthropic",
  model: "reasoner",
  displayName: "Reasoner",
  available: true,
};
function provider(id = "anthropic"): AIProvider {
  return {
    id,
    displayName: id,
    capabilities: { structuredOutput: true, modelDiscovery: true, streaming: false, usageReporting: true },
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
      () => now,
    );
    await Promise.all([manager.snapshot("anthropic"), manager.snapshot("anthropic")]);
    now += 899999;
    await manager.snapshot("anthropic");
    expect(p.listModels).toHaveBeenCalledTimes(1);
    now += 2;
    await manager.snapshot("anthropic");
    expect(p.listModels).toHaveBeenCalledTimes(2);
  });
  it("reports stale data after refresh failure and explicit fallback on cold failure", async () => {
    const p = provider();
    const manager = new ProviderManager(new ProviderRegistry([p]));
    await manager.snapshot("anthropic");
    vi.mocked(p.listModels).mockRejectedValue(new Error("offline"));
    expect(await manager.snapshot("anthropic", true)).toMatchObject({
      source: "cached",
      models: [descriptor],
      error: "Could not refresh models.",
    });
    expect(
      await new ProviderManager(new ProviderRegistry([{ ...p, fallbackModels: [descriptor] }])).snapshot("anthropic"),
    ).toMatchObject({ source: "fallback", models: [descriptor] });
  });
  it("never invokes another provider when a provider rejects generation", async () => {
    const anthropic = provider();
    const paid = provider("openai");
    vi.mocked(anthropic.generate).mockRejectedValue(
      new Error("allowance unavailable"),
    );
    const manager = new ProviderManager(new ProviderRegistry([anthropic, paid]));
    await expect(
      manager.generate({
        model: {
          id: "anthropic:reasoner",
          provider: "anthropic",
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

it("routes expert and Judge calls to independently selected providers", async () => {
  const expert = provider("google");
  const judge = provider("openai");
  const manager = new ProviderManager(new ProviderRegistry([expert, judge]));
  for (const [stage, selected] of [["debate_initial", "google"], ["judge", "openai"]] as const) {
    await manager.generate({
      model: { id: `${selected}:shared-name`, provider: selected, model: "shared-name", displayName: "Model", tier: "standard", enabled: true },
      stage, system: "Reason", prompt: "Question", schema: z.object({ answer: z.string() }), maxOutputTokens: 100,
    });
  }
  expect(expert.generate).toHaveBeenCalledTimes(1);
  expect(judge.generate).toHaveBeenCalledTimes(1);
  expect(vi.mocked(judge.generate).mock.calls[0][0].stage).toBe("judge");
});
