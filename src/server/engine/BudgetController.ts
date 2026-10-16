import type { Execution } from "./Execution.js";
import type {
  ModelConfig,
  ExpertRole,
  CallStage,
  DebateExpertRun,
} from "../../shared/types.js";
import { estimatedCost, CouncilError } from "./logic.js";
const inputEstimate: Record<CallStage, number> = {
  role_generation: 350,
  yes_no_expert: 500,
  debate_initial: 500,
  debate_rebuttal: 800,
  cross_evaluation: 650,
  judge: 1400,
};

export function estimatedJudgeCost(execution: Execution): number {
  const model = execution.model(execution.request.models.judgeModelId, "judge");
  execution.ensurePricing(model);
  return estimatedCost(model, inputEstimate.judge, execution.budget("judge"));
}

export function ensurePricing(execution: Execution, model: ModelConfig) {
  if (
    execution.request.settings?.maxCost !== undefined &&
    (model.inputCostPerMillion === undefined ||
      model.outputCostPerMillion === undefined ||
      !Number.isFinite(model.inputCostPerMillion) ||
      !Number.isFinite(model.outputCostPerMillion) ||
      model.inputCostPerMillion < 0 ||
      model.outputCostPerMillion < 0)
  ) {
    throw new CouncilError(
      "BUDGET_EXCEEDED",
      "A cost limit requires input and output pricing for every selected model.",
      { modelId: model.id },
    );
  }
}

export function estimatedRoleCost(execution: Execution): number {
  if (
    execution.request.approvedRoles ||
    execution.request.roleMode === "MANUAL"
  )
    return 0;
  const count = execution.request.mode === "YES_NO" ? 5 : 3;
  const locked =
    execution.request.roleMode === "HYBRID"
      ? (execution.request.roles ?? []).filter((role) => role.locked !== false)
          .length
      : 0;
  if (locked >= count) return 0;
  const model = execution.model(
    execution.request.models.roleGeneratorModelId ||
      execution.request.models.defaultExpertModelId,
  );
  execution.ensurePricing(model);
  return estimatedCost(
    model,
    inputEstimate.role_generation,
    execution.budget("roleGenerator"),
  );
}

export function preflightBudget(execution: Execution, roles?: ExpertRole[]) {
  const limit = execution.request.settings?.maxCost;
  if (limit === undefined) return;
  if (!Number.isFinite(limit) || limit <= 0)
    throw new CouncilError(
      "INVALID_REQUEST",
      "Maximum cost must be a positive dollar amount.",
    );
  const count = execution.request.mode === "YES_NO" ? 5 : 3;
  let estimate = execution.estimatedJudgeCost() + execution.estimatedRoleCost();
  for (let index = 0; index < count; index++) {
    const roleOverride = execution.request.roles?.[index]?.modelOverride;
    const model = roles?.[index]
      ? execution.expertModel(roles[index], index)
      : execution.model(
          roleOverride ||
            execution.request.models.expertModelOverrides?.[index] ||
            execution.request.models.defaultExpertModelId,
        );
    execution.ensurePricing(model);
    const stage: CallStage =
      execution.request.mode === "YES_NO" ? "yes_no_expert" : "debate_initial";
    estimate += estimatedCost(
      model,
      inputEstimate[stage],
      execution.budget(
        execution.request.mode === "YES_NO" ? "yesNoExpert" : "debateInitial",
      ),
    );
  }
  if (estimate > limit) {
    throw new CouncilError(
      "BUDGET_EXCEEDED",
      "The estimated mandatory council calls exceed the cost limit.",
      { estimatedCost: estimate, maxCost: limit },
    );
  }
}

export function canAffordOptional(
  execution: Execution,
  stage: "debate_rebuttal" | "cross_evaluation",
  runs: DebateExpertRun[],
): boolean {
  const limit = execution.request.settings?.maxCost;
  if (limit === undefined) return true;
  const key =
    stage === "debate_rebuttal" ? "debateRebuttal" : "crossEvaluation";
  const optional = runs.reduce((sum, run) => {
    const model = execution.expertModel(run.role, run.expertIndex);
    execution.ensurePricing(model);
    return (
      sum + estimatedCost(model, inputEstimate[stage], execution.budget(key))
    );
  }, 0);
  return (
    execution.usage().totalCost + optional + execution.estimatedJudgeCost() <=
    limit
  );
}
