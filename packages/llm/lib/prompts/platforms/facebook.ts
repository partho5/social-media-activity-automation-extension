import type { PromptTemplate } from '../types.js';

// ─── Response shape ──────────────────────────────────────────────────────────

export interface FacebookPostAction {
  skip: boolean;
  comment: string;
  relevanceScore: number;
  /** Lead-intent confidence 0.0–1.0. Present only when lead hunting is on. */
  leadConfidence?: number;
  /** Short justification for the lead score. Present only when hunting. */
  leadReason?: string;
}

// ─── Parser ───────────────────────────────────────────────────────────────────

function parsePostActionJson(raw: string): FacebookPostAction {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;
  const norm = (v: unknown): number => {
    const n = typeof v === 'number' ? v : 0;
    return n > 1 ? n / 100 : n;
  };
  return {
    skip: Boolean(parsed.skip),
    comment: typeof parsed.comment === 'string' ? parsed.comment : '',
    relevanceScore: norm(parsed.relevanceScore),
    ...(parsed.leadConfidence != null ? { leadConfidence: norm(parsed.leadConfidence) } : {}),
    ...(typeof parsed.leadReason === 'string' ? { leadReason: parsed.leadReason } : {}),
  };
}

// ─── Style descriptions (code-owned) ──────────────────────────────────────────

const STYLE_DESCRIPTIONS: Record<string, string> = {
  supportive: 'warm and affirming — validate the idea, effort, or person behind the post',
  curious: 'genuine inquiry — ask a question that deepens the conversation',
  analytical: 'structured reasoning — break down the topic, examine causes and effects',
  critical: 'sharp but fair — challenge a weak argument or point out what is missing',
  humorous: 'light wit or wordplay — find the funny angle without trivializing',
  empathetic: 'acknowledge the human feeling behind the post — show you understand',
  skeptical: 'calm doubt — question the claim or source without being dismissive',
  informative: 'add a useful fact, stat, or insight that enriches the discussion',
  inspirational: 'uplift and motivate — connect the post to broader purpose or possibility',
  conversational: 'casual and friendly — engage as if talking to a person, not broadcasting',
  provocative: 'stir healthy debate — introduce a contrarian angle to spark thinking',
  sarcastic: 'biting irony — highlight hypocrisy or absurdity with a dry edge',
  neutral: 'balanced and measured — present multiple sides without taking a strong stance',
  personal: 'draw on lived experience — make the comment relatable with a personal lens',
  enthusiastic: 'high energy and genuine excitement — express passion for the subject',
};

function buildStyleList(styles: string[]): string {
  const active = styles.length > 0 ? styles : Object.keys(STYLE_DESCRIPTIONS);
  return active
    .map(s => `- ${s} — ${STYLE_DESCRIPTIONS[s] ?? 'context-appropriate'}`)
    .join('\n');
}

// ─── System prompt template (code-owned, variable-driven) ─────────────────────

const SYSTEM_PROMPT_TEMPLATE = `You are {{persona}}.

You engage with Facebook posts about {{topic}}. Write all replies in {{language}}.

─── DECISION ───
Comment on a post when: {{engageWhen}}

Skip a post when: {{skipWhen}}

─── COMMENT STYLE ───
Pick the register the post actually invites — never default to one voice. Available registers:
{{styles}}

Most posts blend two or more registers. Let the post guide the blend. The voice must feel human — present, thought-through, never PR, never generic, never one-note.

Tone hint: {{tone}}

─── OUTPUT ───
Write 1–3 sentences in {{language}}.

Respond with valid JSON only — no markdown, no prose:
{"skip": boolean, "comment": string, "relevanceScore": number}
- relevanceScore: 0.0 (irrelevant / personal / pure ad) to 1.0 (perfect match for the topic above)
- skip: true if the post matches the skip criteria; false otherwise
- comment: reply text in {{language}}; "" when skip is true{{leadBlock}}`;

// Appended to the OUTPUT section only when lead hunting is enabled.
const LEAD_BLOCK_TEMPLATE = `

─── LEAD SCORING ───
Independently of the comment decision, judge whether this post is a lead.
A post is a lead when: {{leadCriteria}}
ALSO include these two keys in the JSON:
- leadConfidence: 0.0 (definitely not a lead) to 1.0 (unmistakable lead intent)
- leadReason: one short sentence (in English) explaining the score`;

const USER_PROMPT_TEMPLATE = `Post:
"{{postContent}}"`;

// ─── Builder ──────────────────────────────────────────────────────────────────

export interface FacebookPromptConfig {
  persona: string;
  topic: string;
  language: string;
  tone: string;
  styles: string[];
  engageWhen: string;
  skipWhen: string;
  hungryLeadFinder?: boolean;
  leadCriteria?: string;
}

/**
 * Build a runtime LLM prompt template from the user's simple config hints.
 * The structure, JSON spec, and style descriptions are all code-owned.
 */
export function buildFacebookPostActionTemplate(
  config: FacebookPromptConfig,
): PromptTemplate<FacebookPostAction> {
  return {
    id: 'facebook.post-action',
    platform: 'facebook',
    action: 'post-action',
    description: 'Relevance-check, comment decision, and comment generation in one call.',
    maxTokens: 2000,
    parseResponse: parsePostActionJson,
    systemPrompt: SYSTEM_PROMPT_TEMPLATE,
    userPromptTemplate: USER_PROMPT_TEMPLATE,
  };
}

/** Variables to interpolate at call time, derived from FacebookBotConfig. */
export function buildFacebookPromptVariables(
  config: FacebookPromptConfig,
  postContent: string,
): Record<string, string> {
  const hunting = config.hungryLeadFinder === true && !!config.leadCriteria;
  return {
    persona: config.persona,
    topic: config.topic,
    language: config.language,
    tone: config.tone,
    styles: buildStyleList(config.styles),
    engageWhen: config.engageWhen,
    skipWhen: config.skipWhen,
    leadBlock: hunting
      ? LEAD_BLOCK_TEMPLATE.replace('{{leadCriteria}}', () => config.leadCriteria as string)
      : '',
    postContent,
  };
}

// ─── Backwards-compatible exports (legacy callers) ────────────────────────────

export const postActionShell = {
  id: 'facebook.post-action',
  platform: 'facebook' as const,
  action: 'post-action',
  description: 'Relevance-check, comment decision, and comment generation in one call.',
  maxTokens: 2000,
  parseResponse: parsePostActionJson,
} satisfies Omit<PromptTemplate<FacebookPostAction>, 'systemPrompt' | 'userPromptTemplate'>;

export const FacebookPromptShells = {
  postAction: postActionShell,
} as const;
