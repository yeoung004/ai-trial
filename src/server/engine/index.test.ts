import { describe, expect, it } from "vitest";
import { runCouncil, generateRoles, type ModelAdapter, type StructuredCall } from "./index.js";
import { stancesCompatible } from "./logic.js";
import type { CouncilRequest, DebateExpertAnswer, ExpertRole, ModelConfig, CallStage, StageEvent } from "../../shared/types.js";

const registry: ModelConfig[] = [
  { id: "roles", provider: "gateway", model: "openai/role-model", displayName: "Role", tier: "economy", enabled: true, inputCostPerMillion: 1, outputCostPerMillion: 2 },
  { id: "expert", provider: "gateway", model: "openai/expert-model", displayName: "Expert", tier: "standard", enabled: true, inputCostPerMillion: 1, outputCostPerMillion: 2 },
  { id: "override", provider: "gateway", model: "anthropic/override-model", displayName: "Override", tier: "premium", enabled: true, inputCostPerMillion: 1, outputCostPerMillion: 2 },
  { id: "judge", provider: "gateway", model: "anthropic/judge-model", displayName: "Judge", tier: "judge", enabled: true, inputCostPerMillion: 1, outputCostPerMillion: 2 },
];

const role = (index: number): ExpertRole => ({ id: `expert-${index + 1}`, title: `Specialist ${index + 1}`, domain: `Domain ${index + 1}`, reason: "This domain informs the decision.", primaryQuestion: `What does domain ${index + 1} imply?` });
const debateAnswer = (stance: string, overrides: Partial<DebateExpertAnswer> = {}): DebateExpertAnswer => ({
  stance, confidence: 85, core_claims: ["A concise claim."], strongest_evidence: ["A concise source."],
  main_objection: "None", changed_mind: false, new_information: [], remaining_uncertainty: "Limited evidence.",
  evidence_status: "INFERRED", ...overrides,
});

function request(mode: "YES_NO" | "DEBATE", roleMode: "AUTO" | "MANUAL" | "HYBRID" = "AUTO"): CouncilRequest {
  const count = mode === "YES_NO" ? 5 : 3;
  return {
    mode, roleMode, question: mode === "YES_NO" ? "Should I use PostgreSQL for this app?" : "Which database strategy is best for this app?",
    approvedRoles: Array.from({ length: count }, (_, index) => role(index)),
    models: { registry, roleGeneratorModelId: "roles", defaultExpertModelId: "expert", judgeModelId: "judge" },
  };
}

type CallRecord = { stage: CallStage; modelId: string; prompt: Record<string, any> };
class StubAdapter implements ModelAdapter {
  calls: CallRecord[] = [];
  activeExperts = 0;
  maxActiveExperts = 0;
  constructor(readonly produce?: (call: CallRecord, attempt: number) => unknown) {}

  async generate<T>(call: StructuredCall<T>) {
    const record: CallRecord = { stage: call.stage, modelId: call.model.id, prompt: JSON.parse(call.prompt) };
    this.calls.push(record);
    const attempt = this.calls.filter((item) => item.stage === record.stage && item.prompt.assignedRole === record.prompt.assignedRole && item.prompt.role === record.prompt.role).length;
    if (call.stage === "yes_no_expert" || call.stage === "debate_initial") {
      this.activeExperts++;
      this.maxActiveExperts = Math.max(this.maxActiveExperts, this.activeExperts);
      await new Promise((resolve) => setTimeout(resolve, 1));
      this.activeExperts--;
    }
    const defaultOutput = () => {
      switch (call.stage) {
        case "role_generation":
          return { roles: Array.from({ length: record.prompt.generateCount }, (_, index) => ({ role: `Generated Specialist ${index + 1}`, domain: `Generated Domain ${index + 1}`, reason: "This perspective improves coverage.", primary_question: `What does perspective ${index + 1} imply?` })) };
        case "yes_no_expert":
          return { vote: "YES", confidence: 80, relevance: 85, evidence_strength: 70, evidence_status: "INFERRED", reason: "This is a reasonable choice.", critical_caveat: "Validate the workload." };
        case "debate_initial":
        case "debate_rebuttal":
          return debateAnswer("Use PostgreSQL.");
        case "cross_evaluation":
          return { evaluations: record.prompt.candidates.map((candidate: { candidate_id: string }) => ({ candidate_id: candidate.candidate_id, accuracy: 80, relevance: 75, evidence: 70, fatal_flaw: "" })) };
        case "judge":
          return "binaryProposition" in record.prompt
            ? { decision: "YES", confidence: 82, summary: "PostgreSQL fits.", main_reason: "It meets the needs.", key_risk: "Monitor scaling." }
            : { conclusion: "Use PostgreSQL.", confidence: 81, strongest_reason: "Reliable fit.", strongest_counterargument: "Operational cost.", why_this_wins: "Better total tradeoff.", recommendation: "Start with PostgreSQL." };
      }
    };
    const value = this.produce?.(record, attempt) ?? defaultOutput();
    return { object: value as T, inputTokens: 100, outputTokens: 20, latencyMs: 10 };
  }
}

const count = (adapter: StubAdapter, stage: CallStage) => adapter.calls.filter((call) => call.stage === stage).length;

describe("YES / NO council", () => {
  it("runs five experts concurrently and one mandatory Judge, with exact usage", async () => {
    const adapter = new StubAdapter();
    const result = await runCouncil(request("YES_NO"), { adapter });
    expect(result.mode).toBe("YES_NO");
    if (result.mode !== "YES_NO") return;
    expect(result.experts).toHaveLength(5);
    expect(result.judge.decision).toBe("YES");
    expect(result.judge.expert_consensus).toEqual({ yes: 5, no: 0 });
    expect(adapter.maxActiveExperts).toBe(5);
    expect(count(adapter, "role_generation")).toBe(0);
    expect(count(adapter, "judge")).toBe(1);
    expect(result.usage.totalCalls).toBe(6);
    expect(result.usage.totalInputTokens).toBe(600);
    expect(result.usage.totalOutputTokens).toBe(120);
    expect(result.usage.totalCost).toBeCloseTo(0.00084);
    expect(result.usage.costComplete).toBe(true);
  });

  it("preserves all manual roles without a Role Generator call", async () => {
    const input = request("YES_NO", "MANUAL");
    input.approvedRoles = undefined;
    input.roles = Array.from({ length: 5 }, (_, index) => ({ title: `Manual ${index + 1}`, instructions: "Focus on this domain." }));
    const adapter = new StubAdapter();
    const result = await runCouncil(input, { adapter });
    expect(result.roles.map((item) => item.title)).toEqual(input.roles.map((item) => item.title));
    expect(count(adapter, "role_generation")).toBe(0);
  });

  it("keeps hybrid locked roles and generates only three missing roles", async () => {
    const input = request("YES_NO", "HYBRID");
    input.approvedRoles = undefined;
    input.roles = [{ title: "Economist", locked: true }, { title: "To replace", locked: false }, { title: "Security Engineer", locked: true }];
    const adapter = new StubAdapter();
    const result = await generateRoles(input, { adapter });
    expect(result.roles).toHaveLength(5);
    expect(result.roles[0].title).toBe("Economist");
    expect(result.roles[2].title).toBe("Security Engineer");
    expect(adapter.calls[0].prompt.generateCount).toBe(3);
    expect(count(adapter, "role_generation")).toBe(1);
    const execution = await runCouncil({ ...input, approvedRoles: result.roles }, { adapter });
    expect(execution.roles).toEqual(result.roles);
    expect(count(adapter, "role_generation")).toBe(1);
  });

  it("retries one failed expert then proceeds with four in degraded mode", async () => {
    const adapter = new StubAdapter((call) => {
      if (call.stage === "yes_no_expert" && call.prompt.assignedRole === "Specialist 1") throw new Error("provider unavailable");
      return undefined;
    });
    const result = await runCouncil(request("YES_NO"), { adapter });
    expect(result.mode).toBe("YES_NO");
    if (result.mode !== "YES_NO") return;
    expect(result.experts).toHaveLength(4);
    expect(result.degraded).toBe(true);
    expect(result.failedExpertIndices).toEqual([0]);
    expect(count(adapter, "yes_no_expert")).toBe(6);
    expect(count(adapter, "judge")).toBe(1);
  });

  it("never fabricates a result after both Judge attempts fail", async () => {
    const adapter = new StubAdapter((call) => { if (call.stage === "judge") throw new Error("provider unavailable"); return undefined; });
    await expect(runCouncil(request("YES_NO"), { adapter })).rejects.toMatchObject({ code: "JUDGE_FAILED" });
    expect(count(adapter, "judge")).toBe(2);
  });

  it("requires an enabled Final Judge before any model call", async () => {
    const adapter = new StubAdapter();
    const input = request("YES_NO");
    input.models.judgeModelId = "";
    await expect(runCouncil(input, { adapter })).rejects.toMatchObject({ code: "JUDGE_MODEL_REQUIRED" });
    expect(adapter.calls).toHaveLength(0);
  });

  it("rejects an open question before paying for expert calls", async () => {
    const adapter = new StubAdapter();
    const input = request("YES_NO");
    input.question = "What is the best database?";
    await expect(runCouncil(input, { adapter })).rejects.toMatchObject({ code: "BINARY_REFRAME_REQUIRED" });
    expect(adapter.calls).toHaveLength(0);
  });

  it("uses selected model IDs at each stage", async () => {
    const adapter = new StubAdapter();
    const stages: StageEvent[] = [];
    const input = request("YES_NO", "AUTO");
    input.approvedRoles = undefined;
    input.models.expertModelOverrides = { 2: "override" };
    await runCouncil(input, { adapter, onStage: event => stages.push(event) });
    expect(adapter.calls.find((call) => call.stage === "role_generation")?.modelId).toBe("roles");
    expect(adapter.calls.filter((call) => call.stage === "yes_no_expert").map((call) => call.modelId)).toEqual(["expert", "expert", "override", "expert", "expert"]);
    expect(adapter.calls.find((call) => call.stage === "judge")?.modelId).toBe("judge");
    expect(stages.find(event => event.roles)?.roles).toHaveLength(5);
  });
});

describe("Debate council", () => {
  it("stops on compatible Round 1 conclusions", async () => {
    const adapter = new StubAdapter((call) => {
      if (call.stage === "debate_initial") return debateAnswer(call.prompt.role === "Specialist 1" ? "Use PostgreSQL." : "PostgreSQL is the right primary database.");
      return undefined;
    });
    const result = await runCouncil(request("DEBATE"), { adapter });
    expect(result.mode).toBe("DEBATE");
    if (result.mode !== "DEBATE") return;
    expect(result.terminationReason).toBe("CONSENSUS_ROUND_1");
    expect(result.rounds).toHaveLength(1);
    expect(count(adapter, "debate_rebuttal")).toBe(0);
    expect(count(adapter, "cross_evaluation")).toBe(0);
  });

  it("stops after Round 2 when the dissenting expert changes position", async () => {
    const adapter = new StubAdapter((call) => {
      if (call.stage === "debate_initial") return debateAnswer(call.prompt.role === "Specialist 3" ? "Avoid PostgreSQL." : "Use PostgreSQL.");
      if (call.stage === "debate_rebuttal") return debateAnswer("Use PostgreSQL.", { changed_mind: call.prompt.role === "Specialist 3", new_information: ["A new benchmark was supplied."] });
      return undefined;
    });
    const result = await runCouncil(request("DEBATE"), { adapter });
    expect(result.terminationReason).toBe("CONSENSUS_ROUND_2");
    expect(count(adapter, "debate_rebuttal")).toBe(3);
    expect(count(adapter, "cross_evaluation")).toBe(0);
  });

  it("stops after Round 2 with no new information and uses cross-evaluation", async () => {
    const adapter = new StubAdapter((call) => {
      if (call.stage === "debate_initial" || call.stage === "debate_rebuttal") return debateAnswer(call.prompt.role === "Specialist 3" ? "Avoid PostgreSQL." : "Use PostgreSQL.");
      return undefined;
    });
    const result = await runCouncil(request("DEBATE"), { adapter });
    expect(result.terminationReason).toBe("NO_NEW_INFORMATION");
    expect(count(adapter, "debate_rebuttal")).toBe(3);
    expect(count(adapter, "cross_evaluation")).toBe(3);
    expect(count(adapter, "judge")).toBe(1);
  });

  it("caps at three rounds and ranks cross-evaluated candidates", async () => {
    const adapter = new StubAdapter((call) => {
      if (call.stage === "debate_initial" || call.stage === "debate_rebuttal") return debateAnswer(call.prompt.role === "Specialist 3" ? "Avoid PostgreSQL." : "Use PostgreSQL.", { new_information: call.stage === "debate_rebuttal" ? ["Additional evidence."] : [] });
      return undefined;
    });
    const result = await runCouncil({ ...request("DEBATE"), settings: { adaptiveCompute: "HIGH", maxDebateRounds: 3 } }, { adapter });
    expect(result.mode).toBe("DEBATE");
    if (result.mode !== "DEBATE") return;
    expect(result.rounds).toHaveLength(3);
    expect(count(adapter, "debate_rebuttal")).toBe(6);
    expect(count(adapter, "cross_evaluation")).toBe(3);
    expect(result.crossEvaluation?.scores).toHaveLength(3);
    expect(count(adapter, "judge")).toBe(1);
  });

  it("can adjudicate a debate with two experts after one repeatedly fails", async () => {
    const adapter = new StubAdapter((call) => {
      if (call.stage === "debate_initial" && call.prompt.role === "Specialist 3") throw new Error("provider unavailable");
      return undefined;
    });
    const result = await runCouncil(request("DEBATE"), { adapter });
    expect(result.mode).toBe("DEBATE");
    if (result.mode !== "DEBATE") return;
    expect(result.experts).toHaveLength(2);
    expect(result.degraded).toBe(true);
    expect(result.failedExpertIndices).toEqual([2]);
    expect(count(adapter, "debate_initial")).toBe(4);
    expect(count(adapter, "judge")).toBe(1);
  });

  it("removes optional rounds under budget pressure while preserving the Judge", async () => {
    const costly = registry.map((model) => ({ ...model, inputCostPerMillion: 100, outputCostPerMillion: 100 }));
    const input = request("DEBATE");
    input.models.registry = costly;
    // Mandatory estimate is $0.65; another round plus reserved Judge exceeds $0.68.
    input.settings = { maxCost: 0.68 };
    const adapter = new StubAdapter((call) => {
      if (call.stage === "debate_initial") return debateAnswer(call.prompt.role === "Specialist 3" ? "Avoid PostgreSQL." : "Use PostgreSQL.");
      return undefined;
    });
    const result = await runCouncil(input, { adapter });
    expect(result.terminationReason).toBe("BUDGET_LIMIT");
    expect(count(adapter, "debate_rebuttal")).toBe(0);
    expect(count(adapter, "judge")).toBe(1);
  });
});

describe("guards and accounting", () => {
  it("rejects a cost cap when selected model pricing is unknown", async () => {
    const input = request("YES_NO");
    input.settings = { maxCost: 1 };
    input.models.registry = registry.map((model) => model.id === "judge" ? { ...model, outputCostPerMillion: undefined } : model);
    await expect(runCouncil(input, { adapter: new StubAdapter() })).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
  });

  it("counts paid invalid output attempts before a successful retry", async () => {
    const adapter = new StubAdapter((call, attempt) => {
      if (call.stage === "yes_no_expert" && call.prompt.assignedRole === "Specialist 1" && attempt === 1) return { vote: "MAYBE" };
      return undefined;
    });
    const result = await runCouncil(request("YES_NO"), { adapter });
    expect(result.usage.totalCalls).toBe(7);
    expect(result.usage.totalInputTokens).toBe(700);
    expect(result.usage.totalCost).toBeCloseTo(0.00098);
    expect(result.usage.calls.find((call) => call.success === false)?.inputTokens).toBe(100);
  });

  it("recognizes equivalent stances and guards negative phrasing", () => {
    expect(stancesCompatible("Use PostgreSQL.", "PostgreSQL is the right primary database.")).toBe(true);
    expect(stancesCompatible("Use PostgreSQL.", "Do not use PostgreSQL.")).toBe(false);
    expect(stancesCompatible("Use PostgreSQL.", "Use Redis.")).toBe(false);
  });

  it("cancels without starting later rounds or the Judge", async () => {
    const controller = new AbortController();
    const adapter = new StubAdapter((call) => {
      if (call.stage === "debate_initial") controller.abort();
      return undefined;
    });
    await expect(runCouncil(request("DEBATE"), { adapter, signal: controller.signal })).rejects.toMatchObject({ code: "CANCELLED" });
    expect(count(adapter, "judge")).toBe(0);
  });
});

it("records unknown pricing as null while preserving mandatory Judge execution", async () => {
  const input = request("YES_NO");
  input.models.registry = registry.map(({ inputCostPerMillion: _input, outputCostPerMillion: _output, ...model }) => model);
  const adapter = new StubAdapter();
  const result = await runCouncil(input, { adapter });
  expect(result.usage.totalCost).toBeNull();
  expect(result.usage.costComplete).toBe(false);
  expect(result.usage.calls.every((call) => call.estimatedCost === null)).toBe(true);
  expect(count(adapter, "judge")).toBe(1);
});

it("reports each failed expert and never calls the Judge without quorum", async () => {
  const { AIProviderError } = await import("../../lib/ai/core/errors.js");
  const events: StageEvent[] = [];
  const adapter = new StubAdapter((call) => {
    if (call.stage === "debate_initial" && call.prompt.role !== "Specialist 3") throw new AIProviderError("OUTPUT_LIMIT");
  });
  await expect(runCouncil(request("DEBATE"), { adapter, onStage: (event) => events.push(event) }))
    .rejects.toMatchObject({ code: "EXPERT_QUORUM_FAILED", details: { failures: [
      expect.objectContaining({ expertId: "expert-1", code: "OUTPUT_LIMIT" }),
      expect.objectContaining({ expertId: "expert-2", code: "OUTPUT_LIMIT" }),
    ] } });
  expect(events.filter((event) => event.type === "EXPERT_FAILED")).toHaveLength(2);
  expect(count(adapter, "debate_initial")).toBe(5);
  expect(count(adapter, "judge")).toBe(0);
});

it("recovers from truncated expert output with one retry and reaches the Judge", async () => {
  const { AIProviderError } = await import("../../lib/ai/core/errors.js");
  const adapter = new StubAdapter((call, attempt) => {
    if (call.stage === "debate_initial" && attempt === 1) throw new AIProviderError("OUTPUT_LIMIT");
  });
  const result = await runCouncil(request("DEBATE"), { adapter });
  expect(result.status).toBe("complete");
  expect(count(adapter, "debate_initial")).toBe(6);
  expect(count(adapter, "judge")).toBe(1);
});
