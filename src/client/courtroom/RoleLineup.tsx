import type { CouncilState } from "../hooks/useCouncil";
export function RoleLineup({ court }: { court: CouncilState }) {
  if (court.roleMode === "AUTO" || court.result) return null;
  return (
    <section className="role-lineup" aria-label="Your specialists">
      <h2>Your specialists</h2>
      {court.roles.map((role, i) => (
        <div className="role-edit" key={i}>
          <label>
            Expert {i + 1}
            <input
              placeholder="Profession or specialty"
              value={role.title}
              disabled={court.running}
              onChange={(e) =>
                court.setRoles((roles) =>
                  roles.map((r, j) =>
                    i === j ? { ...r, title: e.target.value } : r,
                  ),
                )
              }
            />
          </label>
          <label>
            Focus{" "}
            <input
              placeholder="Optional instructions"
              value={role.instructions || ""}
              disabled={court.running}
              onChange={(e) =>
                court.setRoles((roles) =>
                  roles.map((r, j) =>
                    i === j ? { ...r, instructions: e.target.value } : r,
                  ),
                )
              }
            />
          </label>
        </div>
      ))}
      {court.roleMode === "HYBRID" && court.roles.length < court.count && (
        <button
          disabled={court.running}
          onClick={() =>
            court.setRoles((roles) => [...roles, { title: "", locked: true }])
          }
        >
          + Add specialist
        </button>
      )}
    </section>
  );
}
