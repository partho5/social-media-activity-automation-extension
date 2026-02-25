/**
 * Facebook Automation Utilities
 * Processes posts one-at-a-time in a forward-only sequence:
 *   scroll to post → expand "See more" → read → comment (letter by letter) → enter → close popup → next
 */

import { DELAY_RANGES, getDelayRange, getRandomDelay, addJitter, type SpeedFactor } from '@extension/env';

// ─── Delay configuration ───────────────────────────────────────────────────
/** Current speed factor (1=slow, 5=fast). Defaults to 3 (normal). */
let currentSpeedFactor: SpeedFactor = 3;

/** Set the speed factor for all subsequent delays. */
export function setSpeedFactor(factor: SpeedFactor): void {
  currentSpeedFactor = factor;
  console.log(`[CEB] Speed factor set to ${factor}/5`);
}

/** Get the current speed factor. */
export function getSpeedFactor(): SpeedFactor {
  return currentSpeedFactor;
}

// ─── Processed post tracking ────────────────────────────────────────────────
// A Set of unique post fingerprints so we never revisit a post, even if the DOM
// attribute gets wiped by a React re-render.
const processedPosts = new Set<string>();

/** Generate a stable fingerprint for a post element (first 120 chars of text). */
function postFingerprint(el: HTMLElement): string {
  const text = el.innerText?.trim().substring(0, 120) ?? '';
  // simple hash – good enough for dedup within a single session
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  }
  return `fp_${h}`;
}

/** Mark a post as processed in both the Set and DOM. */
function markProcessed(el: HTMLElement): void {
  processedPosts.add(postFingerprint(el));
  el.dataset.cebCommented = 'true';
}

/** Check whether a post has already been processed. */
function isProcessed(el: HTMLElement): boolean {
  return el.dataset.cebCommented === 'true' || processedPosts.has(postFingerprint(el));
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Wait for a DOM element to appear, optionally scoped to a root. */
function waitFor(
  selector: string,
  timeout = 5000,
  root: Document | HTMLElement = document,
): Promise<HTMLElement> {
  return new Promise((resolve, reject) => {
    const el = root.querySelector(selector) as HTMLElement;
    if (el) return resolve(el);

    const observeTarget = root instanceof Document ? root.body : root;
    const observer = new MutationObserver(() => {
      const el = root.querySelector(selector) as HTMLElement;
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(observeTarget, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      reject('Timeout waiting for element: ' + selector);
    }, timeout);
  });
}

/**
 * Apply a named delay from DELAY_RANGES config, scaled by current speed factor.
 * Includes small random jitter (±10% variation).
 */
async function delayNamed(
  delayKey: keyof typeof DELAY_RANGES,
): Promise<void> {
  const [baseMin, baseMax] = DELAY_RANGES[delayKey];
  const [adjustedMin, adjustedMax] = getDelayRange(baseMin, baseMax, currentSpeedFactor);
  const duration = getRandomDelay(adjustedMin, adjustedMax);
  const jitteredDuration = addJitter(duration);
  return new Promise(r => setTimeout(r, jitteredDuration));
}

/**
 * Custom delay with min-max range, scaled by current speed factor.
 * Includes small random jitter (±10% variation).
 */
async function delayCustom(
  baseMin: number,
  baseMax: number,
): Promise<void> {
  const [adjustedMin, adjustedMax] = getDelayRange(baseMin, baseMax, currentSpeedFactor);
  const duration = getRandomDelay(adjustedMin, adjustedMax);
  const jitteredDuration = addJitter(duration);
  return new Promise(r => setTimeout(r, jitteredDuration));
}

/** Smooth-scroll an element into view near the top of the viewport. */
function scrollToElement(element: HTMLElement, offset = 100): void {
  const topPosition = element.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top: topPosition, behavior: 'smooth' });
}

// ─── Console / debug helpers (unchanged API) ────────────────────────────────

export function getFirstPostText(): string {
  const firstPost = document.querySelector('[data-ad-rendering-role="story_message"]');
  if (!firstPost) return 'No post found';
  return (firstPost as HTMLElement).innerText?.trim() || 'Post content not accessible';
}

export function getAllPostTexts(): string[] {
  const posts = document.querySelectorAll('[data-ad-rendering-role="story_message"]');
  const results: string[] = [];
  posts.forEach((post, i) => {
    const text = (post as HTMLElement).innerText?.trim();
    if (text) {
      console.log(`Post ${i + 1}:`, text);
      results.push(text);
    }
  });
  return results;
}

export function getAllPostElements(): HTMLElement[] {
  const posts = Array.from(
    document.querySelectorAll('[data-ad-rendering-role="story_message"]'),
  ) as HTMLElement[];
  return posts.filter(p => !isProcessed(p) && !!p.innerText?.trim());
}

// ─── Core: forward-only single-post pipeline ────────────────────────────────

/** Minimum scrollY the automation has reached – ensures we never go backward. */
let lastScrollY = 0;

/**
 * Get the next unprocessed post that is AT or BELOW the current forward-mark.
 * This guarantees we only move downward through the feed.
 */
export function getNextUnprocessedPost(): HTMLElement | null {
  const posts = Array.from(
    document.querySelectorAll('[data-ad-rendering-role="story_message"]'),
  ) as HTMLElement[];

  for (const post of posts) {
    if (isProcessed(post)) continue;
    if (!post.innerText?.trim()) continue;

    // Only pick posts at or below our forward-mark (with a small tolerance)
    const postTop = post.getBoundingClientRect().top + window.scrollY;
    if (postTop >= lastScrollY - 200) {
      return post;
    }
  }
  return null;
}

/**
 * Expand "See more" on a single post if needed, then return its full text.
 */
export async function expandPost(postEl: HTMLElement): Promise<string> {
  const buttons = Array.from(postEl.querySelectorAll('[role="button"]'));
  for (const btn of buttons) {
    if ((btn as HTMLElement).innerText?.trim().includes('See more')) {
      (btn as HTMLElement).click();
      await delayNamed('seeMoreClick');
      break;
    }
  }
  return postEl.innerText?.trim() ?? '';
}

/**
 * Type text into an element letter-by-letter with human-like cadence.
 * Each keystroke: 40-120ms with natural variation.
 */
async function typeLetterByLetter(el: HTMLElement, text: string): Promise<void> {
  el.focus();
  await delayNamed('thinkBeforeType');

  for (const char of text) {
    document.execCommand('insertText', false, char);
    // Natural keystroke rhythm: 40-120ms
    await delayNamed('keystroke');

    // Occasionally pause slightly (like thinking mid-sentence)
    if (Math.random() < 0.1) {
      await delayNamed('typingPause');
    }
  }
}

/**
 * Skip a post without commenting (e.g., LLM decided not to comment).
 * Marks as processed, scrolls down gently, waits for reading simulation.
 */
export async function skipPost(postEl: HTMLElement): Promise<void> {
  try {
    // Scroll to post and read it (simulate reading time: 2-5 minutes worth of delay)
    scrollToElement(postEl, 150);
    const postTop = postEl.getBoundingClientRect().top + window.scrollY;
    lastScrollY = Math.max(lastScrollY, postTop);

    const fullText = await expandPost(postEl);
    console.log('📖 Skipping post (reading only):', fullText.substring(0, 150) + '...');

    // Reading time simulation: 2-5 seconds (fast reading of short post)
    await delayNamed('readingSkip');

    // Mark as processed
    markProcessed(postEl);

    // Gentle scroll down (150-350px)
    window.scrollBy(0, 150 + Math.random() * 200);
    await delayNamed('scrollPause');
  } catch (err) {
    markProcessed(postEl);
    console.error('❌ Error skipping post:', err);
    throw err;
  }
}

/**
 * Post a comment on a single Facebook post.
 *
 * Pipeline per post:
 *  1. Scroll to post (forward only)
 *  2. Expand "See more"
 *  3. Log / read content
 *  4. Wait & think (20-70 seconds before deciding to comment)
 *  5. Click comment button
 *  6. Type comment letter-by-letter (with natural pauses)
 *  7. Press Enter
 *  8. Close popup
 *  9. Mark processed
 */
export async function postFacebookComment(postEl: HTMLElement, commentText: string): Promise<void> {
  try {
    // 1 — Scroll to post and read (400-800ms to look at it)
    scrollToElement(postEl, 150);
    const postTop = postEl.getBoundingClientRect().top + window.scrollY;
    lastScrollY = Math.max(lastScrollY, postTop);

    // LOG POST DOM FOR INSPECTION
    const rect = postEl.getBoundingClientRect();
    const isActuallyVisible = rect.top >= 0 && rect.bottom > 0 && rect.top < window.innerHeight && rect.height > 0;
    console.log('📍 POST DOM:', {
      visible: isActuallyVisible,
      viewportTop: rect.top,
      viewportBottom: rect.bottom,
      height: rect.height,
      width: rect.width,
      windowHeight: window.innerHeight,
      scrollY: window.scrollY,
      postTop: postTop,
      element: postEl,
      html: postEl.outerHTML.substring(0, 500),
    });

    // SKIP if NOT visible in viewport
    if (!isActuallyVisible) {
      console.warn('⚠️ POST NOT VISIBLE! Skipping this post.');
      markProcessed(postEl);
      return;
    }

    await delayNamed('waitForFocus');

    // 2 — Expand "See more" if present
    const fullText = await expandPost(postEl);

    // 3 — Log content (simulate reading: 2-5 seconds for actual reading)
    console.log('📝 Post Content:', fullText.substring(0, 200) + (fullText.length > 200 ? '...' : ''));
    await delayNamed('waitForView');

    // 4 — Think time before deciding to comment (20-70 seconds)
    console.log('💭 Thinking about whether to comment...');
    await delayNamed('thinkBeforeComment');

    // 5 — Find & click comment button by walking up to post card ancestor
    let postContainer: HTMLElement = postEl;
    let commentBtn: HTMLElement | null = null;
    let ancestor: HTMLElement | null = postEl.parentElement;

    while (ancestor && ancestor !== document.body) {
      const btn = ancestor.querySelector(
        '[aria-label="Leave a comment"], [aria-label="Comment"]',
      ) as HTMLElement | null;
      if (btn) {
        postContainer = ancestor;
        commentBtn = btn;
        break;
      }
      ancestor = ancestor.parentElement;
    }

    if (!commentBtn) throw new Error('Comment button not found');

    commentBtn.click();
    await delayNamed('waitForCommentBox');

    // 6 — Wait for comment input
    let input: HTMLElement;
    try {
      input = await waitFor(
        '[contenteditable="true"][aria-label*="comment"], ' +
          '[contenteditable="true"][aria-label*="Comment"], ' +
          '[contenteditable="true"][data-lexical-editor="true"]',
        2000,
        postContainer,
      );
    } catch {
      // Fallback – comment box may open in a modal
      input = await waitFor(
        'div[contenteditable="true"], ' +
          '[aria-label*="comment"][contenteditable="true"], ' +
          '[aria-label*="Comment"][contenteditable="true"], ' +
          '[data-lexical-editor="true"]',
        3000,
        document,
      );
    }

    // 7 — Type comment letter-by-letter (with natural pauses built-in)
    await typeLetterByLetter(input, commentText);
    // Brief pause after typing before hitting enter
    await delayNamed('waitForSubmitBtn');

    // 8 — Press Enter to submit
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        bubbles: true,
      }),
    );
    await delayNamed('submitPause');
    console.log('✅ Comment posted:', commentText);

    // 9 — Mark processed + close popup
    markProcessed(postEl);

    const closeBtn = document.querySelector('[aria-label="Close"]') as HTMLElement;
    if (closeBtn) {
      closeBtn.click();
      await delayNamed('closePause');
    }
  } catch (err) {
    // Still mark processed on failure so we don't get stuck retrying the same post
    markProcessed(postEl);
    console.error('❌ Failed to post comment:', err);
    throw err;
  }
}

/**
 * Reset automation state (useful for re-runs).
 */
export function resetAutomation(): void {
  processedPosts.clear();
  lastScrollY = 0;
  document.querySelectorAll('[data-ceb-commented]').forEach(el => {
    delete (el as HTMLElement).dataset.cebCommented;
  });
}

export default {
  getFirstPostText,
  postFacebookComment,
  waitFor,
  setSpeedFactor,
  getSpeedFactor,
};
