import type { AIProvider } from "./AIProvider.js";
export class ProviderRegistry {
  private readonly providers = new Map<string, AIProvider>();
  constructor(providers: AIProvider[]) {
    for (const provider of providers) {
      if (this.providers.has(provider.id))
        throw new Error("Duplicate provider");
      this.providers.set(provider.id, provider);
    }
  }
  get(id: string) {
    const provider = this.providers.get(id);
    if (!provider) throw new Error("Unknown provider");
    return provider;
  }
  all() {
    return [...this.providers.values()];
  }
}
