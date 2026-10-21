/**
 * Facebook Automation Utilities
 * Processes posts one-at-a-time in a forward-only sequence:
 *   scroll to post → expand "See more" → read → comment (letter by letter) → enter → close popup → next
 */

import { DELAY_RANGES, getDelayRange, getRandomDelay, addJitter, type SpeedFactor } from '@extension/env';

// ─── Delay configuration ───────────────────────────────────────────────────
/** Current speed factor (1=slow, 5=fast). Defaults to 3 (normal). */
let currentSpeedFactor: SpeedFactor = 5;

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

let _postIdCounter = 0;

/** Generate a stable fingerprint for a post element (first 120 chars of text). */
function postFingerprint(el: HTMLElement): string {
  const text = el.innerText?.trim().substring(0, 120) ?? '';
  if (!text) {
    // Image/video-only posts have no text — assign a stable per-element ID on first sight.
    if (!el.dataset.cebFp) el.dataset.cebFp = `fp_empty_${++_postIdCounter}`;
    return el.dataset.cebFp;
  }
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

/** Timestamp (ms) of the last successfully posted comment. 0 = none yet. */
let lastCommentedTime = 0;

/**
 * Get the next unprocessed post that is AT or BELOW the current forward-mark.
 * This guarantees we only move downward through the feed.
 */
export function getNextUnprocessedPost(): HTMLElement | null {
  // Text posts (existing)
  const textPosts = Array.from(
    document.querySelectorAll('[data-ad-rendering-role="story_message"]'),
  ) as HTMLElement[];

  // Image-only posts: feedImage whose post card has no story_message
  const imageOnlyPosts: HTMLElement[] = [];
  for (const img of Array.from(document.querySelectorAll('img[data-imgperflogname="feedImage"]')) as HTMLElement[]) {
    let card: HTMLElement | null = img.parentElement;
    while (card && card !== document.body) {
      if (card.hasAttribute('data-virtualized')) break;
      card = card.parentElement;
    }
    if (!card || card === document.body) continue;
    if (card.querySelector('[data-ad-rendering-role="story_message"]')) continue; // text post, already covered
    imageOnlyPosts.push(img);
  }

  console.log(`[CEB] Discovery — text posts: ${textPosts.length}, image-only posts: ${imageOnlyPosts.length}`);

  // Merge and sort by vertical position so forward-only order is preserved
  const all = [...textPosts, ...imageOnlyPosts].sort(
    (a, b) =>
      (a.getBoundingClientRect().top + window.scrollY) -
      (b.getBoundingClientRect().top + window.scrollY),
  );

  for (const post of all) {
    if (isProcessed(post)) continue;
    const postTop = post.getBoundingClientRect().top + window.scrollY;
    const type = post.tagName === 'IMG' ? 'image-only' : 'text';
    console.log(`[CEB] Candidate — type: ${type}, top: ${postTop}, forwardMark: ${lastScrollY}`);
    if (postTop >= lastScrollY - 200) {
      return post;
    }
  }
  return null;
}

/**
 * Extract absolute image URLs from a post element.
 * Walks up the DOM to find the post card container, then collects non-icon images.
 */
export function getPostImageUrls(postEl: HTMLElement): string[] {
  // Walk up to find a container that holds images and is tall enough to be a post card
  let container: HTMLElement | null = postEl.parentElement;
  while (container && container !== document.body) {
    if (container.querySelectorAll('img').length > 0 && container.offsetHeight > 200) break;
    container = container.parentElement;
  }
  if (!container || container === document.body) container = postEl;

  const urls: string[] = [];
  for (const img of Array.from(container.querySelectorAll('img')) as HTMLImageElement[]) {
    const src = img.src || img.getAttribute('src') || '';
    if (!src || src.startsWith('data:')) continue;

    // Skip tiny images: icons, emoji reactions, profile avatars (< 60px on either side)
    const w = img.naturalWidth || img.width || img.offsetWidth;
    const h = img.naturalHeight || img.height || img.offsetHeight;
    const attrW = parseInt(img.getAttribute('width') ?? '0', 10);
    const attrH = parseInt(img.getAttribute('height') ?? '0', 10);
    if ((w > 0 && w < 60) || (h > 0 && h < 60)) continue;
    if ((attrW > 0 && attrW < 60) || (attrH > 0 && attrH < 60)) continue;

    const absolute = src.startsWith('http') ? src : new URL(src, location.href).href;
    if (!urls.includes(absolute)) urls.push(absolute);
  }

  return urls;
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
 * Click the "Hide post" cross button scoped to the given post element.
 * Walks up the DOM to find the post card container, then clicks the hide link.
 */
export async function crossThisPost(postEl: HTMLElement): Promise<void> {
  let ancestor: HTMLElement | null = postEl.parentElement;
  while (ancestor && ancestor !== document.body) {
    const hideBtn = ancestor.querySelector('a[aria-label^="Hide post"]') as HTMLElement | null;
    if (hideBtn) {
      hideBtn.click();
      console.log('✖️ Hid post from feed');
      await delayNamed('closePause');
      return;
    }
    ancestor = ancestor.parentElement;
  }
  console.warn('⚠️ Hide post button not found — post may already be removed');
}

/**
 * Skip a post without commenting (e.g., LLM decided not to comment).
 * Marks as processed, hides the post via the cross button, then scrolls down.
 */
export async function skipPost(postEl: HTMLElement): Promise<void> {
  await delayCustom(3000, 10_000);
  try {
    // Scroll to post and read it (simulate reading time: 2-5 minutes worth of delay)
    scrollToElement(postEl, 150);
    const postTop = postEl.getBoundingClientRect().top + window.scrollY;
    lastScrollY = Math.max(lastScrollY, postTop);

    const fullText = await expandPost(postEl);
    console.log('📖 Skipping post (reading only):', fullText.substring(0, 150) + '...');
    const skipImgs = getPostImageUrls(postEl);
    if (skipImgs.length > 0) console.log('🖼️ Post images:', skipImgs);

    // Reading time simulation: 2-5 seconds (fast reading of short post)
    await delayNamed('readingSkip');

    // Hide the post from feed via the cross button
    await crossThisPost(postEl);

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
    const imageUrls = getPostImageUrls(postEl);
    if (imageUrls.length > 0) console.log('🖼️ Post images:', imageUrls);
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

    const commentInputSelector =
      '[contenteditable="true"][aria-label*="comment"], ' +
      '[contenteditable="true"][aria-label*="Comment"], ' +
      '[contenteditable="true"][data-lexical-editor="true"]';

    // If scrollThroughComments already opened the comment section, clicking the
    // button again would toggle it closed. Only click if input is not yet visible.
    const alreadyOpen = !!postContainer.querySelector(commentInputSelector);
    if (!alreadyOpen) {
      commentBtn.click();
      await delayNamed('waitForCommentBox');
    }

    // 6 — Wait for comment input
    let input: HTMLElement;
    try {
      input = await waitFor(commentInputSelector, 2000, postContainer);
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

    // 8 — Enforce minimum gap since last comment (top-up only; natural delays count toward it)
    const [minGapLo, minGapHi] = getDelayRange(5000, 10000, currentSpeedFactor);
    const minGap = addJitter(getRandomDelay(minGapLo, minGapHi));
    const elapsed = Date.now() - lastCommentedTime;
    const remaining = minGap - elapsed;
    if (lastCommentedTime > 0 && remaining > 0) {
      console.log(`⏳ Min-gap top-up: waiting ${remaining}ms (gap=${minGap}ms, elapsed=${elapsed}ms)`);
      await new Promise(r => setTimeout(r, remaining));
    }

    // 9 — Press Enter to submit
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        bubbles: true,
      }),
    );
    await delayNamed('submitPause');
    lastCommentedTime = Date.now();
    console.log('✅ Comment posted:', commentText);

    // 9 — Mark processed + close popup
    markProcessed(postEl);

    const closeBtn = document.querySelector('[aria-label="Close"]') as HTMLElement;
    if (closeBtn) {
      await delayCustom(2000, 4000);
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
 * Read the alt text of the main feed image inside a post card.
 * Facebook generates this automatically (AI/OCR) — reliable substitute for image text.
 */
export function getPostAltText(postEl: HTMLElement): string {
  let ancestor: HTMLElement | null = postEl.parentElement;
  while (ancestor && ancestor !== document.body) {
    const img = ancestor.querySelector('img[data-imgperflogname="feedImage"]') as HTMLImageElement | null;
    if (img?.alt) return img.alt.trim();
    ancestor = ancestor.parentElement;
  }
  return '';
}

/**
 * Walk up from a post element to find the comment button and its containing ancestor.
 * Returns { container, btn } or null if not found.
 */
function findCommentButtonContainer(
  postEl: HTMLElement,
): { container: HTMLElement; btn: HTMLElement } | null {
  let ancestor: HTMLElement | null = postEl.parentElement;
  while (ancestor && ancestor !== document.body) {
    const btn = ancestor.querySelector(
      '[aria-label="Leave a comment"], [aria-label="Comment"]',
    ) as HTMLElement | null;
    if (btn) return { container: ancestor, btn };
    ancestor = ancestor.parentElement;
  }
  return null;
}

/**
 * Click the comment button on a post and return the text of the first visible comment.
 * Returns empty string if no comment button or no comments found.
 */
export async function getFirstCommentText(postEl: HTMLElement): Promise<string> {
  const found = findCommentButtonContainer(postEl);
  if (!found) return '';

  found.btn.click();
  await delayNamed('waitForCommentBox');

  const { container } = found;

  // Try known Facebook comment selectors in order of specificity
  const selectors = [
    '[data-testid="UFI2Comment/root_depth_0"]',
    '[aria-label^="Comment by"]',
    '[data-commentid]',
    'ul[role="list"] > li',
    'ul > li',
  ];

  for (const sel of selectors) {
    const el = container.querySelector(sel) as HTMLElement | null;
    if (el?.innerText?.trim()) return el.innerText.trim();
  }

  return '';
}

/**
 * Walk up from postEl to the post card boundary (the ancestor that owns the action bar).
 */
function getPostCard(postEl: HTMLElement): HTMLElement | null {
  let ancestor: HTMLElement | null = postEl.parentElement;
  while (ancestor && ancestor !== document.body) {
    if (ancestor.querySelector('[data-ad-rendering-role="like_button"]')) {
      return ancestor;
    }
    ancestor = ancestor.parentElement;
  }
  return null;
}

/**
 * Detect whether the post card has a playable video (identified by the Play Video button).
 */
export function isVideoPost(postEl: HTMLElement): boolean {
  const card = getPostCard(postEl);
  return !!card?.querySelector('[aria-label="Play Video"][role="button"]');
}

/**
 * Click the Play Video button inside the post card.
 */
export function playVideo(postEl: HTMLElement): void {
  const card = getPostCard(postEl);
  const btn = card?.querySelector<HTMLElement>('[aria-label="Play Video"][role="button"]');
  btn?.click();
}

/**
 * Pause the video inside the post card.
 * Tries the Pause Video button first (aria-label changes after play starts),
 * then falls back to calling .pause() directly on the video element.
 */
export function pauseVideo(postEl: HTMLElement): void {
  const card = getPostCard(postEl);
  if (!card) return;
  const pauseBtn = card.querySelector<HTMLElement>('[aria-label="Pause Video"][role="button"]');
  if (pauseBtn) {
    pauseBtn.click();
    return;
  }
  card.querySelector<HTMLVideoElement>('video')?.pause();
}

/**
 * Open the comment section on a post and scroll through existing comments,
 * simulating a human reading before deciding to comment.
 * Uses [role="article"][aria-label^="Comment by"] count to detect new loads.
 */
export async function scrollThroughComments(postEl: HTMLElement): Promise<void> {
  const found = findCommentButtonContainer(postEl);
  if (!found) return;

  found.btn.click();
  await delayCustom(1500, 2500);

  const countComments = () =>
    document.querySelectorAll('[role="article"][aria-label^="Comment by"]').length;

  let prevCount = countComments();
  const scrolls = 2 + Math.floor(Math.random() * 3); // 2–4 scrolls

  for (let i = 0; i < scrolls; i++) {
    window.scrollBy({ top: 120 + Math.random() * 150, behavior: 'smooth' });
    await delayCustom(1200, 2500);
    const newCount = countComments();
    if (newCount > prevCount) {
      console.log(`[CEB] +${newCount - prevCount} comments loaded`);
      prevCount = newCount;
    }
  }

  console.log(`[CEB] Scrolled through ${prevCount} visible comments`);
}

/**
 * Click the share button on a post.
 * Uses the aria-label "Send this to friends or post it on your profile." to locate it.
 */
export async function shareFacebookPost(postEl: HTMLElement): Promise<boolean> {
  let ancestor: HTMLElement | null = postEl.parentElement;
  while (ancestor && ancestor !== document.body) {
    const shareBtn = ancestor.querySelector(
      '[aria-label="Send this to friends or post it on your profile."]',
    ) as HTMLElement | null;
    if (shareBtn) {
      // Pause before clicking share — simulate human hovering/moving to button
      await delayCustom(1000, 2500);
      shareBtn.click();
      console.log('[CEB] Share button clicked — waiting for dialog');
      const confirmBtn = await waitFor('[aria-label="Share now"]', 5000);
      // Dialog appeared — pause to simulate reading it before acting
      await delayCustom(1500, 3000);
      confirmBtn.click();
      console.log('[CEB] Share confirmed');
      // Wait for the share to complete and feed to update
      await delayCustom(2000, 4000);
      return true;
    }
    ancestor = ancestor.parentElement;
  }
  console.warn('[CEB] Share button not found');
  return false;
}

/**
 * Capture a post's canonical permalink by opening its Share sheet and reading
 * the URL out of the WhatsApp/X share links' href (doubly URL-encoded) — no
 * clipboard (focus/staleness immune). Returns the permalink, or null if it
 * could not be captured. Always closes the Share sheet before returning.
 */
export async function getPostPermalink(postEl: HTMLElement): Promise<string | null> {
  const TAG = '[CEB][permalink]';

  // 1. Find the Share button that belongs to THIS post.
  // Bug fixed: the old ancestor-walk did ancestor.querySelector(...), which
  // returns the first match in DOM order — always post #1's button once the
  // walk reached a container spanning multiple posts. Instead, collect every
  // Share button and pick the one whose lowest common ancestor with postEl is
  // the deepest (i.e. physically nearest this post in the tree). This is
  // correct for any feed nesting without assuming FB's card structure.
  const SHARE_SELECTOR = '[aria-label="Send this to friends or post it on your profile."]';
  const shareCandidates = Array.from(
    document.querySelectorAll(SHARE_SELECTOR),
  ) as HTMLElement[];

  // Depth of the lowest common ancestor between postEl and `el` (higher = nearer).
  const lcaDepth = (el: HTMLElement): number => {
    const aChain: HTMLElement[] = [];
    for (let n: HTMLElement | null = postEl; n; n = n.parentElement) aChain.push(n);
    let depth = -1;
    for (let n: HTMLElement | null = el; n; n = n.parentElement) {
      const idx = aChain.indexOf(n);
      if (idx !== -1) {
        // Distance of that shared ancestor from the document root.
        let d = 0;
        for (let p: HTMLElement | null = n; p; p = p.parentElement) d++;
        depth = d;
        break;
      }
    }
    return depth;
  };

  let shareBtn: HTMLElement | null = null;
  let bestDepth = -1;
  for (const cand of shareCandidates) {
    const d = lcaDepth(cand);
    if (d > bestDepth) {
      bestDepth = d;
      shareBtn = cand;
    }
  }

  if (!shareBtn) {
    console.warn(`${TAG} Share button not found — cannot capture permalink`);
    return null;
  }

  // 1a. Scroll the post card to the top of the viewport so its (bottom-edge)
  // Share button stays on-screen — the condition under which post #1 works.
  postEl.scrollIntoView({ block: 'start', behavior: 'smooth' });
  // Wait for the smooth scroll to settle before measuring / clicking.
  await delayCustom(1200, 2000);

  // 1b. Ensure the Share button is on-screen before clicking it.
  const rect = shareBtn.getBoundingClientRect();
  const inView =
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= window.innerHeight &&
    rect.right <= window.innerWidth;
  if (!inView) {
    shareBtn.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await delayCustom(800, 1400);
  }

  // Human pause before reaching for Share (scaled by speed factor).
  await delayCustom(1200, 2800);
  shareBtn.click();

  // 2. The share sheet's WhatsApp / X options carry the canonical permalink
  // doubly URL-encoded inside their l.facebook.com/l.php?u=... href. We read
  // it straight from the DOM — no clipboard (no staleness / focus gate) and
  // no "Copy link" click. Scope to the LIVE sheet: stale sheets linger with an
  // aria-hidden="true" ancestor, the active one does not.
  const isLive = (el: Element): boolean => {
    if ((el as HTMLElement).getClientRects().length === 0) return false;
    for (let n: Element | null = el; n; n = n.parentElement) {
      if (n.getAttribute('aria-hidden') === 'true') return false;
    }
    return true;
  };

  // Recursively percent-decode until stable, then pull the FB permalink.
  const extractPermalink = (href: string): string | null => {
    let s = href;
    for (let i = 0; i < 5 && /%[0-9a-fA-F]{2}/.test(s); i++) {
      try {
        s = decodeURIComponent(s);
      } catch {
        break;
      }
    }
    const m = s.match(
      /https?:\/\/(?:www\.|web\.|m\.)?facebook\.com\/(?:share\/[A-Za-z0-9/]+|[^/\s"'&?]+\/posts\/[A-Za-z0-9]+|permalink\.php\?story_fbid=[^"'&\s]+|groups\/[^/\s]+\/(?:posts|permalink)\/[0-9]+)\/?/i,
    );
    return m ? m[0] : null;
  };

  let permalink: string | null = null;
  for (let i = 0; i < 40 && !permalink; i++) {
    // Last live anchor = newest sheet, immune to a lingering older one.
    const anchors = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('a[href*="l.facebook.com/l.php"]'),
    ).filter(isLive);
    for (let j = anchors.length - 1; j >= 0; j--) {
      const found = extractPermalink(anchors[j].href);
      if (found) {
        permalink = found;
        break;
      }
    }
    if (!permalink) await delayCustom(150, 250);
  }

  if (permalink) {
    console.log(`${TAG} ✅ ${permalink}`);
  } else {
    console.warn(`${TAG} no share-sheet link yielded a permalink (sheet may not have opened)`);
  }

  // 3. Close the sheet via its Close button (the Escape dispatch on body never
  // worked — that's why stale sheets accumulated). Fall back to Escape.
  await delayCustom(800, 1600);
  const closeBtn = Array.from(
    document.querySelectorAll<HTMLElement>('[aria-label="Close"][role="button"]'),
  ).filter(isLive);
  if (closeBtn.length) {
    closeBtn[closeBtn.length - 1].click();
  } else {
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }),
    );
  }
  await delayCustom(300, 600);

  return permalink;
}

/**
 * Extract the first http/https URL from a string. Returns null if none found.
 */
export function extractFirstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s)"'>]+/);
  return match ? match[0] : null;
}

/**
 * Reset automation state (useful for re-runs).
 */
export function resetAutomation(): void {
  processedPosts.clear();
  lastScrollY = 0;
  lastCommentedTime = 0;
  document.querySelectorAll('[data-ceb-commented]').forEach(el => {
    delete (el as HTMLElement).dataset.cebCommented;
  });
}

export default {
  getFirstPostText,
  getPostImageUrls,
  postFacebookComment,
  crossThisPost,
  waitFor,
  setSpeedFactor,
  getSpeedFactor,
  getFirstCommentText,
  extractFirstUrl,
};
