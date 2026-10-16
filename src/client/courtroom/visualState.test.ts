import { expect, it } from "vitest";
import { expertVisual } from "./visualState";
import type { StageEvent } from "../../shared/types";
const event = (
  type: StageEvent["type"],
  expertId?: string,
  at = "2026-10-15T20:00:00Z",
): StageEvent => ({
  sessionId: "one",
  stage: "RUNNING_EXPERTS",
  at,
  type,
  expertId,
  summary: "A concise position.",
});
it("keeps expert animations independent and reacts to agreement", () => {
  const events = [event("EXPERT_STARTED", "A"), event("EXPERT_COMPLETED", "B")];
  expect(expertVisual(events, "A", true).state).toBe("thinking");
  expect(expertVisual(events, "B", true).state).toBe("speaking");
  expect(expertVisual(events, "C", true).state).toBe("waiting");
  expect(
    expertVisual(
      [
        ...events,
        event("CONSENSUS_REACHED", undefined, "2026-10-15T20:01:00Z"),
      ],
      "A",
      true,
    ).state,
  ).toBe("agreeing");
  expect(
    expertVisual([event("EXPERT_CHANGED_POSITION", "A")], "A", true).state,
  ).toBe("disagreeing");
});
