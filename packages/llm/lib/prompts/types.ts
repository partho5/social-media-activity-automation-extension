/** Supported platforms. Extend this union as new platforms are added. */
export type Platform = 'facebook' | 'linkedin' | 'twitter' | (string & {});

/** Key-value map of variables for template interpolation. */
export type PromptVariables = Record<string, string>;

/**
 * A self-contained prompt definition.
 *
 * TResponse - the typed value returned after parseResponse() runs.
 *             Defaults to string (plain text).
 */
export interface PromptTemplate<TResponse = string> {
  /** Unique dot-namespaced identifier, e.g. "facebook.comment-generation" */
  id: string;
  platform: Platform;
  /** Short verb describing what this prompt does, e.g. "comment-generation" */
  action: string;
  description: string;

  /** Sent as the `system` role message. */
  systemPrompt: string;
  /**
   * Sent as the `user` role message.
   * Supports {{variableName}} interpolation via PromptRegistry.interpolate().
   */
  userPromptTemplate: string;

  /** Override the provider's default model for this specific prompt. */
  model?: string;
  temperature?: number;
  maxTokens?: number;

  /**
   * Transform the raw LLM string output into the desired typed response.
   * Throw if the output doesn't match expectations.
   */
  parseResponse(raw: string): TResponse;
}

/** Utility type: extract the response type from a PromptTemplate. */
export type InferPromptResponse<T> = T extends PromptTemplate<infer R> ? R : never;
