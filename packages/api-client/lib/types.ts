import type { FacebookBotConfig } from '@extension/storage';

// ─── Platform config shapes ───────────────────────────────────────────────────

export type PlatformId = 'facebook' | 'linkedin' | 'twitter' | 'instagram';

export interface PlatformConfig {
  facebook?: FacebookBotConfig;
  // future: linkedin?: LinkedInBotConfig;
  // future: twitter?: TwitterBotConfig;
  // future: instagram?: InstagramBotConfig;
}

// ─── User / subscription shapes ──────────────────────────────────────────────

export type Plan = 'free' | 'pro' | 'enterprise';

export interface AppUser {
  clerkId: string;
  email: string;
  plan: Plan;
  credits: number;
  /** Credits deducted per action. Controlled by backend. */
  creditsPerAction: Record<string, number>;
}

// ─── Action authorization ─────────────────────────────────────────────────────

export interface AuthorizeActionResult {
  allowed: boolean;
  /** Remaining credits after this action would be deducted. */
  creditsRemaining: number;
  /** Reason why action was denied, if allowed === false. */
  reason?: string;
}

// ─── API client interface ─────────────────────────────────────────────────────

export interface IApiClient {
  /**
   * Load platform config for the authenticated user.
   * Falls back to local storage defaults when backend is unavailable (stub mode).
   */
  getConfig(platform: PlatformId): Promise<PlatformConfig>;

  /**
   * Persist platform config for the authenticated user.
   * Stub: writes to local extension storage only.
   */
  saveConfig(platform: PlatformId, config: PlatformConfig): Promise<void>;

  /**
   * Check whether the user is allowed to perform an action.
   * Called before executing each bot action.
   * Stub: always returns allowed=true with credits=999.
   */
  authorizeAction(action: string): Promise<AuthorizeActionResult>;

  /**
   * Log a completed action for activity tracking and credit deduction.
   * Called only on success.
   * Stub: no-op.
   */
  logAction(action: string, result: 'success' | 'failure'): Promise<void>;
}
