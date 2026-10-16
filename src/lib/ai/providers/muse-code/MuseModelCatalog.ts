import { z } from "zod";
import type { Connection } from "@muse-code/sdk";
import type { ModelDescriptor } from "../../core/types.js";
const rows = z.array(
  z.object({
    modelId: z.string(),
    providerId: z.string(),
    displayLabel: z.string(),
    contextLimit: z.number().nullish(),
    isDefault: z.boolean().optional(),
  }),
);
export async function readModels(
  connection: Connection,
  sessionId: string,
): Promise<ModelDescriptor[]> {
  const result = await connection.request("model/list", { sessionId });
  return rows
    .parse(result.models)
    .filter((row) => row.providerId === "meta")
    .map((row) => ({
      id: `muse:${row.modelId}`,
      model: row.modelId,
      providerId: "muse",
      displayName: row.displayLabel,
      available: true,
      contextWindow: row.contextLimit ?? undefined,
      capabilities: { text: true, structuredOutput: false },
      metadata: { default: row.isDefault, billing: "subscription" },
    }));
}
