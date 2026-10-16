export function words(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

export function validateDebateBrevity(answer: {
  stance: string;
  core_claims: string[];
  strongest_evidence: string[];
  main_objection: string;
  new_information: string[];
  remaining_uncertainty: string;
}) {
  if (
    words(answer.stance) > 25 ||
    answer.core_claims.some((claim) => words(claim) > 30) ||
    answer.strongest_evidence.some((item) => words(item) > 30) ||
    words(answer.main_objection) > 40 ||
    answer.new_information.some((item) => words(item) > 30) ||
    words(answer.remaining_uncertainty) > 30
  ) {
    throw new Error("Debate output exceeded the concise field limits");
  }
}
