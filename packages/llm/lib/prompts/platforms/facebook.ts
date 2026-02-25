import type { PromptTemplate } from '../types.js';

// ─── Response shapes ────────────────────────────────────────────────────────

export interface FacebookCommentDecision {
  shouldComment: boolean;
  /** Non-null when shouldComment is true. */
  comment: string | null;
  /** Internal reasoning — not posted. */
  reason: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseDecisionJson(raw: string): FacebookCommentDecision {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;
  return {
    shouldComment: Boolean(parsed.shouldComment),
    comment: typeof parsed.comment === 'string' ? parsed.comment : null,
    reason: typeof parsed.reason === 'string' ? parsed.reason : '',
  };
}

// ─── Prompts ─────────────────────────────────────────────────────────────────

/**
 * Evaluates the post and either generates a comment or skips it.
 *
 * Variables: {{postContent}}, {{persona}}, {{language}}
 */
const commentDecision: PromptTemplate<FacebookCommentDecision> = {
  id: 'facebook.comment-decision',
  platform: 'facebook',
  action: 'comment-decision',
  description: 'Decide whether to comment and generate the comment text in one call.',
  systemPrompt: `You are a social media assistant helping someone engage authentically on Facebook.

Analyse the post and decide:
1. Is it worth commenting on? (not spam, not purely promotional, has real content)
2. If yes, write a short, genuine, human-sounding comment (1–2 sentences maximum).

Respond with valid JSON only — no markdown fences, no prose — matching this schema:
{"shouldComment": boolean, "comment": string | null, "reason": string}

Rules:
- shouldComment: true if worth engaging with, false otherwise
- comment: the comment text when shouldComment is true, null otherwise
- reason: brief internal note explaining the decision (not shown publicly)`,

  userPromptTemplate: `Post content:
"{{postContent}}"

Your persona: {{persona}}
Write in: {{language}}`,

  temperature: 0.8,
  maxTokens: 200,
  parseResponse: parseDecisionJson,
};

/**
 * Generates a comment without a skip/engage decision.
 * Use when you have already decided to comment and just need text.
 *
 * Variables: {{postContent}}, {{tone}}
 */
const commentGenerate: PromptTemplate<string> = {
  id: 'facebook.comment-generate',
  platform: 'facebook',
  action: 'comment-generate',
  description: 'Generate comment text only (caller already decided to comment).',
  systemPrompt: `You are a social media assistant. Write a short, genuine comment (1–2 sentences) for the given Facebook post.
Respond with the comment text only — no quotes, no labels, no extra explanation.`,

  userPromptTemplate: `Post content: "{{postContent}}"
Tone: {{tone}}`,

  temperature: 0.9,
  maxTokens: 100,
  parseResponse: (raw: string) => raw.trim(),
};

/**
 * Cheap binary filter: is the post relevant to a topic?
 * Run this before spending tokens on commentDecision.
 *
 * Variables: {{topic}}, {{postContent}}
 */
const relevanceCheck: PromptTemplate<boolean> = {
  id: 'facebook.relevance-check',
  platform: 'facebook',
  action: 'relevance-check',
  description: 'Check whether a post is relevant to a topic before engaging.',
  systemPrompt: `Decide whether a social media post is relevant to the given topic.
Respond with only the word "true" or "false", nothing else.`,

  userPromptTemplate: `Topic: {{topic}}
Post: "{{postContent}}"`,

  temperature: 0.1,
  maxTokens: 5,
  parseResponse: (raw: string) => raw.trim().toLowerCase() === 'true',
};

// ─── Namespace export ─────────────────────────────────────────────────────────

export const FacebookPrompts = {
  commentDecision,
  commentGenerate,
  relevanceCheck,
  all: [commentDecision, commentGenerate, relevanceCheck] as ReadonlyArray<PromptTemplate<unknown>>,
} as const;
