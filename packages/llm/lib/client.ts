import type { LLMProvider } from './providers/types.js';
import { PromptRegistry } from './prompts/registry.js';
import type { PromptTemplate, PromptVariables } from './prompts/types.js';

export class LLMClient {
  constructor(
    private readonly provider: LLMProvider,
    private readonly registry: PromptRegistry,
  ) {}

  /**
   * Run a registered prompt by ID.
   *
   * @param promptId  - e.g. "facebook.comment-decision"
   * @param variables - key-value pairs replacing {{placeholders}} in the template
   */
  async run<T>(promptId: string, variables: PromptVariables = {}): Promise<T> {
    const template = this.registry.get<T>(promptId);
    if (!template) {
      const available = this.registry.listIds().join(', ') || '(none)';
      throw new Error(`Prompt "${promptId}" not found in registry. Available: ${available}`);
    }
    return this.runTemplate(template, variables);
  }

  /**
   * Run an ad-hoc template directly — no registry required.
   * Useful for one-off calls or dynamic prompts built at runtime.
   */
  async runTemplate<T>(template: PromptTemplate<T>, variables: PromptVariables = {}): Promise<T> {
    const userMessage = PromptRegistry.interpolate(template.userPromptTemplate, variables);

    const response = await this.provider.complete({
      messages: [
        { role: 'system', content: template.systemPrompt },
        { role: 'user', content: userMessage },
      ],
      model: template.model,
      temperature: template.temperature,
      maxTokens: template.maxTokens,
    });

    const result = template.parseResponse(response.content);

    const usageStr = response.usage
      ? ` (tokens: ${response.usage.promptTokens}+${response.usage.completionTokens}=${response.usage.totalTokens})`
      : '';
    console.debug(`[LLM] ${template.id}${usageStr}`, result);

    return result;
  }

  /** Expose the underlying registry for dynamic inspection or hot-registration. */
  get promptRegistry(): PromptRegistry {
    return this.registry;
  }
}

// ─── Platform factory helpers ─────────────────────────────────────────────────

import { FacebookPrompts } from './prompts/platforms/facebook.js';
import { LinkedInPrompts } from './prompts/platforms/linkedin.js';
import { OpenAIProvider } from './providers/openai.js';
import type { LLMProviderConfig } from './providers/types.js';

function resolveConfig(config?: Partial<LLMProviderConfig>): LLMProviderConfig {
  const apiKey = config?.apiKey ?? process.env['CEB_OPENAI_API_KEY'];
  if (!apiKey) {
    throw new Error('CEB_OPENAI_API_KEY is not set in .env');
  }
  return { ...config, apiKey };
}

/** Pre-loaded with all Facebook prompts. Falls back to OPENAI_API_KEY env var. */
export function createFacebookLLMClient(config?: Partial<LLMProviderConfig>): LLMClient {
  const provider = new OpenAIProvider(resolveConfig(config));
  const registry = new PromptRegistry().registerAll(FacebookPrompts.all);
  return new LLMClient(provider, registry);
}

/** Pre-loaded with all LinkedIn prompts. Falls back to OPENAI_API_KEY env var. */
export function createLinkedInLLMClient(config?: Partial<LLMProviderConfig>): LLMClient {
  const provider = new OpenAIProvider(resolveConfig(config));
  const registry = new PromptRegistry().registerAll(LinkedInPrompts.all);
  return new LLMClient(provider, registry);
}

/**
 * Fully custom — bring your own provider and prompts.
 * Use when mixing platforms or swapping the LLM backend.
 */
export function createLLMClient(
  provider: LLMProvider,
  prompts: ReadonlyArray<PromptTemplate<unknown>> = [],
): LLMClient {
  const registry = new PromptRegistry().registerAll(prompts);
  return new LLMClient(provider, registry);
}
