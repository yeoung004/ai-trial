import { ProviderRegistry } from "../core/ProviderRegistry.js";
import { ProviderManager } from "../core/ProviderManager.js";
import { ApiProvider, apiConnections } from "./api/ApiProvider.js";
export const providerManager = new ProviderManager(
  new ProviderRegistry([
    ...apiConnections.map((connection) => new ApiProvider(connection)),
  ]),
);
