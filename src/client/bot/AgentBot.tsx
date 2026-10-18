import { BotBody, BotShadow } from "./body/BotBody";
import { BotFace } from "./face/BotFace";
import { ProfessionOutfit, type Profession } from "./outfits/ProfessionOutfit";
import { ProfessionHat } from "./outfits/ProfessionHat";
import { ProfessionProp } from "./props/ProfessionProp";
export type AgentVisualState =
  | "entering"
  | "idle"
  | "thinking"
  | "speaking"
  | "agreeing"
  | "disagreeing"
  | "waiting";
export type JudgeVisualState = "idle" | "thinking" | "ready" | "ruling";
export function AgentBot({
  profession = "general",
  state = "idle",
  seed = "bot",
}: {
  profession?: Profession;
  state?: AgentVisualState | JudgeVisualState;
  seed?: string;
}) {
  const hash = [...seed].reduce(
    (a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) >>> 0,
    7,
  );
  return (
    <div
      className={`agent-bot bot-${state} ${profession === "judge" ? "judge-bot" : ""}`}
      style={{ "--delay": `${-(hash % 23) / 10}s` } as React.CSSProperties}
      data-testid="agent-bot"
      data-profession={profession}
      aria-hidden="true"
    >
      <svg viewBox="0 -10 160 185">
        <BotShadow />
        <g className="bot-body" data-testid="animated-body">
          <BotBody />
          <ProfessionOutfit profession={profession} />
          <g className="bot-head">
            <BotFace speaking={state === "speaking"} />
            <ProfessionHat profession={profession} />
          </g>
          <ProfessionProp profession={profession} />
        </g>
      </svg>
      {["thinking", "agreeing", "disagreeing"].includes(state) && (
        <span className="bot-emote">
          {state === "thinking" ? "···" : state === "agreeing" ? "✓" : "!"}
        </span>
      )}
    </div>
  );
}
