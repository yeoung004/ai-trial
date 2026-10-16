import type { MuseClient } from "@muse-code/sdk";
export function createSession(
  client: MuseClient,
  workspaceRoot: string,
  modelId?: string,
) {
  return client.startSession({
    workspaceRoot,
    providerId: "meta",
    modelId,
    approvalMode: "denyUnmatched",
  });
}
