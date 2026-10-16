import { useEffect, useState } from "react";
import {
  api,
  type CouncilMode,
  type RoleMode,
  type CouncilRole,
  type ExecutionSnapshot,
  type HistoryEntry,
} from "../api";
import type { CouncilResult, StageEvent } from "../../shared/types";
import type { Settings } from "./useSettings";
export function useCouncil(settings: Settings) {
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<CouncilMode>("DEBATE");
  const [roleMode, setRoleMode] = useState<RoleMode>("AUTO");
  const [roles, setRoles] = useState<CouncilRole[]>([]);
  const [execution, setExecution] = useState<ExecutionSnapshot | null>(null);
  const [result, setResult] = useState<CouncilResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const running = execution?.status === "running";
  const count = mode === "YES_NO" ? 5 : 3;
  useEffect(() => {
    let active = true;
    void api
      .bootstrap()
      .then((data) => {
        if (active) setHistory(data.history);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!execution?.id || !running) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await api.execution(execution.id);
        if (!active) return;
        setExecution(next);
        const event = (next.events as StageEvent[] | undefined)
          ?.slice()
          .reverse()
          .find((item) => item.roles);
        if (event?.roles) setRoles(event.roles);
        if (next.status === "complete") {
          setResult(next.result as CouncilResult);
          const data = await api.bootstrap();
          if (active) setHistory(data.history);
        }
        if (next.status === "failed")
          setError(
            (next.error as { message?: string })?.message ||
              "The council could not finish.",
          );
        if (next.status === "running") timer = setTimeout(poll, 700);
      } catch (error) {
        if (active) {
          setError(
            error instanceof Error ? error.message : "Connection interrupted.",
          );
          timer = setTimeout(poll, 2500);
        }
      }
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [execution?.id, running]);
  function changeMode(value: CouncilMode) {
    setMode(value);
    setRoles(
      roleMode === "AUTO"
        ? []
        : Array.from(
            {
              length: roleMode === "MANUAL" ? (value === "YES_NO" ? 5 : 3) : 1,
            },
            (_, i) => ({ id: `expert-${i + 1}`, title: "", locked: true }),
          ),
    );
    setResult(null);
    setExecution(null);
    setError("");
  }
  function changeRoleMode(value: RoleMode) {
    setRoleMode(value);
    setRoles(
      value === "AUTO"
        ? []
        : Array.from({ length: value === "MANUAL" ? count : 1 }, (_, i) => ({
            id: `expert-${i + 1}`,
            title: "",
            locked: true,
          })),
    );
  }
  async function run() {
    setError("");
    if (!question.trim()) return setError("Write a question first.");
    if (!settings.judgeModelId)
      return setError(
        "Judge model unavailable. Choose a Judge in Settings → AI.",
      );
    if (
      !settings.defaultExpertModelId ||
      (roleMode !== "MANUAL" && !settings.roleGeneratorModelId)
    )
      return setError("Choose your council models in Settings → AI.");
    if (roleMode !== "AUTO" && roles.some((role) => !role.title.trim()))
      return setError("Name each specialist before starting.");
    const maxCost = settings.maxCost ? Number(settings.maxCost) : undefined;
    if (maxCost !== undefined && (!Number.isFinite(maxCost) || maxCost <= 0))
      return setError("Set a positive spending limit in Advanced Settings.");
    setBusy(true);
    setResult(null);
    setExecution(null);
    if (roleMode === "AUTO") setRoles([]);
    try {
      const response = await api.start({
        question,
        mode,
        roleMode,
        roles: roleMode === "AUTO" ? [] : roles,
        models: {
          roleGeneratorModelId: settings.roleGeneratorModelId,
          defaultExpertModelId: settings.defaultExpertModelId,
          judgeModelId: settings.judgeModelId,
          expertModelOverrides: settings.expertModelOverrides,
        },
        settings: {
          adaptiveCompute: "BALANCED",
          maxDebateRounds: settings.maxDebateRounds,
          maxCost,
          tokenBudgets: settings.tokenBudgets,
          consensus: { strongConfidence: 75, weakDissent: 60 },
        },
      });
      setExecution({ id: response.id, status: "running", events: [] });
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to start council.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (!execution) return;
    try {
      await api.cancel(execution.id);
      setExecution({ ...execution, status: "cancelled" });
    } catch (error) {
      setError(String(error));
    }
  }
  async function openHistory(id: string) {
    setBusy(true);
    try {
      const record = (await api.history(id)) as { result: CouncilResult };
      setResult(record.result);
      setQuestion(record.result.question);
      setMode(record.result.mode);
      setRoles(record.result.roles);
      setExecution(null);
      setError("");
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
    }
  }
  function reset() {
    setResult(null);
    setExecution(null);
    setQuestion("");
    setRoles([]);
    setRoleMode("AUTO");
    setError("");
  }
  return {
    question,
    setQuestion,
    mode,
    changeMode,
    roleMode,
    changeRoleMode,
    roles,
    setRoles,
    execution,
    result,
    error,
    busy,
    running: !!running,
    count,
    run,
    cancel,
    history,
    openHistory,
    reset,
  };
}
export type CouncilState = ReturnType<typeof useCouncil>;
