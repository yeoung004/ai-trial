import type {
  StructuredCall,
  StructuredResponse,
  ModelDescriptor,
  ProviderHealth,
  ProviderCapabilities,
} from "./types.js";
export interface AIProvider {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: ProviderCapabilities;
  readonly fallbackModels?: ModelDescriptor[];
  listModels(): Promise<ModelDescriptor[]>;
  generate<T>(request: StructuredCall<T>): Promise<StructuredResponse<T>>;
  healthCheck(): Promise<ProviderHealth>;
}
