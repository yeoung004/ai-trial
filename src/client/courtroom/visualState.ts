import type { StageEvent } from "../../shared/types";
import type { AgentVisualState } from "../bot/AgentBot";
export function expertVisual(
  events: StageEvent[],
  expertId: string,
  running: boolean,
): { state: AgentVisualState; summary?: string } {
  const event = events
    .slice()
    .reverse()
    .find((event) => event.expertId === expertId);
  if (event?.type === "EXPERT_FAILED")
    return { state: "idle", summary: event.message || "This expert could not finish." };
  if (!running) return { state: "idle", summary: event?.summary };
  const consensus = events
    .slice()
    .reverse()
    .find((event) => event.type === "CONSENSUS_REACHED");
  if (consensus && (!event || consensus.at >= event.at))
    return { state: "agreeing", summary: event?.summary };
  if (event?.type === "EXPERT_CHANGED_POSITION")
    return { state: "disagreeing", summary: event.summary };
  if (event?.type === "EXPERT_COMPLETED")
    return { state: "speaking", summary: event.summary };
  if (event?.type === "EXPERT_STARTED" && running) return { state: "thinking" };
  const seated = events
    .slice()
    .reverse()
    .find(
      (event) =>
        event.type === "ROLES_CREATED" &&
        event.roles?.some((role) => role.id === expertId),
    );
  if (seated && !event && running) return { state: "entering" };
  return { state: running ? "waiting" : "idle" };
}
