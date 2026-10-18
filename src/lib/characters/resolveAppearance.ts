import { normalizeProfession } from "./normalizeProfession";
import { professionRegistry, type Profession } from "./professionRegistry";
export function resolveAppearance(title = "", domain = "", visualCategory?: unknown) {
  let category: Profession = "general";
  if (typeof visualCategory === "string" && Object.hasOwn(professionRegistry, visualCategory) && visualCategory !== "judge") {
    category = visualCategory as Profession;
  } else {
    // A precise title takes precedence over broader words in the domain.
    for (const value of [title, domain]) {
      const normalized = normalizeProfession(value);
      const match = (Object.keys(professionRegistry) as Profession[]).find((key) => professionRegistry[key].pattern.test(normalized));
      if (match) { category = match; break; }
    }
  }
  return { category, accessory: professionRegistry[category].accessory };
}
