import { useEffect, useState } from "react";
import { readSettings, SETTINGS_KEY } from "../settings/storage";
export { defaultSettings } from "../settings/storage";
export type { Settings } from "../settings/storage";

export function useSettings() {
  const [settings, setSettings] = useState(readSettings);
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Storage can be unavailable or full; keep this session usable.
    }
    document.documentElement.dataset.motion = settings.reducedMotion
      ? "reduced"
      : "full";
  }, [settings]);
  return { settings, setSettings };
}
