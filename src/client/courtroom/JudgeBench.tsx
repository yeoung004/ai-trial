import { AgentBot, type JudgeVisualState } from "../bot/AgentBot";
export function JudgeBench({ state }: { state: JudgeVisualState }) {
  return (
    <div className={`judge-dais judge-${state}`}>
      <span className="judge-label">THE JUDGE</span>
      <AgentBot profession="judge" state={state} />
      <div className="bench-top" />
      <div className="bench-front">
        <span>✦</span>
        <span>COURT OF GOOD IDEAS</span>
        <span>✦</span>
      </div>
    </div>
  );
}
