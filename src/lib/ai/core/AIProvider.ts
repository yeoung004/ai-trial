import type {
  StructuredCall,
  StructuredResponse,
  ModelDescriptor,
  ProviderHealth,
  ProviderUsage,
} from "./types.js";
export interface AIProvider {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: { structuredOutput: boolean; subscription: boolean };
  listModels(): Promise<ModelDescriptor[]>;
  generate<T>(request: StructuredCall<T>): Promise<StructuredResponse<T>>;
  healthCheck(): Promise<ProviderHealth>;
  getUsage?(): Promise<ProviderUsage | null>;
}
