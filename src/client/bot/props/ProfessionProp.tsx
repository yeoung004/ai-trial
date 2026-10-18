import { professionRegistry } from "../../../lib/characters/professionRegistry";
import type { Profession } from "../outfits/ProfessionOutfit";
export function ProfessionProp({ profession: p }: { profession: Profession }) {
  return (
    <g
      data-testid={`accessory-${professionRegistry[p].accessory}`}
      stroke="#4E392C"
      strokeWidth="2"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {p === "teacher" ? (
        <g transform="translate(86 114)">
          <path d="M0 0Q13-4 25 2Q37-4 50 0V34Q36 30 25 36Q12 30 0 34Z" fill="#FFF8EC" />
          <path d="M25 2V36M6 8H19M31 8H44M6 15H19M31 15H44" fill="none" />
        </g>
      ) : p === "trainer" ? (
        <g transform="translate(85 125)">
          <path d="M4 12H55" strokeWidth="7" />
          <rect x="0" y="3" width="10" height="20" rx="2" fill="#708779" />
          <rect x="10" y="0" width="10" height="26" rx="2" fill="#A5B9B4" />
          <rect x="39" y="0" width="10" height="26" rx="2" fill="#A5B9B4" />
          <rect x="49" y="3" width="10" height="20" rx="2" fill="#708779" />
        </g>
      ) : p === "researcher" ? (
        <g transform="translate(110 107)">
          <path d="M8 0H24M11 0V15L0 38Q-2 44 5 44H29Q36 44 34 38L21 15V0" fill="#DDECE5" />
          <path d="M6 28H28L33 39Q34 42 28 42H6Q0 42 2 38Z" fill="#8DAE9A" stroke="none" />
          <circle cx="14" cy="32" r="3" fill="#FFF8EC" stroke="none" />
        </g>
      ) : p === "engineer" ? (
        <>
          <rect x="81" y="122" width="55" height="34" rx="4" fill="#A5B9B4" />
          <path d="M77 156H141" strokeWidth="5" />
          <circle cx="109" cy="138" r="4" fill="#FFF8EC" stroke="none" />
        </>
      ) : p === "judge" ? (
        <g className="gavel">
          <path d="M119 137L130 101" stroke="#B98B63" strokeWidth="8" />
          <rect
            x="117"
            y="87"
            width="31"
            height="17"
            rx="4"
            fill="#B98B63"
            transform="rotate(18 132 96)"
          />
          <path d="M120 90L145 98" stroke="#D5AE7E" />
        </g>
      ) : p === "doctor" ? (
        <>
          <path
            d="M62 100V115Q62 131 80 127Q94 127 94 115V100"
            fill="none"
            stroke="#708779"
            strokeWidth="4"
          />
          <path d="M80 127V139" fill="none" />
          <circle cx="80" cy="141" r="6" fill="#B5C2B0" />
        </>
      ) : p === "chef" ? (
        <>
          <path d="M129 142V109" strokeWidth="5" />
          <rect x="121" y="91" width="16" height="25" rx="5" fill="#B5C2B0" />
          <path d="M126 96V108M132 96V108" />
        </>
      ) : p === "lawyer" ? (
        <>
          <rect x="109" y="129" width="34" height="29" rx="4" fill="#B98B63" />
          <path d="M118 129V123H133V129M110 142H142" fill="none" />
        </>
      ) : p === "designer" ? (
        <path d="M119 145L135 109L138 111L123 146Z" fill="#D97842" />
      ) : ["economist", "researcher", "controls"].includes(p) ? (
        <>
          <rect
            x="108"
            y="111"
            width="31"
            height="42"
            rx="4"
            fill={p === "controls" ? "#A5B9B4" : "#FFF8EC"}
            transform="rotate(8 124 132)"
          />
          {p === "economist" ? (
            <path
              d="M115 140L121 133L127 136L132 121"
              fill="none"
              stroke="#D97842"
              strokeWidth="3"
            />
          ) : (
            <path d="M116 121H131M116 128H128M116 135H130" stroke="#8C9E8A" />
          )}
        </>
      ) : null}
    </g>
  );
}
