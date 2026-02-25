/**
 * Centralized delay configuration for Facebook automation.
 * Adjustable by speed factor (1-5 scale).
 */

export type SpeedFactor = 1 | 2 | 3 | 4 | 5;

/**
 * Multiplier for each speed factor:
 * - 1 (Slow): 2.0x delays (very cautious, anti-bot measures)
 * - 2 (Moderate): 1.5x delays
 * - 3 (Normal): 1.0x delays (default, balanced)
 * - 4 (Fast): 0.65x delays
 * - 5 (Very Fast): 0.4x delays (aggressive, risk of detection)
 */
export const SPEED_MULTIPLIERS: Record<SpeedFactor, number> = {
  1: 2.0,
  2: 1.5,
  3: 1.0,
  4: 0.65,
  5: 0.4,
};

/**
 * Base delay ranges (milliseconds) at normal speed (factor 3).
 * Each delay represents a min-max range for randomization.
 */
export const DELAY_RANGES = {
  /** After clicking "See more" to expand post */
  seeMoreClick: [800, 800],

  /** Think time before typing first character */
  thinkBeforeType: [100, 400],

  /** Time per keystroke character */
  keystroke: [40, 120],

  /** Occasional pause while typing mid-sentence */
  typingPause: [200, 600],

  /** Reading time when skipping a post */
  readingSkip: [2000, 5000],

  /** Pause after gentle scroll */
  scrollPause: [1000, 2000],

  /** Waiting for focus on post */
  waitForFocus: [400, 800],

  /** Waiting for view in viewport */
  waitForView: [2000, 5000],

  /** Think time before clicking comment button (20-70 seconds) */
  thinkBeforeComment: [20000, 70000],

  /** Waiting for comment box to appear after click */
  waitForCommentBox: [600, 1200],

  /** Waiting for submit button to be ready */
  waitForSubmitBtn: [300, 800],

  /** Pause after clicking submit */
  submitPause: [400, 1000],

  /** Final pause after closing popup */
  closePause: [600, 1200],

  /** Waiting for new posts to load after scroll */
  scrollLoadWait: [2000, 4000],

  /** Pause between posts (simulated reading/browsing) */
  betweenPosts: [5000, 10000],

  /** Pause after scrolling to trigger lazy-load */
  afterScroll: [1500, 3000],
};

/**
 * Calculate actual delay range based on speed factor.
 * @param baseMin minimum milliseconds at normal speed
 * @param baseMax maximum milliseconds at normal speed
 * @param speedFactor 1-5 scale
 * @returns [minMs, maxMs] adjusted by speed factor
 */
export function getDelayRange(
  baseMin: number,
  baseMax: number,
  speedFactor: SpeedFactor,
): [number, number] {
  const multiplier = SPEED_MULTIPLIERS[speedFactor];
  return [
    Math.round(baseMin * multiplier),
    Math.round(baseMax * multiplier),
  ];
}

/**
 * Get a random delay value within a range.
 * @param minMs minimum milliseconds
 * @param maxMs maximum milliseconds
 * @returns random value between min and max (inclusive)
 */
export function getRandomDelay(minMs: number, maxMs: number): number {
  return minMs + Math.random() * (maxMs - minMs);
}

/**
 * Add small random jitter (±10% of duration).
 * @param ms base milliseconds
 * @returns value with ±10% variation
 */
export function addJitter(ms: number): number {
  const jitterAmount = ms * 0.1;
  return ms + (Math.random() - 0.5) * 2 * jitterAmount;
}
