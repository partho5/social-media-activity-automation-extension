import type { PromptTemplate, PromptVariables } from './types.js';

export class PromptRegistry {
  private readonly prompts = new Map<string, PromptTemplate<unknown>>();

  /** Register a prompt template. Returns `this` for chaining. */
  register<T>(template: PromptTemplate<T>): this {
    this.prompts.set(template.id, template as PromptTemplate<unknown>);
    return this;
  }

  /** Register multiple templates at once. */
  registerAll(templates: ReadonlyArray<PromptTemplate<unknown>>): this {
    for (const t of templates) {
      this.register(t);
    }
    return this;
  }

  /** Retrieve a template by id, or undefined if not registered. */
  get<T = unknown>(id: string): PromptTemplate<T> | undefined {
    return this.prompts.get(id) as PromptTemplate<T> | undefined;
  }

  has(id: string): boolean {
    return this.prompts.has(id);
  }

  /** List all registered prompt ids. */
  listIds(): string[] {
    return Array.from(this.prompts.keys());
  }

  /**
   * Replace {{variableName}} placeholders in a template string.
   * Missing variables are left as-is ({{variableName}}) rather than silently
   * becoming empty strings, making problems easier to spot.
   */
  static interpolate(template: string, variables: PromptVariables): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => variables[key] ?? match);
  }
}
