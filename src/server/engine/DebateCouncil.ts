import { DEBATE_JUDGE_SYSTEM } from "./prompts/index.js";

import type {
  ExpertRole,
  DebateExpertRun,
  DebateRound,
  DebateCouncilResult,
  CrossEvaluationResult,
  TerminationReason,
} from "../../shared/types.js";

import { debateJudgeSchema } from "./schemas.js";
import {
  CouncilError,
  detectConsensus,
  disagreements,
  severeDisagreement,
  stancesCompatible,
  hasHighSeverityObjection,
} from "./logic.js";

import type { Execution } from "./Execution.js";
import { debateRound } from "./DebateRound.js";
import { crossEvaluate } from "./CrossEvaluator.js";
export async function runDebate(
  execution: Execution,
  roles: ExpertRole[],
): Promise<DebateCouncilResult> {
  const { request } = execution;
  const consensusOptions = request.settings?.consensus ?? {};
  let finalRuns = await debateRound(execution, roles, 1, [], []);
  const rounds: DebateRound[] = [];
  let terminationReason: TerminationReason = "MAX_ROUNDS";
  const majorityStance = (runs: DebateExpertRun[]) =>
    runs.find(
      (candidate) =>
        runs.filter((run) =>
          stancesCompatible(
            run.answer.stance,
            candidate.answer.stance,
            consensusOptions.stanceSimilarity,
          ),
        ).length >= 2,
    )?.answer.stance ?? "";
  let previousMajority = majorityStance(finalRuns);
  let unchangedStreak = 0;
  const adaptive = request.settings?.adaptiveCompute ?? "BALANCED";
  const maxRounds =
    request.settings?.maxDebateRounds ?? (adaptive === "LOW" ? 2 : 3);
  if (![1, 2, 3].includes(maxRounds))
    throw new CouncilError(
      "INVALID_REQUEST",
      "Debate rounds must be between one and three.",
    );

  for (let round = 1; round <= maxRounds; round++) {
    execution.emit("CHECK_CONSENSUS", undefined, round);
    const consensus = detectConsensus(finalRuns, consensusOptions);
    const dispute = disagreements(finalRuns, consensusOptions.stanceSimilarity);
    rounds.push({
      round,
      experts: [...finalRuns],
      consensus,
      disagreements: dispute,
    });
    if (consensus) {
      execution.event("CONSENSUS_REACHED", { round });
      terminationReason = `CONSENSUS_ROUND_${round}` as TerminationReason;
      break;
    }
    if (round >= maxRounds) {
      terminationReason = "MAX_ROUNDS";
      break;
    }
    if (
      adaptive === "LOW" &&
      round === 1 &&
      !severeDisagreement(finalRuns, consensusOptions.stanceSimilarity)
    ) {
      terminationReason = "MAX_ROUNDS";
      break;
    }
    if (
      round === 2 &&
      adaptive === "BALANCED" &&
      !severeDisagreement(finalRuns, consensusOptions.stanceSimilarity)
    ) {
      terminationReason = "MAX_ROUNDS";
      break;
    }
    if (!execution.canAffordOptional("debate_rebuttal", finalRuns)) {
      terminationReason = "BUDGET_LIMIT";
      break;
    }
    const prior = finalRuns;
    finalRuns = await debateRound(execution, roles, round + 1, prior, dispute);
    if (detectConsensus(finalRuns, consensusOptions)) continue;
    const changed = finalRuns.some((run) => {
      const before = prior.find((old) => old.expertId === run.expertId);
      return (
        !!before &&
        (run.answer.changed_mind ||
          !stancesCompatible(before.answer.stance, run.answer.stance, 0.95))
      );
    });
    const newInformation = finalRuns.some(
      (run) => run.round === round + 1 && run.answer.new_information.length > 0,
    );
    unchangedStreak = changed ? 0 : unchangedStreak + 1;
    const majority = majorityStance(finalRuns);
    const stableMajority =
      majority &&
      previousMajority &&
      stancesCompatible(
        majority,
        previousMajority,
        consensusOptions.stanceSimilarity,
      );
    const highConfidenceContradiction =
      !!majority &&
      finalRuns.some(
        (run) =>
          run.answer.confidence >= 75 &&
          !stancesCompatible(
            run.answer.stance,
            majority,
            consensusOptions.stanceSimilarity,
          ),
      );
    previousMajority = majority;
    if (round + 1 >= 2 && !changed && !newInformation) {
      execution.emit("CHECK_CONSENSUS", undefined, round + 1);
      rounds.push({
        round: round + 1,
        experts: [...finalRuns],
        consensus: false,
        disagreements: disagreements(
          finalRuns,
          consensusOptions.stanceSimilarity,
        ),
      });
      terminationReason = "NO_NEW_INFORMATION";
      break;
    }
    if (unchangedStreak >= 2) {
      execution.emit("CHECK_CONSENSUS", undefined, round + 1);
      rounds.push({
        round: round + 1,
        experts: [...finalRuns],
        consensus: false,
        disagreements: disagreements(
          finalRuns,
          consensusOptions.stanceSimilarity,
        ),
      });
      terminationReason = "STABLE_POSITIONS";
      break;
    }
    if (
      stableMajority &&
      !highConfidenceContradiction &&
      !finalRuns.some(
        (run) => run.answer.confidence >= 75 && hasHighSeverityObjection(run),
      )
    ) {
      execution.emit("CHECK_CONSENSUS", undefined, round + 1);
      rounds.push({
        round: round + 1,
        experts: [...finalRuns],
        consensus: false,
        disagreements: disagreements(
          finalRuns,
          consensusOptions.stanceSimilarity,
        ),
      });
      terminationReason = "STABLE_MAJORITY";
      break;
    }
    // Round 3 is only useful after Round 2 contributed new evidence or a changed position.
    if (round + 1 === 2 && !newInformation && !changed) break;
  }

  execution.throwIfAborted();
  const hasConsensus = rounds.at(-1)?.consensus ?? false;
  let crossEvaluation: CrossEvaluationResult | undefined;
  if (!hasConsensus) {
    if (execution.canAffordOptional("cross_evaluation", finalRuns)) {
      crossEvaluation = await crossEvaluate(execution, finalRuns);
    } else {
      terminationReason = "BUDGET_LIMIT";
    }
  }
  const judge = await execution.judge(
    debateJudgeSchema,
    DEBATE_JUDGE_SYSTEM,
    JSON.stringify({
      question: request.question,
      context: request.context,
      failedExperts: [...execution.failedExpertIndices].map(
        (index) => `Expert ${String.fromCharCode(65 + index)}`,
      ),
      consensus: hasConsensus,
      finalPositions: finalRuns.map((run) => ({
        expert: `Expert ${String.fromCharCode(65 + run.expertIndex)}`,
        candidate_id: run.expertId,
        profession: run.role.title,
        domain: run.role.domain,
        primaryQuestion: run.role.primaryQuestion,
        ...run.answer,
      })),
      unresolvedDisagreements: hasConsensus
        ? []
        : disagreements(finalRuns, consensusOptions.stanceSimilarity),
      crossEvaluation,
      leadingCandidateId: crossEvaluation?.leadingCandidateId,
      candidateScores: crossEvaluation?.scores,
    }),
  );
  execution.log({
    sessionId: execution.sessionId,
    stage: "COMPLETE",
    terminationReason,
  });
  execution.emit("COMPLETE");
  return {
    status: "complete",
    mode: "DEBATE",
    sessionId: execution.sessionId,
    question: request.question,
    roles,
    experts: finalRuns,
    rounds,
    crossEvaluation,
    judge,
    usage: execution.usage(),
    degraded: execution.degraded,
    failedExpertIndices: [...execution.failedExpertIndices],
    terminationReason,
    createdAt: execution.createdAt,
  };
}
