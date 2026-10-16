import { CROSS_EVALUATION_SYSTEM } from "./prompts/index.js";

import type {
  DebateExpertRun,
  CrossEvaluationResult,
  CrossEvaluationRun,
} from "../../shared/types.js";

import { crossEvaluationSchema } from "./schemas.js";
import { rankCandidates } from "./logic.js";

import type { Execution } from "./Execution.js";
export async function crossEvaluate(
  execution: Execution,
  finalRuns: DebateExpertRun[],
): Promise<CrossEvaluationResult> {
  execution.emit("CROSS_EVALUATION");
  const settled = await Promise.allSettled(
    finalRuns.map(async (run): Promise<CrossEvaluationRun> => {
      const candidates = finalRuns.filter(
        (other) => other.expertId !== run.expertId,
      );
      const response = await execution.call({
        model: execution.expertModel(run.role, run.expertIndex),
        stage: "cross_evaluation",
        expertIndex: run.expertIndex,
        system: CROSS_EVALUATION_SYSTEM,
        prompt: JSON.stringify({
          question: execution.request.question,
          evaluatorRole: run.role.title,
          candidates: candidates.map((candidate) => ({
            candidate_id: candidate.expertId,
            stance: candidate.answer.stance,
            claims: candidate.answer.core_claims,
            evidence: candidate.answer.strongest_evidence,
            objection: candidate.answer.main_objection,
          })),
        }),
        schema: crossEvaluationSchema(candidates.length),
        maxOutputTokens: execution.budget("crossEvaluation"),
        validate: (object) => {
          const expected = candidates
            .map((candidate) => candidate.expertId)
            .sort();
          const received = object.evaluations
            .map((evaluation) => evaluation.candidate_id)
            .sort();
          if (expected.join("|") !== received.join("|"))
            throw new Error("Invalid candidate IDs in cross-evaluation");
        },
      });
      return {
        evaluatorId: run.expertId,
        evaluatorIndex: run.expertIndex,
        evaluations: response.evaluations,
      };
    }),
  );
  execution.throwIfAborted();
  const runs = settled.flatMap((item) =>
    item.status === "fulfilled" ? [item.value] : [],
  );
  if (runs.length < finalRuns.length) execution.degraded = true;
  const scores = rankCandidates(
    finalRuns,
    runs,
    execution.request.settings?.candidateWeights,
  );
  return {
    runs,
    scores,
    leadingCandidateId: runs.length ? scores[0]?.candidateId : undefined,
  };
}
