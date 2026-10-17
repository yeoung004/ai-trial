import { useState } from "react";
import { History, Settings } from "lucide-react";
import type { CouncilState } from "../hooks/useCouncil";
import { JudgeBench } from "./JudgeBench";
import { ExpertArea } from "./ExpertArea";
import { ExpertDetail } from "./ExpertDetail";
import { RoleLineup } from "./RoleLineup";
import { DialogueBox } from "../dialogue/DialogueBox";
export default function Courtroom({
  court,
  onSettings,
  onHistory,
}: {
  court: CouncilState;
  onSettings: () => void;
  onHistory: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <main className="courtroom-page">
      <header className="court-header">
        <a className="court-brand" href="/" onClick={(e) => e.preventDefault()}>
          <span>⚖</span> AI Court
        </a>
        <div>
          <button onClick={onHistory} aria-label="History">
            <History size={21} />
          </button>
          <button onClick={onSettings} aria-label="Settings">
            <Settings size={21} />
          </button>
        </div>
      </header>
      <section className="courtroom-scene" aria-label="AI courtroom">
        <div className="court-window window-left" />
        <div className="court-window window-right" />
        <div className="court-wall-line" />
        <JudgeBench
          ruling={court.result && ("decision" in court.result.judge
            ? `${court.result.judge.decision} — ${court.result.judge.summary}`
            : court.result.judge.conclusion) || undefined}
          notice={court.execution?.status === "failed"
            ? "The hearing stopped before a final ruling. Check the error below."
            : undefined}
          state={
            court.result
              ? "ruling"
              : court.running && court.execution?.stage === "JUDGING"
                ? "thinking"
                : court.running
                  ? "ready"
                  : "idle"
          }
        />
        <ExpertArea court={court} onSelect={setSelected} />
        <div className="podium">
          <span>✦</span>
          <span>THE COUNCIL</span>
          <span>✦</span>
        </div>
      </section>
      <DialogueBox court={court} />
      <RoleLineup court={court} />
      {selected !== null && (
        <ExpertDetail
          index={selected}
          court={court}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
}
