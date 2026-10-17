import { AgentBot, type JudgeVisualState } from "../bot/AgentBot";
export function JudgeBench({ state, notice, ruling }: { state: JudgeVisualState; notice?: string; ruling?: string }) {
  return (
    <div className={`judge-dais judge-${state}`}>
      <span className="judge-label">THE JUDGE</span>
      {ruling && (
        <div className="judge-ruling-preview" role="status" aria-label="Judge conclusion">
          <p>{ruling}</p>
          <a href="#judge-ruling">Read the full ruling ↓</a>
        </div>
      )}
      {!ruling && state === "thinking" && <p role="status">Considering the council’s arguments…</p>}
      <AgentBot profession="judge" state={state} />
      {notice && <p className="speech-bubble has-speech" role="status">{notice}</p>}
      <div className="bench-top" />
      <div className="bench-front">
        <span>✦</span>
        <span>COURT OF GOOD IDEAS</span>
        <span>✦</span>
      </div>
    </div>
  );
}
