import type { LLMProvider, LLMProviderConfig, LLMRequest, LLMResponse } from './types.js';

const OPENAI_DEFAULT_MODEL = 'gpt-4o-mini';
const OPENAI_BASE_URL = 'https://api.openai.com/v1';

export class OpenAIProvider implements LLMProvider {
  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly baseUrl: string;

  constructor(config: LLMProviderConfig) {
    this.apiKey = config.apiKey;
    this.defaultModel = config.model ?? OPENAI_DEFAULT_MODEL;
    this.baseUrl = config.baseUrl ?? OPENAI_BASE_URL;
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: request.model ?? this.defaultModel,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 500,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      const message = errorBody?.error?.message ?? response.statusText;
      throw new Error(`OpenAI API error ${response.status}: ${message}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    if (!choice) {
      throw new Error('OpenAI returned no choices in response');
    }

    return {
      content: choice.message.content as string,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens as number,
            completionTokens: data.usage.completion_tokens as number,
            totalTokens: data.usage.total_tokens as number,
          }
        : undefined,
    };
  }
}
