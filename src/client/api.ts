import type { ProviderSnapshot } from "../lib/ai/core/types";
export type CouncilMode = "YES_NO" | "DEBATE";
export type RoleMode = "AUTO" | "MANUAL" | "HYBRID";
export type AdaptiveCompute = "LOW" | "BALANCED" | "HIGH";

export interface ModelConfig {
  id: string;
  provider: string;
  model: string;
  displayName: string;
  tier: "economy" | "standard" | "premium" | "judge";
  inputCostPerMillion?: number;
  outputCostPerMillion?: number;
  maxContextTokens?: number;
  enabled: boolean;
}

export interface CouncilRole {
  id?: string;
  title: string;
  domain?: string;
  reason?: string;
  primaryQuestion?: string;
  instructions?: string;
  modelOverride?: string | null;
  locked?: boolean;
}

export interface TokenBudgets {
  roleGenerator: number;
  yesNoExpert: number;
  debateInitial: number;
  debateRebuttal: number;
  crossEvaluation: number;
  judge: number;
}

export interface CouncilRequest {
  question: string;
  mode: CouncilMode;
  roleMode: RoleMode;
  roles: CouncilRole[];
  approvedRoles?: CouncilRole[];
  previewId?: string;
  models: {
    roleGeneratorModelId?: string;
    defaultExpertModelId: string;
    judgeModelId: string;
    expertModelOverrides?: Record<number, string>;
  };
  settings: {
    adaptiveCompute: AdaptiveCompute;
    maxCost?: number;
    maxDebateRounds: number;
    tokenBudgets: TokenBudgets;
    consensus: { strongConfidence: number; weakDissent: number };
    runImmediately?: boolean;
  };
}

export interface ExecutionSnapshot {
  id: string;
  status: string;
  stage?: string;
  result?: unknown;
  error?: unknown;
  warning?: unknown;
  events?: unknown[];
}

export type HistoryEntry = Record<string, unknown> & { id?: string };
export type ProviderKeys = Record<
  "gateway" | "openai" | "anthropic" | "google",
  boolean
>;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const raw = await response.text();
  let body: unknown = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = raw;
  }
  if (!response.ok) {
    const object =
      body && typeof body === "object"
        ? (body as Record<string, unknown>)
        : null;
    const error = object?.error;
    const message =
      typeof error === "object" && error !== null
        ? (error as Record<string, unknown>).message
        : (error ??
          object?.message ??
          body ??
          `Request failed (${response.status})`);
    throw new Error(
      typeof message === "string" ? message : JSON.stringify(message),
    );
  }
  return body as T;
}

export const api = {
  providers: (refresh = false) =>
    request<{ models: ModelConfig[]; providers: ProviderSnapshot[] }>(
      `/api/providers?refresh=${refresh}`,
    ),
  bootstrap: () =>
    request<{
      models: ModelConfig[];
      history: HistoryEntry[];
      providerKeys: ProviderKeys;
    }>("/api/bootstrap"),
  previewRoles: (data: CouncilRequest) =>
    request<{
      roles: CouncilRole[];
      previewId?: string;
      usage?: { totalCost?: number; costComplete?: boolean };
    }>("/api/roles", { method: "POST", body: JSON.stringify(data) }),
  start: (data: CouncilRequest) =>
    request<{ id: string }>("/api/executions", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  execution: (id: string) =>
    request<ExecutionSnapshot>(`/api/executions/${encodeURIComponent(id)}`),
  cancel: (id: string) =>
    request<ExecutionSnapshot>(`/api/executions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  history: (id: string) =>
    request<unknown>(`/api/history/${encodeURIComponent(id)}`),
  saveModels: (models: ModelConfig[]) =>
    request<{ models?: ModelConfig[] }>("/api/models", {
      method: "PUT",
      body: JSON.stringify({ models }),
    }),
};
