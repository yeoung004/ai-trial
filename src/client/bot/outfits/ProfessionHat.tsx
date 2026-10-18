import type { Profession } from "./ProfessionOutfit";
export function ProfessionHat({ profession: p }: { profession: Profession }) {
  return (
    <g
      stroke="#FFFFFF"
      strokeWidth="4"
      strokeLinejoin="round"
      paintOrder="stroke fill"
    >
      {p === "chef" ? (
        <path
          d="M47 29V18Q30 7 47 2Q56-8 69 1Q82-9 94 1Q115-4 119 12Q121 20 112 23V29Z"
          fill="#FFFDF5"
        />
      ) : p === "controls" ? (
        <g data-testid="hat-helmet">
          <path d="M37 35Q40 5 80 5Q120 5 123 35Z" fill="#E7B95E" />
          <path d="M30 35H130M73 8V30M87 8V30" fill="none" />
        </g>
      ) : p === "designer" ? (
        <>
          <path d="M34 28Q42 5 88 9Q124 10 124 27L109 33H47Z" fill="#9BAF9C" />
          <path d="M83 9L89 2" />
        </>
      ) : p === "judge" ? (
        <>
          <path d="M42 27V10H118V27Z" fill="#594940" />
          <rect x="34" y="25" width="92" height="8" fill="#88715A" />
          <rect
            x="76"
            y="13"
            width="8"
            height="8"
            fill="#E4B05F"
            stroke="none"
          />
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
        <g fill="none" stroke="#4E392C" strokeWidth="2.5">
          <rect x="40" y="52" width="25" height="27" />
          <rect x="95" y="52" width="25" height="27" />
          <path d="M65 62H95" />
        </g>
      )}
    </g>
  );
}
