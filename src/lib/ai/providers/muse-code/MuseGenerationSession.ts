import { z } from "zod";
import type { FoldedItem } from "@muse-code/sdk";
import type { StructuredCall, StructuredResponse } from "../../core/types.js";
import { MuseHostManager } from "./MuseHostManager.js";
import { createSession } from "./MuseSessionFactory.js";
import { requireSubscription } from "./MuseUsageReader.js";
import { readModels } from "./MuseModelCatalog.js";
import { finalText, parseJSON } from "./MuseEventMapper.js";
import { MuseError } from "./MuseErrors.js";
export async function generateMuse<T>(
  request: StructuredCall<T>,
): Promise<StructuredResponse<T>> {
  const manager = new MuseHostManager();
  const start = performance.now();
  request.signal?.throwIfAborted();
  const abort = () => {
    void manager.close();
  };
  request.signal?.addEventListener("abort", abort, { once: true });
  try {
    return await manager.withHost(
      async ({ client, connection, workspaceRoot }) =>
        manager.bound(
          (async () => {
            request.signal?.throwIfAborted();
            await requireSubscription(connection);
            const session = await createSession(
              client,
              workspaceRoot,
              request.model.model,
            );
            const catalog = await readModels(connection, session.sessionId);
            if (!catalog.some((m) => m.model === request.model.model))
              throw new MuseError(
                "MODEL_UNAVAILABLE",
                "Selected Muse model is unavailable.",
              );
            const turn = await session.sendUserTurn({
              input: [
                {
                  type: "text",
                  text: `${request.system}\nReturn only JSON matching this schema. Use no tools. Keep output within approximately ${request.maxOutputTokens} tokens.\n${JSON.stringify(z.toJSONSchema(request.schema))}\nInput:\n${request.prompt}`,
                },
              ],
            });
            const items = new Map<string, FoldedItem>();
            for await (const item of turn.items()) {
              if (
                ["toolCall", "subagent", "workflow", "hookRun"].includes(
                  String(item.kind),
                )
              )
                throw new MuseError(
                  "MUSE_TOOLS_DISABLED",
                  "Muse attempted a tool operation in a reasoning session.",
                );
              items.set(item.itemId, item);
            }
            const outcome = await turn.completed;
            if (
              outcome.kind !== "completed" ||
              outcome.params.terminal !== "completed"
            ) {
              if (outcome.kind === "completed" && outcome.params.error?.quota)
                throw new MuseError(
                  "MUSE_ALLOWANCE_UNAVAILABLE",
                  "Muse allowance unavailable.",
                );
              throw new MuseError(
                "MUSE_GENERATION_FAILED",
                "Muse did not complete its reasoning turn.",
              );
            }
            const usage = outcome.params.usage;
            return {
              object: request.schema.parse(
                parseJSON(finalText(items.values())),
              ),
              inputTokens: usage?.inputTokens ?? 0,
              outputTokens: usage?.outputTokens ?? 0,
              tokensKnown: !!usage,
              latencyMs: Math.round(performance.now() - start),
            };
          })(),
          180000,
        ),
    );
  } finally {
    request.signal?.removeEventListener("abort", abort);
    await manager.close();
  }
}
