import { describe, expect, it, vi, afterEach } from "vitest";
import { defaultSettings, parseSettings, readSettings } from "./storage";

afterEach(() => vi.unstubAllGlobals());
describe("stored settings", () => {
  it.each([null, "{", "null", "[]", '"text"', "42"])("recovers invalid root %s", (raw) => {
    expect(parseSettings(raw)).toEqual(defaultSettings);
  });
  it("restores partial preferences and strips unknown fields", () => {
    const result = parseSettings(JSON.stringify({
      judgeModelId: "muse:chosen", reducedMotion: true, unexpected: "ignored",
      tokenBudgets: { judge: 900, secret: "ignored" },
    }));
    expect(result).toEqual({ ...defaultSettings, judgeModelId: "muse:chosen", reducedMotion: true,
      tokenBudgets: { ...defaultSettings.tokenBudgets, judge: 900 } });
  });
  it("rejects wrong types and out-of-range values without discarding valid fields", () => {
    expect(parseSettings(JSON.stringify({
      primaryProvider: "bogus", reducedMotion: "false", judgeModelId: {},
      maxDebateRounds: 99, maxCost: "-1", expertModelOverrides: null,
      roleGeneratorModelId: "muse:valid",
      tokenBudgets: { judge: -2, debateInitial: "220", yesNoExpert: 160 },
    }))).toEqual({ ...defaultSettings, roleGeneratorModelId: "muse:valid",
      tokenBudgets: { ...defaultSettings.tokenBudgets, yesNoExpert: 160 } });
  });
  it("handles inaccessible storage", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); } });
    expect(readSettings()).toEqual(defaultSettings);
  });
  it("round trips model overrides", () => {
    const saved = { ...defaultSettings, expertModelOverrides: { 0: "muse:first", 4: "muse:last" } };
    expect(parseSettings(JSON.stringify(saved))).toEqual(saved);
  });
});
