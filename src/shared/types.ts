/** Serializable types shared by the API and the client. No provider secrets belong here. */
export type CouncilMode = "YES_NO" | "DEBATE";
export type RoleMode = "AUTO" | "MANUAL" | "HYBRID";
export type AdaptiveCompute = "LOW" | "BALANCED" | "HIGH";
export const PROVIDER_IDS = ["compatible", "meta", "gateway", "openai", "anthropic", "google"] as const;
export type ModelProvider = (typeof PROVIDER_IDS)[number];
export type ModelTier = "economy" | "standard" | "premium" | "judge";
export type EvidenceStatus = "KNOWN" | "INFERRED" | "UNCERTAIN";

export interface ModelConfig {
  id: string;
  provider: ModelProvider;
  model: string;
  displayName: string;
  tier: ModelTier;
  inputCostPerMillion?: number;
  outputCostPerMillion?: number;
  maxContextTokens?: number;
  enabled: boolean;
}

export interface RoleInput {
  title: string;
  domain?: string;
  reason?: string;
  primaryQuestion?: string;
  instructions?: string;
  modelOverride?: string | null;
  /** In HYBRID mode, explicitly false means this slot should be regenerated. */
  locked?: boolean;
}

export interface ExpertRole {
  id: string;
  title: string;
  domain: string;
  reason: string;
  primaryQuestion: string;
  instructions?: string;
  modelOverride?: string | null;
}

export interface TokenBudgets {
  roleGenerator?: number;
  yesNoExpert?: number;
  debateInitial?: number;
  debateRebuttal?: number;
  crossEvaluation?: number;
  judge?: number;
}

export interface ConsensusSettings {
  strongConfidence?: number;
  weakDissent?: number;
  stanceSimilarity?: number;
}

export interface CandidateWeights {
  peerAccuracy?: number;
  evidenceStrength?: number;
  domainRelevance?: number;
  originalConfidence?: number;
}

export interface CouncilRequest {
  id?: string;
  mode: CouncilMode;
  question: string;
  context?: string;
  roleMode: RoleMode;
  roles?: RoleInput[];
  /** Accepted preview. A complete set bypasses role generation in any role mode. */
  approvedRoles?: ExpertRole[];
  models: {
    registry: ModelConfig[];
    roleGeneratorModelId?: string;
    defaultExpertModelId: string;
    judgeModelId: string;
    expertModelOverrides?: Record<number, string>;
  };
  settings?: {
    adaptiveCompute?: AdaptiveCompute;
    maxCost?: number;
    maxDebateRounds?: 1 | 2 | 3;
    tokenBudgets?: TokenBudgets;
    consensus?: ConsensusSettings;
    candidateWeights?: CandidateWeights;
  };
}

export type CouncilStage =
  | "ANALYZING"
  | "GENERATING_ROLES"
  | "RUNNING_EXPERTS"
  | "ROUND_1"
  | "CHECK_CONSENSUS"
  | "ROUND_2"
  | "ROUND_3"
  | "CROSS_EVALUATION"
  | "JUDGING"
  | "COMPLETE"
  | "FAILED";

export type CouncilEventType = "ROLE_GENERATION_STARTED" | "ROLES_CREATED" | "EXPERT_STARTED" | "EXPERT_FAILED" | "EXPERT_COMPLETED" | "EXPERT_CHANGED_POSITION" | "DEBATE_ROUND_STARTED" | "CONSENSUS_REACHED" | "JUDGE_STARTED" | "JUDGE_COMPLETED";
export interface StageEvent {
  errorCode?: string;
  type?: CouncilEventType;
  expertId?: string;
  summary?: string;
  position?: string;
  sessionId: string;
  stage: CouncilStage;
  at: string;
  round?: number;
  message?: string;
  roles?: ExpertRole[];
}

export type CallStage =
  | "role_generation"
  | "yes_no_expert"
  | "debate_initial"
  | "debate_rebuttal"
  | "cross_evaluation"
  | "judge";

export interface ModelCallUsage {
  provider: ModelProvider;
  model: string;
  modelId: string;
  stage: CallStage;
  expertIndex?: number;
  round?: number;
  attempt: number;
  success: boolean;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number | null;
  costKnown: boolean;
  latencyMs: number;
  tokensKnown?: boolean;
  error?: string;
}

export interface UsageSummary {
  calls: ModelCallUsage[];
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCost: number | null;
  /** False when any selected model lacked pricing metadata. */
  costComplete: boolean;
  totalLatencyMs: number;
}

export interface YesNoExpertAnswer {
  vote: "YES" | "NO";
  confidence: number;
  relevance: number;
  evidence_strength: number;
  evidence_status: EvidenceStatus;
  reason: string;
  critical_caveat: string;
}

export interface YesNoExpertRun {
  expertId: string;
  expertIndex: number;
  role: ExpertRole;
  modelId: string;
  answer: YesNoExpertAnswer;
}

export interface YesNoJudgeAnswer {
  decision: "YES" | "NO";
  confidence: number;
  summary: string;
  main_reason: string;
  key_risk: string;
  expert_consensus: { yes: number; no: number };
}

export interface DebateExpertAnswer {
  stance: string;
  confidence: number;
  core_claims: string[];
  strongest_evidence: string[];
  main_objection: string;
  changed_mind: boolean;
  new_information: string[];
  remaining_uncertainty: string;
  evidence_status: EvidenceStatus;
}

export interface DebateExpertRun {
  expertId: string;
  expertIndex: number;
  role: ExpertRole;
  modelId: string;
  round: number;
  answer: DebateExpertAnswer;
}

export interface DebateRound {
  round: number;
  experts: DebateExpertRun[];
  consensus: boolean;
  disagreements: string[];
}

export interface PeerEvaluation {
  candidate_id: string;
  accuracy: number;
  relevance: number;
  evidence: number;
  fatal_flaw: string;
}

export interface CrossEvaluationRun {
  evaluatorId: string;
  evaluatorIndex: number;
  evaluations: PeerEvaluation[];
}

export interface CandidateScore {
  candidateId: string;
  score: number;
  peerAccuracy: number;
  evidenceStrength: number;
  domainRelevance: number;
  originalConfidence: number;
}

export interface CrossEvaluationResult {
  runs: CrossEvaluationRun[];
  scores: CandidateScore[];
  leadingCandidateId?: string;
}

export interface DebateJudgeAnswer {
  conclusion: string;
  confidence: number;
  strongest_reason: string;
  strongest_counterargument: string;
  why_this_wins: string;
  recommendation: string;
}

export type TerminationReason =
  | "YES_NO_COMPLETE"
  | "CONSENSUS_ROUND_1"
  | "CONSENSUS_ROUND_2"
  | "CONSENSUS_ROUND_3"
  | "NO_NEW_INFORMATION"
  | "STABLE_POSITIONS"
  | "STABLE_MAJORITY"
  | "MAX_ROUNDS"
  | "BUDGET_LIMIT";

export interface CouncilResultBase {
  status: "complete";
  sessionId: string;
  question: string;
  binaryProposition?: string;
  roles: ExpertRole[];
  usage: UsageSummary;
  degraded: boolean;
  failedExpertIndices: number[];
  terminationReason: TerminationReason;
  createdAt: string;
}

export interface YesNoCouncilResult extends CouncilResultBase {
  mode: "YES_NO";
  experts: YesNoExpertRun[];
  judge: YesNoJudgeAnswer;
}

export interface DebateCouncilResult extends CouncilResultBase {
  mode: "DEBATE";
  experts: DebateExpertRun[];
  rounds: DebateRound[];
  crossEvaluation?: CrossEvaluationResult;
  judge: DebateJudgeAnswer;
}

export type CouncilResult = YesNoCouncilResult | DebateCouncilResult;

export interface RoleGenerationResult {
  roles: ExpertRole[];
  usage: UsageSummary;
}
