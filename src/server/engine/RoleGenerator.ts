import { ROLE_SYSTEM } from "./prompts/index.js";

import type { z } from "zod";
import type { ExpertRole, RoleInput } from "../../shared/types.js";

import { roleGenerationSchema } from "./schemas.js";
import { CouncilError } from "./logic.js";

import type { Execution } from "./Execution.js";
import { isAuthenticationFailure } from "./RetryPolicy.js";
export function roleInput(role: RoleInput, index: number): ExpertRole {
  const title = role.title?.trim();
  if (!title)
    throw new CouncilError(
      "INVALID_REQUEST",
      `Expert role ${index + 1} needs a title.`,
    );
  return {
    id: `expert-${index + 1}`,
    title,
    domain: role.domain?.trim() || title,
    reason: role.reason?.trim() || "Selected by the user for this council.",
    primaryQuestion:
      role.primaryQuestion?.trim() ||
      `What does ${title} expertise imply for this decision?`,
    ...(role.instructions?.trim()
      ? { instructions: role.instructions.trim() }
      : {}),
    ...(role.modelOverride ? { modelOverride: role.modelOverride } : {}),
  };
}

export function validateRoles(
  roles: ExpertRole[],
  count: number,
): ExpertRole[] {
  if (roles.length !== count)
    throw new CouncilError(
      "INVALID_REQUEST",
      `This mode requires exactly ${count} expert roles.`,
    );
  const seen = new Set<string>();
  const ids = new Set<string>();
  for (const [index, role] of roles.entries()) {
    if (
      !role.id?.trim() ||
      !role.title?.trim() ||
      !role.domain?.trim() ||
      !role.primaryQuestion?.trim()
    ) {
      throw new CouncilError(
        "INVALID_REQUEST",
        `Expert role ${index + 1} is incomplete.`,
      );
    }
    if (ids.has(role.id))
      throw new CouncilError(
        "INVALID_REQUEST",
        "Expert role IDs must be unique.",
      );
    ids.add(role.id);
    const key = role.title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    if (seen.has(key))
      throw new CouncilError(
        "INVALID_REQUEST",
        "Expert roles must have distinct titles.",
      );
    seen.add(key);
  }
  return roles;
}

export async function generateRoles(
  execution: Execution,
): Promise<ExpertRole[]> {
  const count = execution.request.mode === "YES_NO" ? 5 : 3;
  if (execution.request.approvedRoles)
    return validateRoles(execution.request.approvedRoles, count);
  const input = execution.request.roles ?? [];
  if (input.length > count)
    throw new CouncilError(
      "INVALID_REQUEST",
      `This mode accepts at most ${count} roles.`,
    );
  if (execution.request.roleMode === "MANUAL") {
    return validateRoles(
      input.map((role, index) => roleInput(role, index)),
      count,
    );
  }
  const slots =
    execution.request.roleMode === "HYBRID"
      ? input.map((role, index) =>
          role.locked === false ? null : roleInput(role, index),
        )
      : [];
  const locked = slots.filter((role): role is ExpertRole => role !== null);
  const needed = count - locked.length;
  if (needed === 0) return validateRoles(locked, count);
  execution.emit("GENERATING_ROLES");
  execution.event("ROLE_GENERATION_STARTED", { stage: "GENERATING_ROLES" });
  const model = execution.model(
    execution.request.models.roleGeneratorModelId ||
      execution.request.models.defaultExpertModelId,
  );
  const schema = roleGenerationSchema(needed);
  let generated: z.infer<typeof schema>;
  try {
    generated = await execution.call({
      model,
      stage: "role_generation",
      system: ROLE_SYSTEM,
      prompt: JSON.stringify({
        question: execution.request.question,
        lockedRoles: locked.map((role) => ({
          title: role.title,
          domain: role.domain,
          primaryQuestion: role.primaryQuestion,
        })),
        generateCount: needed,
      }),
      schema,
      maxOutputTokens: execution.budget("roleGenerator"),
      validate: (object) => {
        const names = [
          ...locked.map((role) => role.title),
          ...object.roles.map((role) => role.role),
        ].map((name) => name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""));
        if (new Set(names).size !== names.length)
          throw new Error("Duplicate generated roles");
      },
    });
  } catch (error) {
    if ((error as { retryable?: boolean }).retryable === false) throw error;
    execution.throwIfAborted();
    const message = isAuthenticationFailure(error)
      ? "Role Generator authentication failed. Check the selected provider credentials."
      : "The Role Generator failed after one retry. Check the selected model and provider configuration.";
    throw new CouncilError("ROLE_GENERATION_FAILED", message, {
      modelId: model.id,
      provider: model.provider,
    });
  }
  const queue = [...generated.roles];
  const combined: ExpertRole[] = [];
  for (let index = 0; index < count; index++) {
    const existing = slots[index];
    if (existing) combined.push(existing);
    else {
      const next = queue.shift()!;
      combined.push({
        id: `expert-${index + 1}`,
        title: next.role,
        domain: next.domain,
        reason: next.reason,
        primaryQuestion: next.primary_question,
      });
    }
  }
  const validated = validateRoles(combined, count);
  execution.emit(
    "GENERATING_ROLES",
    "The specialists have taken their seats.",
    undefined,
    validated,
  );
  return validated;
}
