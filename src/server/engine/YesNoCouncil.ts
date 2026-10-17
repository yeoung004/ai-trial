import { recordExpertFailure } from "./expertFailure.js";
import { YES_NO_EXPERT_SYSTEM, YES_NO_JUDGE_SYSTEM } from "./prompts/index.js";

import type {
  ExpertRole,
  YesNoExpertRun,
  YesNoCouncilResult,
  TerminationReason,
} from "../../shared/types.js";

import { yesNoExpertSchema, yesNoJudgeSchema } from "./schemas.js";
import { CouncilError } from "./logic.js";

import type { Execution } from "./Execution.js";
import { words } from "./brevity.js";
export async function runYesNo(
  execution: Execution,
  roles: ExpertRole[],
  proposition: string,
): Promise<YesNoCouncilResult> {
  const { request } = execution;
  execution.emit("RUNNING_EXPERTS");
  const settled = await Promise.allSettled(
    roles.map(async (role, expertIndex): Promise<YesNoExpertRun> => {
      execution.event("EXPERT_STARTED", { expertId: role.id });
      const model = execution.expertModel(role, expertIndex);
      const answer = await execution.call({
        model,
        stage: "yes_no_expert",
        expertIndex,
        system: YES_NO_EXPERT_SYSTEM,
        prompt: JSON.stringify({
          originalQuestion: request.question,
          binaryProposition: proposition,
          context: request.context,
          assignedRole: role.title,
          domain: role.domain,
          responsibility: role.primaryQuestion,
          customInstructions: role.instructions,
        }),
        schema: yesNoExpertSchema,
        maxOutputTokens: execution.budget("yesNoExpert"),
        validate: (object) => {
          if (words(object.reason) > 50 || words(object.critical_caveat) > 25)
            throw new Error(
              "YES / NO output exceeded the concise field limits",
            );
        },
      });
      execution.event("EXPERT_COMPLETED", {
        expertId: role.id,
        summary: answer.reason,
        position: answer.vote,
      });
      return {
        expertId: role.id,
        expertIndex,
        role,
        modelId: model.id,
        answer,
      };
    }),
  );
  execution.throwIfAborted();
  const failures: ReturnType<typeof recordExpertFailure>[] = [];
  const experts = settled.flatMap((item, index) => {
    if (item.status === "fulfilled") return [item.value];
    failures.push(recordExpertFailure(execution, roles[index], index, item.reason));
    return [];
  });
  if (experts.length < 4)
    throw new CouncilError(
      "EXPERT_QUORUM_FAILED",
      "Fewer than four YES / NO experts returned valid results. The Judge was not called. See each expert’s error for details.",
      { failures },
    );
  const expert_consensus = {
    yes: experts.filter((run) => run.answer.vote === "YES").length,
    no: experts.filter((run) => run.answer.vote === "NO").length,
  };
  const judge = await execution.judge(
    yesNoJudgeSchema,
    YES_NO_JUDGE_SYSTEM,
    JSON.stringify({
      originalQuestion: request.question,
      binaryProposition: proposition,
      context: request.context,
      failedExperts: [...execution.failedExpertIndices].map(
        (index) => `Expert ${String.fromCharCode(65 + index)}`,
      ),
      experts: experts.map((run) => ({
        expert: `Expert ${String.fromCharCode(65 + run.expertIndex)}`,
        profession: run.role.title,
        domain: run.role.domain,
        primaryQuestion: run.role.primaryQuestion,
        ...run.answer,
      })),
    }),
  );
  const terminationReason: TerminationReason = "YES_NO_COMPLETE";
  execution.log({
    sessionId: execution.sessionId,
    stage: "COMPLETE",
    terminationReason,
  });
  execution.emit("COMPLETE");
  return {
    status: "complete",
    mode: "YES_NO",
    sessionId: execution.sessionId,
    question: request.question,
    binaryProposition: proposition,
    roles,
    experts,
    judge: { ...judge, expert_consensus },
    usage: execution.usage(),
    degraded: execution.degraded,
    failedExpertIndices: [...execution.failedExpertIndices],
    terminationReason,
    createdAt: execution.createdAt,
  };
}
