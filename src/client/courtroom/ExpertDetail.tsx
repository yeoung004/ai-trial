import { useEffect, useRef } from "react";
import type { CouncilState } from "../hooks/useCouncil";
export function ExpertDetail({
  index,
  court,
  onClose,
}: {
  index: number;
  court: CouncilState;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const role = court.roles[index];
  const run = court.result?.experts.find((run) => run.expertIndex === index);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  return (
    <dialog ref={dialog} className="expert-dialog" onCancel={onClose}>
      <button
        className="dialog-close"
        onClick={onClose}
        aria-label="Close expert details"
      >
        ×
      </button>
      <h2>{role?.title || `Expert ${index + 1}`}</h2>
      <p>
        {role?.reason ||
          "A specialist will take this seat when the council begins."}
      </p>
      {role?.primaryQuestion && <p>{role.primaryQuestion}</p>}
      {run && (
        <dl>
          {Object.entries(run.answer).map(([key, value]) => (
            <div key={key}>
              <dt>{key.replace(/_/g, " ")}</dt>
              <dd>
                {Array.isArray(value) ? value.join(" · ") : String(value)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </dialog>
  );
}
