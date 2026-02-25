import { createFacebookLLMClient, FacebookPrompts, type FacebookCommentDecision } from '@extension/llm';
import { botConfigStorage } from '@extension/storage';
import { DELAY_RANGES, getDelayRange, getRandomDelay, addJitter } from '@extension/env';
import { useEffect, useState, useRef } from 'react';

interface WindowFbAutomate {
  resetAutomation?: () => void;
  getAllPosts: () => HTMLElement[];
  postComment: (post: HTMLElement, text: string) => Promise<void>;
  skipPost: (post: HTMLElement) => Promise<void>;
}

export default function App() {
  const [isRunning, setIsRunning] = useState(false);
  const [isFacebook, setIsFacebook] = useState(false);
  const [status, setStatus] = useState('Ready');
  const shouldStopRef = useRef(false);

  useEffect(() => {
    const fbDomain = window.location.hostname.includes('facebook.com');
    setIsFacebook(fbDomain);
  }, []);

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
    console.log('🤖 Facebook automation started');

    try {
      const fb = (window as unknown as Record<string, WindowFbAutomate>).fbAutomate;
      if (!fb) {
        setStatus('❌ Automation functions not available');
        setIsRunning(false);
        return;
      }

      // Read bot configuration and initialize LLM
      let botConfig;
      let llm;
      try {
        botConfig = await botConfigStorage.get();
        llm = createFacebookLLMClient();
      } catch (err) {
        setStatus(`❌ Error: ${(err as Error).message}`);
        setIsRunning(false);
        return;
      }

      // Set speed factor in facebook-utils (must match WindowFbAutomate interface)
      const fbWithSetSpeed = fb as unknown as Record<string, unknown>;
      if (typeof fbWithSetSpeed.setSpeedFactor === 'function') {
        (fbWithSetSpeed.setSpeedFactor as (factor: 1 | 2 | 3 | 4 | 5) => void)(botConfig.speedFactor);
      }

      // Reset state from any previous run
      fb.resetAutomation?.();

      let totalCommented = 0;
      let totalSkipped = 0;
      let consecutiveEmpty = 0; // track how many times in a row we find no posts

      while (!shouldStopRef.current) {
        // ── Find the next unprocessed post ──────────────────────────
        const post: HTMLElement | null = fb.getNextPost();

        if (!post) {
          consecutiveEmpty++;

          // After 3 empty tries, give up
          if (consecutiveEmpty >= 3) {
            setStatus('📭 No more posts found – done!');
            break;
          }

          // Scroll down a bit and wait for new posts to load
          setStatus('📜 Scrolling for more posts...');
          window.scrollBy(0, window.innerHeight * 0.7);
          if (await interruptibleDelay(2000, 4000, botConfig.speedFactor)) break;
          continue;
        }

        // Found a post – reset empty counter
        consecutiveEmpty = 0;

        // ── LLM DECISION POINT ──────────────────────────────────────
        // Use LLM to decide whether to comment, and if so, generate the comment text
        const postContent = post.innerText?.trim().substring(0, 600) || '';
        setStatus(`🤖 Asking LLM...`);

        let decision: FacebookCommentDecision;
        try {
          decision = await llm.run<FacebookCommentDecision>(
            FacebookPrompts.commentDecision.id,
            {
              postContent,
              persona: botConfig.persona,
              language: botConfig.language,
            },
          );
        } catch (err) {
          console.error('LLM error, skipping post:', err);
          setStatus(`⚠️ LLM error, skipping post`);
          await fb.skipPost(post);
          continue;
        }

        console.log(
          `🤖 LLM decision — shouldComment: ${decision.shouldComment} | reason: ${decision.reason}`,
        );

        if (decision.shouldComment && decision.comment) {
          totalCommented++;
          setStatus(`💬 Post ${totalCommented}: commenting...`);
          try {
            await fb.postComment(post, decision.comment);
            setStatus(`✅ Post ${totalCommented}: commented`);
          } catch (err) {
            console.error(`Failed on post ${totalCommented}:`, err);
            setStatus(`⚠️ Post ${totalCommented}: failed, skipping`);
          }
        } else {
          totalSkipped++;
          setStatus(`⊘ Post ${totalSkipped}: skipped — ${decision.reason}`);
          try {
            await fb.skipPost(post);
          } catch (err) {
            console.error(`Error skipping post:`, err);
          }
        }

        // ── Natural pause between posts (5-10 seconds) ──────────────
        setStatus(`⏳ Browsing...`);
        if (await interruptibleDelay(5000, 10000, botConfig.speedFactor)) break;

        // ── Small scroll down to trigger lazy-loading ────────────────
        window.scrollBy(0, 200 + Math.random() * 300);
        if (await interruptibleDelay(1500, 3000, botConfig.speedFactor)) break;
      }

      setStatus(`✅ Done! Commented: ${totalCommented}, Skipped: ${totalSkipped}`);
      setIsRunning(false);
    } catch (error) {
      console.error('Automation error:', error);
      setStatus('❌ Error: ' + (error as Error).message);
      setIsRunning(false);
    }
  };

  const handleStop = () => {
    shouldStopRef.current = true;
    setIsRunning(false);
    setStatus('⛔ Stopped');
    console.log('⛔ Facebook automation stopped');
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
          <div style={{ fontWeight: '600', fontSize: '13px' }}>🤖 Facebook Bot</div>
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
            borderBottom: '1px solid #374151',
          }}>
          {status}
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
          {isRunning ? '⛔ Stop' : '▶️ Start'}
        </button>
      </div>
    </div>
  );
}
