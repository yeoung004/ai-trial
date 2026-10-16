import type { ProviderRegistry } from "./ProviderRegistry.js";
import type {
  ModelDescriptor,
  ProviderSnapshot,
  StructuredCall,
} from "./types.js";
export class ProviderManager {
  private readonly catalogs = new Map<
    string,
    { models: ModelDescriptor[]; at: number; error?: string; checkedAt: number }
  >();
  private readonly health = new Map<
    string,
    { value: ProviderSnapshot["health"]; at: number }
  >();
  private readonly pending = new Map<string, Promise<ProviderSnapshot>>();
  constructor(
    readonly registry: ProviderRegistry,
    private readonly fallback: ModelDescriptor[] = [],
    private readonly now = Date.now,
  ) {}
  async snapshot(id: string, refresh = false): Promise<ProviderSnapshot> {
    const pending = this.pending.get(id);
    if (pending) return pending;
    const work = this.load(id, refresh);
    this.pending.set(id, work);
    try {
      return await work;
    } finally {
      this.pending.delete(id);
    }
  }
  private async load(id: string, refresh: boolean): Promise<ProviderSnapshot> {
    const provider = this.registry.get(id);
    let cached = this.catalogs.get(id);
    if (
      refresh ||
      !cached ||
      this.now() - cached.checkedAt > (cached.error ? 60000 : 900000)
    ) {
      try {
        cached = {
          models: await provider.listModels(),
          at: this.now(),
          checkedAt: this.now(),
        };
      } catch {
        cached = {
          models:
            cached?.models ?? this.fallback.filter((m) => m.providerId === id),
          at: cached?.at ?? 0,
          checkedAt: this.now(),
          error: "Could not refresh models.",
        };
      }
      this.catalogs.set(id, cached);
    }
    let health = this.health.get(id);
    if (refresh || !health || this.now() - health.at > 60000) {
      try {
        health = { value: await provider.healthCheck(), at: this.now() };
      } catch {
        health = { value: { status: "unavailable" }, at: this.now() };
      }
      this.health.set(id, health);
    }
    let usage = null;
    if (provider.getUsage && health.value.status === "connected") {
      try {
        usage = await provider.getUsage();
      } catch {
        /* Optional usage is explicitly unavailable. */
      }
    }
    return {
      id,
      displayName: provider.displayName,
      health: health.value,
      models: cached.models,
      source: cached.error ? (cached.at ? "cached" : "fallback") : "live",
      fetchedAt: cached.at || undefined,
      error: cached.error,
      usage,
    };
  }
  snapshots(refresh = false) {
    return Promise.all(
      this.registry.all().map((p) => this.snapshot(p.id, refresh)),
    );
  }
  async generate<T>(request: StructuredCall<T>) {
    // A stage always uses exactly its configured provider. There is no paid failover.
    return this.registry.get(request.model.provider).generate(request);
  }
}
