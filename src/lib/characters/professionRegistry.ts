export const professionRegistry = {
  doctor: { pattern: /doctor|physician|medic|health|nurs|therapist|의사|의학|의료|간호|물리치료|영양사/, accessory: "stethoscope" },
  teacher: { pattern: /teacher|educator|education|교사|선생|교육|교수/, accessory: "book" },
  trainer: { pattern: /personal trainer|fitness|strength|coach|트레이너|코치|헬스|근비대|운동생리/, accessory: "dumbbell" },
  controls: { pattern: /control|mechanical|industrial|construction|건설|건축|현장|기계|제어/, accessory: "helmet" },
  chef: { pattern: /chef|food|cook|요리|셰프|조리/, accessory: "spatula" },
  lawyer: { pattern: /lawyer|legal|attorney|law\b|policy|변호|법률|법학|정책/, accessory: "briefcase" },
  economist: { pattern: /econom|financ|invest|business|경제|금융|재무|투자|경영/, accessory: "chart" },
  designer: { pattern: /design|artist|creativ|디자인|디자이너|미술|예술/, accessory: "pencil" },
  researcher: { pattern: /research|scient|academ|연구|과학|생체역학|운동역학|해부학/, accessory: "flask" },
  engineer: { pattern: /engineer|software|develop|tech|data|엔지니어|개발|소프트웨어|프로그래머|데이터|기술/, accessory: "laptop" },
  general: { pattern: /$^/, accessory: "none" },
  judge: { pattern: /$^/, accessory: "gavel" },
} as const;
export type Profession = keyof typeof professionRegistry;
