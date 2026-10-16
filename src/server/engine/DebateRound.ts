import {
  DEBATE_INITIAL_SYSTEM,
  DEBATE_REBUTTAL_SYSTEM,
} from "./prompts/index.js";

import type { ExpertRole, DebateExpertRun } from "../../shared/types.js";

import { debateExpertSchema } from "./schemas.js";
import { CouncilError } from "./logic.js";

import type { Execution } from "./Execution.js";
import { validateDebateBrevity } from "./brevity.js";
export async function debateRound(
  execution: Execution,
  roles: ExpertRole[],
  round: number,
  previous: DebateExpertRun[],
  dispute: string[],
): Promise<DebateExpertRun[]> {
  const { request } = execution;
  execution.emit(
    round === 1 ? "ROUND_1" : round === 2 ? "ROUND_2" : "ROUND_3",
    undefined,
    round,
  );
  execution.event("DEBATE_ROUND_STARTED", { round });
  const active =
    round === 1
      ? roles.map((role, expertIndex) => ({ role, expertIndex }))
      : previous.map((run) => ({
          role: run.role,
          expertIndex: run.expertIndex,
        }));
  const settled = await Promise.allSettled(
    active.map(async ({ role, expertIndex }): Promise<DebateExpertRun> => {
      execution.event("EXPERT_STARTED", { expertId: role.id });
      const model = execution.expertModel(role, expertIndex);
      const own = previous.find((run) => run.expertIndex === expertIndex);
      const prompt =
        round === 1
          ? {
              question: request.question,
              context: request.context,
              role: role.title,
              domain: role.domain,
              responsibility: role.primaryQuestion,
              customInstructions: role.instructions,
              round: 1,
            }
          : {
              question: request.question,
              context: request.context,
              role: role.title,
              responsibility: role.primaryQuestion,
              customInstructions: role.instructions,
              round,
              ownPreviousPosition: own?.answer,
              otherPositions: previous
                .filter((run) => run.expertIndex !== expertIndex)
                .map((run) => ({
                  expert: `Expert ${String.fromCharCode(65 + run.expertIndex)}`,
                  stance: run.answer.stance,
                  confidence: run.answer.confidence,
                  core_claims: run.answer.core_claims,
                  strongest_evidence: run.answer.strongest_evidence,
                  main_objection: run.answer.main_objection,
                })),
              unresolvedDisagreements: dispute,
            };
      const answer = await execution.call({
        model,
        stage: round === 1 ? "debate_initial" : "debate_rebuttal",
        expertIndex,
        round,
        system: round === 1 ? DEBATE_INITIAL_SYSTEM : DEBATE_REBUTTAL_SYSTEM,
        prompt: JSON.stringify(prompt),
        schema: debateExpertSchema,
        maxOutputTokens: execution.budget(
          round === 1 ? "debateInitial" : "debateRebuttal",
        ),
        validate: validateDebateBrevity,
      });
      execution.event(
        answer.changed_mind ? "EXPERT_CHANGED_POSITION" : "EXPERT_COMPLETED",
        {
          expertId: role.id,
          summary: answer.stance,
          position: answer.stance,
          round,
        },
      );
      return {
        expertId: role.id,
        expertIndex,
        role,
        modelId: model.id,
        round,
        answer,
      };
    }),
  );
  execution.throwIfAborted();
  const successful = settled.flatMap((item, index) => {
    if (item.status === "fulfilled") return [item.value];
    execution.degraded = true;
    execution.failedExpertIndices.add(active[index].expertIndex);
    return [];
  });
  if (round === 1 && successful.length < 2)
    throw new CouncilError(
      "EXPERT_QUORUM_FAILED",
      "Fewer than two debate experts returned valid results.",
    );
  if (round === 1) return successful;
  return previous.map(
    (run) =>
      successful.find((next) => next.expertIndex === run.expertIndex) ?? run,
  );
}
