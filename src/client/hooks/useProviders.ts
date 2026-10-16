import { useCallback, useEffect, useState } from "react";
import { api, type ModelConfig } from "../api";
import type { ProviderSnapshot } from "../../lib/ai/core/types";
export function useProviders() {
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [providers, setProviders] = useState<ProviderSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async (force = false) => {
    setLoading(true);
    setError("");
    try {
      const result = await api.providers(force);
      setModels(result.models);
      setProviders(result.providers);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not load models.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { models, providers, loading, error, refresh };
}
