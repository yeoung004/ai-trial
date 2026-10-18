import type { Profession } from "../../../lib/characters/professionRegistry";
export type { Profession } from "../../../lib/characters/professionRegistry";
export function ProfessionOutfit({
  profession: p,
}: {
  profession: Profession;
}) {
  if (p === "general") return null;
  const color = {
    teacher: "#8C9EAD",
    trainer: "#738E7C",
    engineer: "#738E7C",
    chef: "#FFF8EC",
    doctor: "#FFF8EC",
    economist: "#8D795D",
    controls: "#E8B953",
    lawyer: "#586675",
    researcher: "#FFF8EC",
    designer: "#93A084",
    judge: "#4D3C36",
  }[p];
  return (
    <g strokeLinejoin="miter">
      <path d="M33 99H127V120H33Z" fill={color} />
      {p === "judge" ? (
        <>
          <path d="M64 99H96L89 113H71Z" fill="#FFF8EC" />
          <path d="M50 104V120M110 104V120" stroke="#806B5D" strokeWidth="3" />
        </>
      ) : ["doctor", "researcher"].includes(p) ? (
        <>
          <path
            d="M70 99L78 109L70 119M90 99L82 109L90 119"
            stroke="#B5B6A5"
            strokeWidth="2"
            fill="none"
          />
          <path d="M103 105V115M98 110H108" stroke="#D77756" strokeWidth="3" />
        </>
      ) : p === "chef" ? (
        <path
          d="M62 99V113H98V99"
          fill="none"
          stroke="#D8BA98"
          strokeWidth="3"
        />
      ) : p === "controls" ? (
        <path
          d="M51 99V120M109 99V120M33 113H127"
          stroke="#FFF8EC"
          strokeWidth="4"
        />
      ) : p === "engineer" ? (
        <>
          <path
            d="M64 99L80 109L96 99M69 103V114M91 103V114"
            stroke="#C9D6C6"
            strokeWidth="2"
            fill="none"
          />
        </>
      ) : ["lawyer", "economist"].includes(p) ? (
        <>
          <path d="M65 99L80 114L95 99" fill="#FFF8EC" />
          <path d="M77 100H83L82 107L85 117H75L78 107Z" fill="#D77756" />
        </>
      ) : null}
    </g>
  );
}
