import type {
  CandidateWeights,
  ConsensusSettings,
  DebateExpertRun,
  PeerEvaluation,
  CandidateScore,
} from "../../shared/types.js";

export class CouncilError extends Error {
  constructor(
    public readonly code:
      | "INVALID_REQUEST"
      | "BINARY_REFRAME_REQUIRED"
      | "JUDGE_MODEL_REQUIRED"
      | "MODEL_NOT_AVAILABLE"
      | "EXPERT_QUORUM_FAILED"
      | "JUDGE_FAILED"
      | "ROLE_GENERATION_FAILED"
      | "BUDGET_EXCEEDED"
      | "CANCELLED"
      | "ENGINE_FAILED",
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CouncilError";
  }
}

export function binaryProposition(question: string): string {
  const value = question.trim().replace(/\s+/g, " ");
  if (!value) throw new CouncilError("INVALID_REQUEST", "Enter a question.");
  if (/^(what|which|how|why|who|where|when)\b/i.test(value) || /\b(or)\b/i.test(value) && /^(should|can|would|could|is|are|do|does)\b/i.test(value)) {
    throw new CouncilError(
      "BINARY_REFRAME_REQUIRED",
      "This question needs a specific YES or NO proposition.",
      { suggestion: "Rewrite it as a question such as ‘Should I use PostgreSQL for this application?’" },
    );
  }
  if (/^(should|is|are|can|could|would|will|do|does|did|has|have|had|may|might|must|whether)\b/i.test(value)) return value;
  if (/^(tell me|help me|decide)\b.*\b(if|whether)\b/i.test(value)) return value;
  if (/[?]$/.test(value) && /\b(true|false|appropriate|suitable|worth|better|likely|safe|feasible)\b/i.test(value)) return value;
  if (!/[?]$/.test(value) && /\b(is|are|will|would|should|can|does|has)\b/i.test(value)) return value;
  throw new CouncilError(
    "BINARY_REFRAME_REQUIRED",
    "This question needs a specific YES or NO proposition.",
    { suggestion: "State the proposal to evaluate, then ask whether it is advisable or true." },
  );
}

function stanceTokens(stance: string): string[] {
  const stop = new Set(["a", "an", "and", "are", "as", "be", "best", "better", "by", "choose", "choice", "database", "for", "from", "good", "i", "in", "is", "it", "main", "of", "on", "option", "or", "prefer", "preferred", "primary", "recommend", "recommended", "right", "should", "solution", "storage", "strategy", "suitable", "the", "to", "use", "using", "we", "would", "yes", "no", "not", "avoid", "reject"]);
  return stance.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((token) => token && !stop.has(token)).map((token) => token === "postgres" || token === "pg" ? "postgresql" : token.replace(/s$/, ""));
}

export function stancesCompatible(a: string, b: string, threshold = 0.75): boolean {
  const first = stanceTokens(a);
  const second = stanceTokens(b);
  const polarity = (value: string) => {
    if (/\b(no|not|never|avoid|against|reject|delay|unsuitable|poor|worse|don.t|shouldn.t|cannot|isn.t)\b/i.test(value)) return -1;
    if (/\b(yes|adopt|choose|recommend|favor|prefer|use|best|suitable|good|ship|launch)\b/i.test(value)) return 1;
    return 0;
  };
  const firstPolarity = polarity(a);
  const secondPolarity = polarity(b);
  if (firstPolarity && secondPolarity && firstPolarity !== secondPolarity) return false;
  if (a.trim().toLowerCase() === b.trim().toLowerCase()) return true;
  const aSet = new Set(first);
  const bSet = new Set(second);
  const union = new Set([...aSet, ...bSet]);
  if (!union.size) return firstPolarity !== 0 && firstPolarity === secondPolarity;
  if ((!aSet.size || !bSet.size) && firstPolarity && firstPolarity === secondPolarity) return true;
  const intersection = [...aSet].filter((token) => bSet.has(token)).length;
  return intersection / union.size >= threshold || (intersection / Math.min(aSet.size, bSet.size) >= threshold && intersection / union.size >= 0.4);
}

export function hasHighSeverityObjection(run: DebateExpertRun): boolean {
  const objection = run.answer.main_objection.toLowerCase();
  return /\b(fatal|critical|unsafe|impossible|invalid|contradict|disprove|unworkable|harmful)\b/.test(objection);
}

export function detectConsensus(runs: DebateExpertRun[], options: ConsensusSettings = {}): boolean {
  if (runs.length < 2) return false;
  const strong = options.strongConfidence ?? 75;
  const weak = options.weakDissent ?? 60;
  const similarity = options.stanceSimilarity ?? 0.75;
  const compatible = (a: DebateExpertRun, b: DebateExpertRun) => stancesCompatible(a.answer.stance, b.answer.stance, similarity);
  if (runs.every((run) => compatible(run, runs[0])) && !runs.some(hasHighSeverityObjection)) return true;
  if (runs.length !== 3) return false;
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      const dissent = runs.find((_, index) => index !== i && index !== j)!;
      if (
        compatible(runs[i], runs[j]) &&
        runs[i].answer.confidence >= strong &&
        runs[j].answer.confidence >= strong &&
        dissent.answer.confidence < weak &&
        !hasHighSeverityObjection(dissent)
      ) return true;
    }
  }
  return false;
}

export function disagreements(runs: DebateExpertRun[], similarity = 0.75): string[] {
  const result: string[] = [];
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      if (!stancesCompatible(runs[i].answer.stance, runs[j].answer.stance, similarity)) {
        result.push(`Expert ${String.fromCharCode(65 + runs[i].expertIndex)}: ${runs[i].answer.stance}; Expert ${String.fromCharCode(65 + runs[j].expertIndex)}: ${runs[j].answer.stance}`);
      }
    }
  }
  return result.slice(0, 3);
}

export function severeDisagreement(runs: DebateExpertRun[], similarity = 0.75): boolean {
  return runs.some((a, i) => runs.some((b, j) => i < j && a.answer.confidence >= 75 && b.answer.confidence >= 75 && !stancesCompatible(a.answer.stance, b.answer.stance, similarity))) || runs.some(hasHighSeverityObjection);
}

export function normalizeCandidateWeights(weights: CandidateWeights = {}) {
  const raw = {
    peerAccuracy: weights.peerAccuracy ?? 0.45,
    evidenceStrength: weights.evidenceStrength ?? 0.25,
    domainRelevance: weights.domainRelevance ?? 0.20,
    originalConfidence: weights.originalConfidence ?? 0.10,
  };
  const values = Object.values(raw);
  if (values.some((v) => !Number.isFinite(v) || v < 0) || values.reduce((a, b) => a + b, 0) <= 0) {
    throw new CouncilError("INVALID_REQUEST", "Candidate weights must be nonnegative and have a positive sum.");
  }
  const sum = values.reduce((a, b) => a + b, 0);
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, value / sum])) as typeof raw;
}

export function rankCandidates(
  finalRuns: DebateExpertRun[],
  evaluations: Array<{ evaluatorId: string; evaluations: PeerEvaluation[] }>,
  configuredWeights?: CandidateWeights,
): CandidateScore[] {
  const weights = normalizeCandidateWeights(configuredWeights);
  const scores = finalRuns.map((run) => {
    const peers = evaluations.flatMap((item) => item.evaluatorId === run.expertId ? [] : item.evaluations.filter((score) => score.candidate_id === run.expertId));
    const mean = (key: "accuracy" | "evidence" | "relevance") => peers.length ? peers.reduce((sum, peer) => sum + peer[key], 0) / peers.length : 0;
    const peerAccuracy = mean("accuracy");
    const evidenceStrength = mean("evidence");
    const domainRelevance = mean("relevance");
    return {
      candidateId: run.expertId,
      score: Math.round((weights.peerAccuracy * peerAccuracy + weights.evidenceStrength * evidenceStrength + weights.domainRelevance * domainRelevance + weights.originalConfidence * run.answer.confidence) * 100) / 100,
      peerAccuracy,
      evidenceStrength,
      domainRelevance,
      originalConfidence: run.answer.confidence,
    };
  });
  return scores.sort((a, b) => b.score - a.score || a.candidateId.localeCompare(b.candidateId));
}
