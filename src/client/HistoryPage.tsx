import type { CouncilState } from "./hooks/useCouncil";
export function HistoryPage({
  court,
  onBack,
}: {
  court: CouncilState;
  onBack: () => void;
}) {
  return (
    <main className="settings-page">
      <header>
        <button onClick={onBack}>← Courtroom</button>
        <h1>Past rulings</h1>
      </header>
      {court.history.length ? (
        court.history.map((entry, i) => (
          <button
            className="history-entry"
            disabled={court.busy}
            key={String(entry.id || i)}
            onClick={() =>
              void court.openHistory(String(entry.id)).then(onBack)
            }
          >
            <strong>{String(entry.question || "Council ruling")}</strong>
            <span className="metadata">
              {new Date(String(entry.createdAt)).toLocaleString()} ·{" "}
              {String(entry.mode).replace("_", " / ")}
            </span>
          </button>
        ))
      ) : (
        <p>No rulings yet.</p>
      )}
    </main>
  );
}
