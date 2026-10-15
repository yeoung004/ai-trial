import type { CouncilMode } from "../../shared/types";

/** Fixed prompts and human review criteria. Criteria are never sent to either arm. */
export interface EvaluationCase {
  id: string;
  mode: CouncilMode;
  question: string;
  context?: string;
  referenceDecision?: "YES" | "NO";
  criteria: string[];
}

export const EVALUATION_CASES: readonly EvaluationCase[] = [
  {
    id: "browser-provider-key",
    mode: "YES_NO",
    question: "Should a web app send its private AI provider API key to the browser so users can call the model directly?",
    context: "The app is used by one person but served over the public internet.",
    referenceDecision: "NO",
    criteria: [
      "Explains that browser-delivered keys can be extracted and abused.",
      "Recommends keeping the provider key on the server and authenticating the app request.",
      "Mentions spend controls or rate limiting without claiming that obfuscation secures a key.",
    ],
  },
  {
    id: "premature-redis",
    mode: "YES_NO",
    question: "Should a small team add Redis to its read-heavy app before measuring whether its database is the bottleneck?",
    context: "The app has modest traffic, a relational database, and no measured latency target breaches.",
    referenceDecision: "NO",
    criteria: [
      "Uses measurement, query plans, indexes, and caching evidence to guide the decision.",
      "Accounts for Redis operational cost and invalidation complexity.",
      "Names conditions under which adding Redis would become justified.",
    ],
  },
  {
    id: "notes-search-plan",
    mode: "DEBATE",
    question: "What search architecture should a small notes app use now, and when should it move to a dedicated search service?",
    context: "It has 8,000 notes today, may reach 100,000, and needs title/body search with reasonable relevance and low maintenance.",
    criteria: [
      "Compares built-in database full-text search with a dedicated search service.",
      "Gives a practical initial design and measurable migration triggers.",
      "Discusses relevance, latency, operations, and index synchronization tradeoffs.",
      "States uncertainty where workload or ranking requirements are unspecified.",
    ],
  },
];
