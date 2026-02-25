export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMRequest {
  messages: LLMMessage[];
  /** Override the provider's default model for this request. */
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LLMResponse {
  content: string;
  usage?: LLMUsage;
}

/** Implement this interface to support a new LLM backend. */
export interface LLMProvider {
  complete(request: LLMRequest): Promise<LLMResponse>;
}

export interface LLMProviderConfig {
  apiKey: string;
  /** Default model to use when not specified per-request. */
  model?: string;
  /** Override the base URL (useful for proxies or compatible APIs). */
  baseUrl?: string;
}
