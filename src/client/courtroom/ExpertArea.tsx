import { AgentBot } from "../bot/AgentBot";
import { resolveAppearance } from "../../lib/characters/resolveAppearance";
import { expertVisual } from "./visualState";
import type { CouncilState } from "../hooks/useCouncil";
import type { StageEvent } from "../../shared/types";
export function ExpertArea({
  court,
  onSelect,
}: {
  court: CouncilState;
  onSelect: (index: number) => void;
}) {
  const events = (court.execution?.events || []) as StageEvent[];
  return (
    <div className={`expert-area seats-${court.count}`}>
      {Array.from({ length: court.count }, (_, i) => {
        const role = court.roles[i];
        const run = court.result?.experts.find((run) => run.expertIndex === i);
        const visual = expertVisual(
          events,
          role?.id || `expert-${i + 1}`,
          court.running,
        );
        const summary =
          visual.summary ||
          (run
            ? "reason" in run.answer
              ? run.answer.reason
              : run.answer.stance
            : undefined);
        return (
          <button
            className="expert-seat"
            key={role?.id || i}
            onClick={() => onSelect(i)}
            aria-label={
              role?.title ? `Inspect ${role.title}` : `Expert seat ${i + 1}`
            }
          >
            <div className={`speech-bubble ${summary ? "has-speech" : ""}`}>
              <div className="speech-bubble-content">
              {summary
                ? summary.slice(0, 200)
                : visual.state === "thinking"
                  ? "Let me think…"
                  : court.running
                    ? "Listening…"
                    : role?.title
                      ? "Ready when you are."
                      : "Ready to be summoned."}
              </div>
            </div>
            <AgentBot
              profession={resolveAppearance(role?.title, role?.domain, role && "visualCategory" in role ? role.visualCategory : undefined).category}
              state={
                run && court.running
                  ? "speaking"
                  : role && !court.running
                    ? "idle"
                    : visual.state
              }
              seed={`${court.execution?.id || "court"}:${role?.id || i}`}
            />
            <strong>{role?.title || `Expert ${i + 1}`}</strong>
            {role?.domain && <span className="metadata">{role.domain}</span>}
          </button>
        );
      })}
    </div>
  );
}
