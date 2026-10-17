import { z } from "zod";
import { DEFAULT_TOKEN_BUDGETS } from "../../shared/tokenBudgets";
import { PROVIDER_IDS } from "../../shared/types";

export const SETTINGS_KEY = "ai-court-settings-v1";
const modelId = z.string().refine((value) => value === "" ||
  (PROVIDER_IDS.some((id) => value.startsWith(`${id}:`)) && value.split(":").slice(1).join(":").length > 0),
).catch("");
const budget = (fallback: number) => z.number().int().min(50).max(2000).catch(fallback);

// Stored JSON is untrusted. Recover invalid fields independently so valid
// preferences survive older versions, partial writes, and manual edits.
export const settingsSchema = z.object({
  outputBudgetVersion: z.literal(2).catch(2),
  primaryProvider: z.string().refine((value) =>
    value === "" || PROVIDER_IDS.some((id) => id === value),
  ).catch(""),
  roleGeneratorModelId: modelId,
  defaultExpertModelId: modelId,
  judgeModelId: modelId,
  expertModelOverrides: z.record(z.string().regex(/^[0-4]$/), modelId).catch({})
    .transform((values) => Object.fromEntries(Object.entries(values).filter(([, value]) => value !== ""))),
  maxDebateRounds: z.number().int().min(1).max(3).catch(3),
  maxCost: z.string().refine((value) => value === "" ||
    (value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) > 0),
  ).catch(""),
  reducedMotion: z.boolean().catch(false),
  tokenBudgets: z.object({
    roleGenerator: budget(DEFAULT_TOKEN_BUDGETS.roleGenerator),
    yesNoExpert: budget(DEFAULT_TOKEN_BUDGETS.yesNoExpert),
    debateInitial: budget(DEFAULT_TOKEN_BUDGETS.debateInitial),
    debateRebuttal: budget(DEFAULT_TOKEN_BUDGETS.debateRebuttal),
    crossEvaluation: budget(DEFAULT_TOKEN_BUDGETS.crossEvaluation),
    judge: budget(DEFAULT_TOKEN_BUDGETS.judge),
  }).catch(DEFAULT_TOKEN_BUDGETS),
});
export type Settings = z.infer<typeof settingsSchema>;
export const defaultSettings: Settings = settingsSchema.parse({});

export function parseSettings(raw: string | null): Settings {
  try {
    const saved: unknown = JSON.parse(raw ?? "{}");
    // Upgrade only the complete old default profile. Preserve custom budgets.
    const legacy = z.object({ outputBudgetVersion: z.unknown().optional(), tokenBudgets: z.record(z.string(), z.number()) }).safeParse(saved);
    const oldDefaults = { roleGenerator: 250, yesNoExpert: 120, debateInitial: 220, debateRebuttal: 140, crossEvaluation: 100, judge: 650 };
    const upgrade = legacy.success && legacy.data.outputBudgetVersion !== 2 &&
      Object.entries(oldDefaults).every(([key, value]) => legacy.data.tokenBudgets[key] === value);
    const result = settingsSchema.safeParse(upgrade
      ? { ...saved as Record<string, unknown>, tokenBudgets: DEFAULT_TOKEN_BUDGETS }
      : saved);
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
