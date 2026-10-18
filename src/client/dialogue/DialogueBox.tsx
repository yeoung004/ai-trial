import type { CouncilState } from "../hooks/useCouncil";
export function DialogueBox({ court, view = "input" }: { court: CouncilState; view?: "input" | "ruling" }) {
  const judge = view === "ruling" ? court.result?.judge : undefined;
  return (
    <section
      id={judge ? "judge-ruling" : undefined}
      className="dialogue-box"
      aria-label={judge ? "Judge ruling" : "Ask the council"}
    >
      {judge ? (
        <>
          <span className="dialogue-speaker">THE JUDGE</span>
          {court.result?.degraded && (
            <p className="error-message">
              Some specialists could not finish. This ruling uses the available
              expert responses.
            </p>
          )}
          <h2>{"decision" in judge ? judge.decision : "The ruling"}</h2>
          <p className="ruling-copy">
            {"summary" in judge ? judge.summary : judge.conclusion}
          </p>
          <p>
            {"main_reason" in judge
              ? judge.main_reason
              : judge.strongest_reason}
          </p>
          <p>
            <b>{"key_risk" in judge ? "Keep in mind: " : "Next step: "}</b>
            {"key_risk" in judge ? judge.key_risk : judge.recommendation}
          </p>
          <p className="metadata">
            {court.result?.usage.costComplete && court.result.usage.totalCost != null
              ? `Estimated cost: $${court.result.usage.totalCost.toFixed(4)}`
              : "Cost unavailable"}
          </p>
          <button className="primary" onClick={court.reset}>
            Ask another question →
          </button>
        </>
      ) : (
        <>
          <label className="dialogue-speaker" htmlFor="court-question">
            YOUR QUESTION
          </label>
          <textarea
            id="court-question"
            placeholder="What shall the council decide?"
            value={court.question}
            onChange={(event) => court.setQuestion(event.target.value)}
            maxLength={5000}
            disabled={court.running}
          />
          <div className="dialogue-controls">
            <div className="question-options">
              <div className="segmented" aria-label="Council mode">
                {(["YES_NO", "DEBATE"] as const).map((mode) => (
                  <button
                    key={mode}
                    aria-pressed={court.mode === mode}
                    onClick={() => court.changeMode(mode)}
                    disabled={court.running}
                  >
                    {mode === "YES_NO" ? "YES / NO" : "DEBATE"}
                  </button>
                ))}
              </div>
              <div className="segmented" aria-label="Role assignment">
                {(["AUTO", "MANUAL", "HYBRID"] as const).map((mode) => (
                  <button
                    key={mode}
                    aria-pressed={court.roleMode === mode}
                    onClick={() => court.changeRoleMode(mode)}
                    disabled={court.running}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
            {court.running ? (
              <button onClick={() => void court.cancel()}>Stop</button>
            ) : (
              <button
                className="primary send-button"
                aria-label="Summon the council"
                disabled={court.busy || !court.question.trim()}
                onClick={() => void court.run()}
              >
                Summon <span>➤</span>
              </button>
            )}
          </div>
        </>
      )}
      {view === "input" && court.error && (
        <p className="error-message" role="alert">
          {court.error}
        </p>
      )}
    </section>
  );
}
