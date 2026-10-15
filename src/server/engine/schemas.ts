import { z } from "zod";

const score = z.number().min(0).max(100);
const short = (characters: number) => z.string().trim().min(1).max(characters);

export const generatedRoleSchema = z.object({
  role: short(90),
  domain: short(90),
  reason: short(180),
  primary_question: short(180),
});

export const roleGenerationSchema = (count: number) =>
  z.object({ roles: z.array(generatedRoleSchema).length(count) });

export const yesNoExpertSchema = z.object({
  vote: z.enum(["YES", "NO"]),
  confidence: score,
  relevance: score,
  evidence_strength: score,
  evidence_status: z.enum(["KNOWN", "INFERRED", "UNCERTAIN"]),
  reason: short(300),
  critical_caveat: short(180),
});

export const yesNoJudgeSchema = z.object({
  decision: z.enum(["YES", "NO"]),
  confidence: score,
  summary: short(600),
  main_reason: short(500),
  key_risk: short(400),
});

export const debateExpertSchema = z.object({
  stance: short(200),
  confidence: score,
  core_claims: z.array(short(240)).max(3),
  strongest_evidence: z.array(short(240)).max(2),
  main_objection: z.string().trim().max(320),
  changed_mind: z.boolean(),
  new_information: z.array(short(240)).max(2),
  remaining_uncertainty: z.string().trim().max(240),
  evidence_status: z.enum(["KNOWN", "INFERRED", "UNCERTAIN"]),
});

export const peerEvaluationSchema = z.object({
  candidate_id: short(30),
  accuracy: score,
  relevance: score,
  evidence: score,
  fatal_flaw: z.string().trim().max(180),
});

export const crossEvaluationSchema = (count: number) =>
  z.object({ evaluations: z.array(peerEvaluationSchema).length(count) });

export const debateJudgeSchema = z.object({
  conclusion: short(900),
  confidence: score,
  strongest_reason: short(650),
  strongest_counterargument: short(500),
  why_this_wins: short(650),
  recommendation: short(600),
});
