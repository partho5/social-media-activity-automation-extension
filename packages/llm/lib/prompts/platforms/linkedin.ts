import type { PromptTemplate } from '../types.js';

// ─── Response shapes ────────────────────────────────────────────────────────

export interface LinkedInCommentDecision {
  shouldComment: boolean;
  comment: string | null;
  reason: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseDecisionJson(raw: string): LinkedInCommentDecision {
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
 * Variables: {{postContent}}, {{persona}}, {{language}}
 */
const commentDecision: PromptTemplate<LinkedInCommentDecision> = {
  id: 'linkedin.comment-decision',
  platform: 'linkedin',
  action: 'comment-decision',
  description: 'Decide whether to comment on a LinkedIn post and generate a professional comment.',
  systemPrompt: `You are a professional social media assistant helping someone engage thoughtfully on LinkedIn.

Analyse the post and decide whether it merits a comment. LinkedIn is a professional network — prefer posts with genuine insights, career advice, or industry topics. Skip promotional spam.

If you decide to comment, write one or two concise, professional sentences.

Respond with valid JSON only — no markdown fences, no prose:
{"shouldComment": boolean, "comment": string | null, "reason": string}`,

  userPromptTemplate: `Post content:
"{{postContent}}"

Your persona: {{persona}}
Write in: {{language}}`,

  temperature: 0.7,
  maxTokens: 200,
  parseResponse: parseDecisionJson,
};

// ─── Namespace export ─────────────────────────────────────────────────────────

export const LinkedInPrompts = {
  commentDecision,
  all: [commentDecision] as ReadonlyArray<PromptTemplate<unknown>>,
} as const;
