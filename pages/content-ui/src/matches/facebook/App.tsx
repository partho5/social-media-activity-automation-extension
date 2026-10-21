import {
  createFacebookLLMClient,
  buildFacebookPostActionTemplate,
  buildFacebookPromptVariables,
  type FacebookPostAction,
} from '@extension/llm';
import { botLogger } from '@extension/shared';

function parseEngagementCount(text: string | undefined | null): number {
  if (!text) return 0;
  const t = text.trim().replace(/,/g, '');
  if (t.endsWith('K')) return Math.round(parseFloat(t) * 1000);
  if (t.endsWith('M')) return Math.round(parseFloat(t) * 1_000_000);
  return parseInt(t) || 0;
}

function findPostCard(postEl: HTMLElement): HTMLElement {
  // postEl is story_message or feedImage — walk up to the ancestor that owns the action bar.
  let card: HTMLElement = postEl;
  while (card.parentElement && card.parentElement !== document.body) {
    card = card.parentElement as HTMLElement;
    if (card.querySelector('[data-ad-rendering-role="like_button"]')) break;
  }
  return card;
}

function getPostEngagement(postEl: HTMLElement): { reactions: number; comments: number } {
  const card = findPostCard(postEl);
  const getCount = (ariaLabel: string) => {
    const btn = card.querySelector(`[aria-label="${ariaLabel}"]`);
    return parseEngagementCount(btn?.querySelector('span[dir="auto"]')?.textContent);
  };
  // aria-label flips to "Unlike" when the account has already liked the post
  const reactions = getCount('Like') || getCount('Unlike');
  const comments = getCount('Leave a comment');
  return { reactions, comments };
}

/** Returns true only if a Like button was actually found and clicked. */
function likePost(postEl: HTMLElement): boolean {
  const card = findPostCard(postEl);
  const likeBtn = card.querySelector<HTMLElement>('[aria-label="Like"][role="button"]');
  if (likeBtn) {
    likeBtn.click();
    console.log('[Bot] Liked post');
    return true;
  }
  return false;
}
import {
  facebookBotConfigStorage,
  commentRateTrackerStorage,
  activityStatsStorage,
  savedLeadsStorage,
  type CommentRateTracker,
  type ActivityStats,
  type SavedLead,
} from '@extension/storage';
import { apiClient } from '@extension/api-client';
import { DELAY_RANGES, getDelayRange, getRandomDelay, addJitter } from '@extension/env';
import { useEffect, useState, useRef } from 'react';

function hourKey(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}T${String(n.getHours()).padStart(2, '0')}`;
}

function dayKey(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

async function loadFreshTracker(): Promise<CommentRateTracker> {
  const t = await commentRateTrackerStorage.get();
  const hk = hourKey();
  const dk = dayKey();
  return {
    hourKey: hk,
    hourCount: t.hourKey === hk ? t.hourCount : 0,
    dayKey: dk,
    dayCount: t.dayKey === dk ? t.dayCount : 0,
  };
}

async function incrementTracker(tracker: CommentRateTracker): Promise<CommentRateTracker> {
  const updated: CommentRateTracker = {
    ...tracker,
    hourCount: tracker.hourCount + 1,
    dayCount: tracker.dayCount + 1,
  };
  await commentRateTrackerStorage.set(updated);
  return updated;
}

async function loadFreshActivity(): Promise<ActivityStats> {
  const s = await activityStatsStorage.get();
  const dk = dayKey();
  if (s.dayKey === dk) return s;
  return { dayKey: dk, likesDay: 0, sharesDay: 0 };
}

/** Increment ONLY the given action's tally. A like never bumps shares, etc. */
async function incrementActivity(kind: 'like' | 'share'): Promise<ActivityStats> {
  const s = await loadFreshActivity();
  const updated: ActivityStats = {
    ...s,
    likesDay: s.likesDay + (kind === 'like' ? 1 : 0),
    sharesDay: s.sharesDay + (kind === 'share' ? 1 : 0),
  };
  await activityStatsStorage.set(updated);
  return updated;
}

interface WindowFbAutomate {
  resetAutomation?: () => void;
  getAllPosts: () => HTMLElement[];
  getNextPost: () => HTMLElement | null;
  getPostImageUrls: (post: HTMLElement) => string[];
  postComment: (post: HTMLElement, text: string) => Promise<void>;
  skipPost: (post: HTMLElement) => Promise<void>;
  getFirstCommentText: (post: HTMLElement) => Promise<string>;
  extractFirstUrl: (text: string) => string | null;
  getPostAltText: (post: HTMLElement) => string;
  isVideoPost: (post: HTMLElement) => boolean;
  playVideo: (post: HTMLElement) => void;
  pauseVideo: (post: HTMLElement) => void;
  scrollComments: (post: HTMLElement) => Promise<void>;
  sharePost: (post: HTMLElement) => Promise<boolean>;
  getPostPermalink: (post: HTMLElement) => Promise<string | null>;
}

export default function App() {
  const [isRunning, setIsRunning] = useState(false);
  const [isFacebook, setIsFacebook] = useState(false);
  const [status, setStatus] = useState('Ready');
  const [displayCounts, setDisplayCounts] = useState({ hourCount: 0, dayCount: 0 });
  const [activityCounts, setActivityCounts] = useState({ likesDay: 0, sharesDay: 0 });
const shouldStopRef = useRef(false);
  // Kept fresh every render so the auto-start effect can call the latest version.
  const handleStartRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    const fbDomain = window.location.hostname.includes('facebook.com');
    setIsFacebook(fbDomain);
  }, []);

  // Load persisted comment counts on mount (resets stale hour/day keys automatically).
  useEffect(() => {
    loadFreshTracker().then(t => setDisplayCounts({ hourCount: t.hourCount, dayCount: t.dayCount }));
    loadFreshActivity().then(s => setActivityCounts({ likesDay: s.likesDay, sharesDay: s.sharesDay }));
  }, []);

  // Auto-start when the bot itself triggered the reload via sessionStorage flag.
  // Fires only after isFacebook becomes true (i.e. after the domain check above).
  useEffect(() => {
    if (!isFacebook) return;
    if (sessionStorage.getItem('ceb-bot-reload') !== 'true') return;
    sessionStorage.removeItem('ceb-bot-reload');
    // 5-second grace period for Facebook feed to render before starting.
    const timer = setTimeout(() => handleStartRef.current?.(), 5000);
    return () => clearTimeout(timer);
  }, [isFacebook]);

if (!isFacebook) return null;

  /**
   * Interruptible delay with configurable range and speed factor.
   * Returns true if interrupted (stop was clicked), false if completed.
   */
  const interruptibleDelay = async (
    baseMinMs: number,
    baseMaxMs: number,
    speedFactor: 1 | 2 | 3 | 4 | 5 = 3,
  ): Promise<boolean> => {
    const [adjustedMin, adjustedMax] = getDelayRange(baseMinMs, baseMaxMs, speedFactor);
    const duration = getRandomDelay(adjustedMin, adjustedMax);
    const jitteredDuration = addJitter(duration);
    let elapsed = 0;
    while (elapsed < jitteredDuration && !shouldStopRef.current) {
      await new Promise(r => setTimeout(r, Math.min(500, jitteredDuration - elapsed)));
      elapsed += 500;
    }
    return shouldStopRef.current;
  };

  const handleStart = async () => {
    setIsRunning(true);
    shouldStopRef.current = false;
    setStatus('Starting automation...');

    try {
      const fb = (window as unknown as Record<string, WindowFbAutomate>).fbAutomate;
      if (!fb) {
        setStatus('Automation functions not available');
        setIsRunning(false);
        return;
      }

      // Read bot configuration and initialize LLM
      let botConfig;
      let llm;
      try {
        botConfig = await facebookBotConfigStorage.get();
        llm = createFacebookLLMClient();
      } catch (err) {
        setStatus(`Error: ${(err as Error).message}`);
        setIsRunning(false);
        return;
      }

      // Prompt structure is fully code-owned. User only supplies the simple hints
      // (persona, topic, language, tone, styles, engageWhen, skipWhen).
      const postActionTemplate = buildFacebookPostActionTemplate(botConfig);

      // Set speed factor in facebook-utils (must match WindowFbAutomate interface)
      const fbWithSetSpeed = fb as unknown as Record<string, unknown>;
      if (typeof fbWithSetSpeed.setSpeedFactor === 'function') {
        (fbWithSetSpeed.setSpeedFactor as (factor: 1 | 2 | 3 | 4 | 5) => void)(botConfig.speedFactor);
      }

      // Reset state from any previous run
      fb.resetAutomation?.();
      await botLogger.log('INFO', 'Bot started', { speedFactor: botConfig.speedFactor });

      let totalCommented = 0;
      let totalSkipped = 0;
      let consecutiveEmpty = 0;
      let rateTracker = await loadFreshTracker();
      let exitStatus: string | null = null; // null = normal completion
      let postCount = 0;
      let nextBreakAt = 8 + Math.floor(Math.random() * 13); // random 8–20 posts

      while (!shouldStopRef.current) {
        // ── Find the next unprocessed post ──────────────────────────
        const post: HTMLElement | null = fb.getNextPost();

        if (!post) {
          consecutiveEmpty++;

          if (consecutiveEmpty <= 4) {
            // Keep scrolling, waiting for new posts to appear
            setStatus(`Scrolling for more posts... (${consecutiveEmpty}/5)`);
            window.scrollBy(0, window.innerHeight * 0.8);
            if (await interruptibleDelay(2000, 5000, botConfig.speedFactor)) break;
          } else if (consecutiveEmpty === 5) {
            // Last attempt: jump to page bottom and wait longer for lazy-load
            setStatus('Waiting for feed to load...');
            window.scrollTo(0, document.body.scrollHeight);
            if (await interruptibleDelay(12000, 18000, botConfig.speedFactor)) break;
          } else {
            // Still nothing — reload the page; auto-start will resume after reload
            setStatus('Reloading feed...');
            await botLogger.log('WARN', 'No posts found — reloading feed', { consecutiveEmpty });
            sessionStorage.setItem('ceb-bot-reload', 'true');
            await new Promise(r => setTimeout(r, 800));
            location.reload();
            return;
          }
          continue;
        }

        // Found a post – reset empty counter
        consecutiveEmpty = 0;

        // Scan-only = hunting for leads but configured to take no actions.
        const scanOnly = botConfig.hungryLeadFinder && !botConfig.commentWhileHunting;

        const eng = getPostEngagement(post);
        // Like only 1 in 4 posts when no threshold is set; otherwise require 60% of threshold.
        const shouldLike = botConfig.minReactions === 0
          ? (Math.floor(Math.random() * 4) + 1 === 1)
          : (eng.reactions >= botConfig.minReactions * 0.6);

        // ── Engagement threshold guard (before LLM — no side effects) ──
        // Hunting bypasses all pre-filters so no potential lead is missed.
        if (!botConfig.hungryLeadFinder && (botConfig.minReactions > 0 || botConfig.minComments > 0)) {
          console.log(`[Bot] Engagement — reactions: ${eng.reactions} (min ${botConfig.minReactions}), comments: ${eng.comments} (min ${botConfig.minComments})`);
          if (eng.reactions < botConfig.minReactions || eng.comments < botConfig.minComments) {
            totalSkipped++;
            setStatus(`Post ${totalSkipped}: skipped — reactions ${eng.reactions}, comments ${eng.comments}`);
            await botLogger.log('INFO', 'Post skipped — below engagement threshold', {
              reactions: eng.reactions,
              comments: eng.comments,
              minReactions: botConfig.minReactions,
              minComments: botConfig.minComments,
            });
            // Skipped posts are purely skipped — no like.
            await fb.skipPost(post);
            continue;
          }
        }

        // ── LLM DECISION POINT ──────────────────────────────────────
        // Use LLM to decide whether to comment, and if so, generate the comment text
        let postContent = post.innerText?.trim().substring(0, 600) || '';
        console.log(`[Bot] Post innerText: "${postContent.substring(0, 100) || '(empty)'}"`);

        // Fallback context (image alt text / first-comment link) is kept below but
        // disabled: posts with no text are now skipped instead of inferred from context.
        const USE_FALLBACK_CONTEXT = false;

        if (!postContent && !USE_FALLBACK_CONTEXT) {
          console.log('[Bot] Post has no text — skipping post');
          await fb.skipPost(post);
          continue;
        }

        if (!postContent && USE_FALLBACK_CONTEXT) {
          const altText = fb.getPostAltText(post);
          console.log(`[Bot] Alt text from feedImage: “${altText.substring(0, 200) || '(none)'}”`);
          if (altText) {
            postContent = `[Alt text of the post image]: ${altText.substring(0, 560)}`;
            console.log('[Bot] Using image alt text as post content');
          }
        }

        if (!postContent && USE_FALLBACK_CONTEXT) {
          console.log('[Bot] No innerText, no alt text — checking first comment for link...');
          setStatus('Checking first comment for link...');
          const firstCommentText = await fb.getFirstCommentText(post);
          console.log(`[Bot] First comment text: "${firstCommentText.substring(0, 200) || '(none)'}"`);
          const linkUrl = fb.extractFirstUrl(firstCommentText);
          console.log(`[Bot] Extracted URL from comment: ${linkUrl ?? '(none)'}`);

          if (!linkUrl) {
            console.log('[Bot] No text, no alt, no comment link — skipping post');
            await fb.skipPost(post);
            continue;
          }

          setStatus('Fetching linked page content...');
          try {
            const resp = await chrome.runtime.sendMessage({ type: 'FETCH_LINK_TEXT', url: linkUrl });
            console.log(`[Bot] Fetched link content: "${(resp?.text ?? '').substring(0, 200) || '(empty)'}"`);
            if (resp?.text) {
              postContent = resp.text;
            } else {
              console.log('[Bot] No content from linked page — skipping');
              await fb.skipPost(post);
              continue;
            }
          } catch (err) {
            console.warn('[Bot] Failed to fetch link content:', err);
            await fb.skipPost(post);
            continue;
          }
        }

        setStatus('Asking LLM...');

        let action: FacebookPostAction;
        try {
          action = await llm.runTemplate<FacebookPostAction>(
            postActionTemplate,
            buildFacebookPromptVariables(botConfig, postContent),
          );
        } catch (err) {
          console.error('LLM error, skipping post:', err);
          const errObj = err as Error;
          await botLogger.log('ERROR', 'LLM call failed — skipping post', {
            error: errObj.message ?? String(err),
            name: errObj.name,
            stack: errObj.stack,
            cause: errObj.cause != null ? String(errObj.cause) : undefined,
          });
          setStatus('LLM error, skipping post');
          await fb.skipPost(post);
          continue;
        }

        console.log(
          `[Bot] LLM action — skip: ${action.skip} | relevanceScore: ${action.relevanceScore}`,
        );
        await botLogger.log('DECISION', action.skip ? 'LLM decided: skip' : 'LLM decided: comment', {
          relevanceScore: action.relevanceScore,
          postSnippet: postContent.substring(0, 80),
          ...(action.skip && (action as { reason?: string }).reason
            ? { skipReason: (action as { reason?: string }).reason }
            : {}),
        });

        // ── Hungry Lead Finder: capture + save the post link if it qualifies ──
        if (
          botConfig.hungryLeadFinder &&
          action.leadConfidence != null &&
          action.leadConfidence * 100 >= botConfig.leadConfidenceThreshold
        ) {
          setStatus(`Lead found (${Math.round(action.leadConfidence * 100)}%) — capturing link...`);
          try {
            const url = await fb.getPostPermalink(post);
            if (url) {
              const existing = await savedLeadsStorage.get();
              if (!existing.some(l => l.url === url)) {
                const lead: SavedLead = {
                  url,
                  confidence: action.leadConfidence,
                  snippet: postContent.substring(0, 200),
                  reason: action.leadReason ?? '',
                  savedAt: Date.now(),
                };
                await savedLeadsStorage.set([lead, ...existing]);
                await botLogger.log('INFO', 'Lead saved', {
                  url,
                  confidence: action.leadConfidence,
                  reason: lead.reason,
                });
              }
            } else {
              await botLogger.log('WARN', 'Lead matched but permalink capture failed', {
                confidence: action.leadConfidence,
              });
            }
          } catch (err) {
            console.warn('[lead] permalink capture threw:', err);
          }
        }

        if (!scanOnly && !action.skip && action.comment) {
          // Refresh tracker so window resets are picked up mid-session
          rateTracker = await loadFreshTracker();

          if (botConfig.maxCommentsPerHour > 0 && rateTracker.hourCount >= botConfig.maxCommentsPerHour) {
            exitStatus = `Hourly limit reached (${rateTracker.hourCount}/${botConfig.maxCommentsPerHour}) — stopped`;
            await botLogger.log('WARN', 'Hourly comment limit reached — stopping', {
              hourCount: rateTracker.hourCount,
              maxCommentsPerHour: botConfig.maxCommentsPerHour,
            });
            break;
          }
          if (botConfig.maxCommentsPerDay > 0 && rateTracker.dayCount >= botConfig.maxCommentsPerDay) {
            exitStatus = `Daily limit reached (${rateTracker.dayCount}/${botConfig.maxCommentsPerDay}) — stopped`;
            await botLogger.log('WARN', 'Daily comment limit reached — stopping', {
              dayCount: rateTracker.dayCount,
              maxCommentsPerDay: botConfig.maxCommentsPerDay,
            });
            break;
          }

          // Check with backend before acting — enforces plan limits and credit balance.
          const auth = await apiClient.authorizeAction('facebook.comment');
          if (!auth.allowed) {
            await botLogger.log('WARN', 'Action not allowed by backend — stopping', {
              error: auth.reason ?? 'insufficient credits',
            });
            setStatus(`Action not allowed: ${auth.reason ?? 'insufficient credits'}`);
            break;
          }

          // Watch video if post contains one and relevance is sufficient.
          if (fb.isVideoPost(post) && action.relevanceScore >= 0.5) {
            setStatus(`Post ${totalCommented + 1}: watching video...`);
            fb.playVideo(post);
            const stopped = await interruptibleDelay(60_000, 300_000, botConfig.speedFactor);
            fb.pauseVideo(post);
            if (stopped) break;
          }

          // Sometimes read existing comments before typing (simulates human curiosity).
          if (Math.random() < 0.4) {
            setStatus(`Post ${totalCommented + 1}: reading comments...`);
            try {
              await fb.scrollComments(post);
            } catch { /* non-fatal */ }
          }

          totalCommented++;
          setStatus(`Post ${totalCommented}: commenting...`);
          try {
            await fb.postComment(post, action.comment);
            rateTracker = await incrementTracker(rateTracker);
            setDisplayCounts({ hourCount: rateTracker.hourCount, dayCount: rateTracker.dayCount });
            setStatus(`Post ${totalCommented}: commented`);
            await botLogger.log('INFO', 'Comment posted', {
              totalCommented,
              hourCount: rateTracker.hourCount,
              dayCount: rateTracker.dayCount,
            });
            await apiClient.logAction('facebook.comment', 'success');
            // Like AFTER comment is fully submitted — never while input is focused.
            if (shouldLike) {
              setStatus(`Post ${totalCommented}: liking...`);
              if (await interruptibleDelay(800, 2000, botConfig.speedFactor)) break;
              if (likePost(post)) {
                const a = await incrementActivity('like');
                setActivityCounts({ likesDay: a.likesDay, sharesDay: a.sharesDay });
              }
              if (await interruptibleDelay(500, 1000, botConfig.speedFactor)) break;
            }
            // Share highly relevant posts.
            if (action.relevanceScore >= 0.8) {
              // Natural pause between commenting and sharing
              if (await interruptibleDelay(2000, 5000, botConfig.speedFactor)) break;
              setStatus(`Post ${totalCommented}: sharing...`);
              try {
                if (await fb.sharePost(post)) {
                  const a = await incrementActivity('share');
                  setActivityCounts({ likesDay: a.likesDay, sharesDay: a.sharesDay });
                }
              } catch (err) {
                console.warn('Share failed:', err);
              }
            }
            // Extra cool-down after a real comment to reduce detection risk.
            if (await interruptibleDelay(3000, 6000, botConfig.speedFactor)) break;
          } catch (err) {
            console.error(`Failed on post ${totalCommented}:`, err);
            await botLogger.log('ERROR', 'Failed to post comment', { error: (err as Error).message, totalCommented });
            setStatus(`Post ${totalCommented}: failed, skipping`);
            await apiClient.logAction('facebook.comment', 'failure');
          }
        } else {
          totalSkipped++;
          setStatus(
            scanOnly
              ? `Scan-only: lead check done (${totalSkipped})`
              : `Post ${totalSkipped}: skipped — relevance ${action.relevanceScore.toFixed(2)}`,
          );
          await botLogger.log('INFO', scanOnly ? 'Scan-only — no action taken' : 'Post skipped — LLM relevance too low', {
            relevanceScore: action.relevanceScore,
            totalSkipped,
            postSnippet: postContent.substring(0, 80),
          });
          // Skipped posts are purely skipped — no like, no other action.
          try {
            await fb.skipPost(post);
          } catch (err) {
            console.error(`Error skipping post:`, err);
          }
        }

        // ── Natural pause between posts (5-10 seconds) ──────────────
        setStatus('Browsing...');
        if (await interruptibleDelay(5000, 10000, botConfig.speedFactor)) break;

        // ── Small scroll down to trigger lazy-loading ────────────────
        window.scrollBy(0, 200 + Math.random() * 300);
        if (await interruptibleDelay(1500, 3000, botConfig.speedFactor)) break;

        // ── Occasional long break to avoid bot detection ─────────────
        postCount++;
        if (postCount >= nextBreakAt) {
          setStatus('Taking a break...');
          if (await interruptibleDelay(3 * 60_000, 10 * 60_000, botConfig.speedFactor)) break;
          postCount = 0;
          nextBreakAt = 8 + Math.floor(Math.random() * 13);
        }
      }

      if (shouldStopRef.current) {
        await botLogger.log('INFO', 'Bot stopped by user', { totalCommented, totalSkipped });
        // handleStop already set "⛔ Stopped" — don't overwrite
      } else {
        const finalStatus = exitStatus ?? `Done. Commented: ${totalCommented}, Skipped: ${totalSkipped}`;
        await botLogger.log('INFO', 'Bot finished', { totalCommented, totalSkipped });
        setStatus(finalStatus);
      }
      setIsRunning(false);
    } catch (error) {
      console.error('Automation error:', error);
      await botLogger.log('ERROR', 'Automation crashed', { error: (error as Error).message });
      setStatus('Error: ' + (error as Error).message);
      setIsRunning(false);
    }
  };

  // Keep ref pointing at latest handleStart so the auto-start effect can call it.
  handleStartRef.current = handleStart;

  const handleStop = () => {
    shouldStopRef.current = true;
    setIsRunning(false);
    setStatus('Stopped');
    console.log('[Bot] Facebook automation stopped by user');
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: '100px',
        right: '20px',
        zIndex: 9999,
        backgroundColor: '#1f2937',
        color: 'white',
        padding: '16px',
        borderRadius: '12px',
        fontSize: '13px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
        minWidth: '280px',
        maxWidth: '320px',
      }}>
      <div style={{ marginBottom: '10px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '6px',
          }}>
          <div style={{ fontWeight: '600', fontSize: '13px' }}>Facebook Bot</div>
          <div
            style={{
              fontSize: '11px',
              padding: '2px 6px',
              borderRadius: '3px',
              backgroundColor: isRunning ? '#10b981' : '#6b7280',
            }}>
            {isRunning ? 'ACTIVE' : 'INACTIVE'}
          </div>
        </div>
        <div
          style={{
            fontSize: '12px',
            color: '#d1d5db',
            paddingBottom: '8px',
          }}>
          {status}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '6px',
            padding: '8px 0',
            borderTop: '1px solid #374151',
            borderBottom: '1px solid #374151',
            marginBottom: '2px',
          }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: '700', color: '#60a5fa', lineHeight: 1 }}>
              {displayCounts.hourCount}
            </div>
            <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '3px' }}>comments / hour</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: '700', color: '#34d399', lineHeight: 1 }}>
              {displayCounts.dayCount}
            </div>
            <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '3px' }}>comments / today</div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '6px',
            padding: '8px 0',
            borderBottom: '1px solid #374151',
            marginBottom: '2px',
          }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: '700', color: '#f472b6', lineHeight: 1 }}>
              {activityCounts.likesDay}
            </div>
            <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '3px' }}>likes / today</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: '700', color: '#fbbf24', lineHeight: 1 }}>
              {activityCounts.sharesDay}
            </div>
            <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '3px' }}>shares / today</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={isRunning ? handleStop : handleStart}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: isRunning ? '#dc2626' : '#3b82f6',
            color: 'white',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: '600',
            transition: 'all 0.2s',
          }}
          onMouseOver={e => {
            e.currentTarget.style.opacity = '0.8';
          }}
          onFocus={e => {
            e.currentTarget.style.opacity = '0.8';
          }}
          onMouseOut={e => {
            e.currentTarget.style.opacity = '1';
          }}
          onBlur={e => {
            e.currentTarget.style.opacity = '1';
          }}>
          {isRunning ? 'Stop' : 'Start'}
        </button>
      </div>
    </div>
  );
}
