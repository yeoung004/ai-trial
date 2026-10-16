import { z } from "zod";

export const SETTINGS_KEY = "ai-court-settings-v1";
const modelId = z.string().catch("");
const budget = (fallback: number) => z.number().int().min(50).max(2000).catch(fallback);

// Stored JSON is untrusted. Recover invalid fields independently so valid
// preferences survive older versions, partial writes, and manual edits.
export const settingsSchema = z.object({
  primaryProvider: z.string().refine((value) =>
    ["muse", "openai", "anthropic", "google", "meta", "compatible", "gateway"].includes(value),
  ).catch("muse"),
  roleGeneratorModelId: modelId,
  defaultExpertModelId: modelId,
  judgeModelId: modelId,
  expertModelOverrides: z.record(z.string().regex(/^[0-4]$/), z.string()).catch({}),
  maxDebateRounds: z.number().int().min(1).max(3).catch(3),
  maxCost: z.string().refine((value) => value === "" ||
    (value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) > 0),
  ).catch(""),
  reducedMotion: z.boolean().catch(false),
  tokenBudgets: z.object({
    roleGenerator: budget(250),
    yesNoExpert: budget(120),
    debateInitial: budget(220),
    debateRebuttal: budget(140),
    crossEvaluation: budget(100),
    judge: budget(650),
  }).catch({
    roleGenerator: 250, yesNoExpert: 120, debateInitial: 220,
    debateRebuttal: 140, crossEvaluation: 100, judge: 650,
  }),
});
export type Settings = z.infer<typeof settingsSchema>;
export const defaultSettings: Settings = settingsSchema.parse({});

export function parseSettings(raw: string | null): Settings {
  try {
    const saved: unknown = JSON.parse(raw ?? "{}");
    const result = settingsSchema.safeParse(saved);
    return result.success ? result.data : settingsSchema.parse({});
  } catch {
    return settingsSchema.parse({});
  }
}

export function readSettings(): Settings {
  try {
    return parseSettings(localStorage.getItem(SETTINGS_KEY));
  } catch {
    return parseSettings(null);
  }
}
