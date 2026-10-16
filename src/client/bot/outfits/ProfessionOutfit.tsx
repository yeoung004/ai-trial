export type Profession =
  | "engineer"
  | "chef"
  | "doctor"
  | "economist"
  | "controls"
  | "lawyer"
  | "researcher"
  | "designer"
  | "general"
  | "judge";
export function professionFor(title = "", domain = ""): Profession {
  const text = `${title} ${domain}`.toLowerCase();
  if (/control|mechanical|industrial|construction/.test(text))
    return "controls";
  if (/doctor|medic|health|nurs/.test(text)) return "doctor";
  if (/chef|food|cook|nutrition/.test(text)) return "chef";
  if (/law|legal|policy/.test(text)) return "lawyer";
  if (/econom|financ|invest|business/.test(text)) return "economist";
  if (/design|art|creativ/.test(text)) return "designer";
  if (/research|scient|academ/.test(text)) return "researcher";
  if (/engineer|software|develop|tech|data/.test(text)) return "engineer";
  return "general";
}
export function ProfessionOutfit({
  profession: p,
}: {
  profession: Profession;
}) {
  const color = {
    engineer: "#9CB2A0",
    chef: "#DDA37F",
    doctor: "#fffdf5",
    economist: "#B1A087",
    controls: "#E3B766",
    lawyer: "#74695F",
    researcher: "#fffdf5",
    designer: "#B9A48C",
    general: "#D6AB83",
    judge: "#594940",
  }[p];
  return (
    <g stroke="#4E392C" strokeWidth="2" strokeLinejoin="round">
      <path d="M51 100L63 94H97L109 100L114 145Q80 160 46 145Z" fill={color} />
      {["doctor", "researcher"].includes(p) ? (
        <>
          <path
            d="M69 96L77 116L69 128M91 96L83 116L91 128M80 116V151"
            fill="none"
          />
          <rect x="91" y="120" width="14" height="10" rx="2" fill="#F3E7D5" />
        </>
      ) : p === "judge" ? (
        <>
          <path d="M65 94L80 113L95 94L91 117H69Z" fill="#FFF8EC" />
          <path d="M62 120V147M98 120V147" stroke="#8A7362" />
        </>
      ) : p === "chef" ? (
        <>
          <path d="M63 99V118H97V99M61 118L57 146H103L99 118Z" fill="#FFF8EC" />
          <path d="M70 129H90V139H70Z" fill="#F3E7D5" />
        </>
      ) : p === "engineer" ? (
        <>
          <path d="M60 98Q80 119 100 98M69 108V123M91 108V123" fill="none" />
          <path d="M63 132Q80 126 97 132V143H63Z" fill="#C0CDB9" />
        </>
      ) : p === "controls" ? (
        <>
          <path
            d="M64 99V150M96 99V150M49 132H111"
            stroke="#FFF8EC"
            strokeWidth="7"
          />
        </>
      ) : (
        <>
          <path d="M63 96L80 116L97 96M80 116V150" fill="none" />
          {["lawyer", "economist"].includes(p) && (
            <path
              d="M75 104H85L82 115L86 134L80 140L74 134L78 115Z"
              fill="#D97842"
            />
          )}
        </>
      )}
    </g>
  );
}
