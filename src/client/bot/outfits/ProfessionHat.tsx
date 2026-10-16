import type { Profession } from "./ProfessionOutfit";
export function ProfessionHat({ profession: p }: { profession: Profession }) {
  return (
    <g stroke="#4E392C" strokeWidth="2.5" strokeLinejoin="round">
      {p === "chef" ? (
        <path
          d="M47 29V18Q30 7 47 2Q56-8 69 1Q82-9 94 1Q115-4 119 12Q121 20 112 23V29Z"
          fill="#FFFDF5"
        />
      ) : p === "controls" ? (
        <>
          <path d="M37 35Q40 5 80 5Q120 5 123 35Z" fill="#E7B95E" />
          <path d="M30 35H130M73 8V30M87 8V30" fill="none" />
        </>
      ) : p === "designer" ? (
        <>
          <path d="M34 28Q42 5 88 9Q124 10 124 27L109 33H47Z" fill="#9BAF9C" />
          <path d="M83 9L89 2" />
        </>
      ) : p === "judge" ? (
        <>
          <path d="M40 27L45 10Q80-2 115 10L120 27Z" fill="#594940" />
          <rect x="34" y="25" width="92" height="8" rx="4" fill="#88715A" />
          <circle cx="80" cy="16" r="5" fill="#E4B05F" />
        </>
      ) : p === "engineer" ? (
        <>
          <path
            d="M25 57V43Q25 15 80 15Q135 15 135 43V57"
            fill="none"
            stroke="#708779"
            strokeWidth="7"
          />
          <rect x="20" y="50" width="12" height="26" rx="5" fill="#708779" />
          <rect x="128" y="50" width="12" height="26" rx="5" fill="#708779" />
        </>
      ) : null}
      {["economist", "researcher"].includes(p) && (
        <g fill="none">
          <rect x="48" y="48" width="26" height="24" rx="8" />
          <rect x="86" y="48" width="26" height="24" rx="8" />
          <path d="M74 56H86" />
        </g>
      )}
    </g>
  );
}
