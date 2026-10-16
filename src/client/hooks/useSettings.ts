import { useEffect, useState } from "react";
export const defaultSettings = {
  primaryProvider: "muse",
  roleGeneratorModelId: "",
  defaultExpertModelId: "",
  judgeModelId: "",
  expertModelOverrides: {} as Record<number, string>,
  maxDebateRounds: 3,
  maxCost: "",
  reducedMotion: false,
  tokenBudgets: {
    roleGenerator: 250,
    yesNoExpert: 120,
    debateInitial: 220,
    debateRebuttal: 140,
    crossEvaluation: 100,
    judge: 650,
  },
};
export type Settings = typeof defaultSettings;
function readSettings(): Settings {
  try {
    const saved = JSON.parse(
      localStorage.getItem("ai-court-settings-v1") || "{}",
    );
    return {
      ...defaultSettings,
      ...saved,
      tokenBudgets: { ...defaultSettings.tokenBudgets, ...saved.tokenBudgets },
    };
  } catch {
    return defaultSettings;
  }
}
export function useSettings() {
  const [settings, setSettings] = useState(readSettings);
  useEffect(() => {
    localStorage.setItem("ai-court-settings-v1", JSON.stringify(settings));
    document.documentElement.dataset.motion = settings.reducedMotion
      ? "reduced"
      : "full";
  }, [settings]);
  return { settings, setSettings };
}
