import { facebookBotConfigStorage, FACEBOOK_DEFAULTS } from '@extension/storage';
import type { IApiClient, PlatformId, PlatformConfig, AuthorizeActionResult } from './types.js';

/**
 * Stub implementation — all data is read from / written to local Chrome storage.
 * Replace with a real HTTP client when the backend API is ready.
 * The IApiClient interface is the stable contract; only this file changes.
 */
export class StubApiClient implements IApiClient {
  async getConfig(platform: PlatformId): Promise<PlatformConfig> {
    if (platform === 'facebook') {
      const config = await facebookBotConfigStorage.get();
      return { facebook: config ?? FACEBOOK_DEFAULTS };
    }
    return {};
  }

  async saveConfig(platform: PlatformId, config: PlatformConfig): Promise<void> {
    if (platform === 'facebook' && config.facebook) {
      await facebookBotConfigStorage.set(config.facebook);
    }
  }

  async authorizeAction(_action: string): Promise<AuthorizeActionResult> {
    // Stub: always allowed. Backend will enforce plan limits and credit balance.
    return { allowed: true, creditsRemaining: 999 };
  }

  async logAction(_action: string, _result: 'success' | 'failure'): Promise<void> {
    // Stub: no-op. Backend will log activity and deduct credits.
  }
}

export const apiClient: IApiClient = new StubApiClient();
