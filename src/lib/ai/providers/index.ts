import { ProviderRegistry } from "../core/ProviderRegistry.js";
import { ProviderManager } from "../core/ProviderManager.js";
import { MuseCodeProvider } from "./muse-code/MuseCodeProvider.js";
import { ApiProvider, apiConnections } from "./api/ApiProvider.js";
export const providerManager = new ProviderManager(
  new ProviderRegistry([
    new MuseCodeProvider(),
    ...apiConnections.map((connection) => new ApiProvider(connection)),
  ]),
);
