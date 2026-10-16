import type { AIProvider } from "../../core/AIProvider.js";
import type {
  ProviderHealth,
  ProviderUsage,
  StructuredCall,
} from "../../core/types.js";
import { MuseHostManager } from "./MuseHostManager.js";
import { createSession } from "./MuseSessionFactory.js";
import { readModels } from "./MuseModelCatalog.js";
import { requireSubscription } from "./MuseUsageReader.js";
import { generateMuse } from "./MuseGenerationSession.js";
export class MuseCodeProvider implements AIProvider {
  readonly id = "muse";
  readonly displayName = "Muse Code";
  readonly capabilities = { structuredOutput: false, subscription: true };
  private usage: ProviderUsage | null = null;
  async listModels() {
    const manager = new MuseHostManager();
    return manager.withHost((host) =>
      manager.bound(
        (async () => {
          const session = await createSession(host.client, host.workspaceRoot);
          return readModels(host.connection, session.sessionId);
        })(),
      ),
    );
  }
  async healthCheck(): Promise<ProviderHealth> {
    const manager = new MuseHostManager();
    try {
      this.usage = await manager.withHost((host) =>
        manager.bound(requireSubscription(host.connection)),
      );
      return { status: "connected" };
    } catch (error) {
      this.usage = null;
      const code = (error as { code?: string }).code;
      return {
        status:
          code === "MUSE_AUTH_REQUIRED"
            ? "authentication_required"
            : code === "MUSE_ALLOWANCE_UNAVAILABLE"
              ? "rate_limited"
              : "unavailable",
        message:
          error instanceof Error && code?.startsWith("MUSE_")
            ? error.message
            : "Muse Code is not connected. Check the local CLI version and sign-in.",
      };
    }
  }
  async getUsage() {
    return this.usage;
  }
  generate<T>(request: StructuredCall<T>) {
    return generateMuse(request);
  }
}
