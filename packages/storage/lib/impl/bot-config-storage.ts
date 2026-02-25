import { createStorage, StorageEnum } from '../base/index.js';

/** Speed factor for automation (1=slow, 5=fast). */
export type SpeedFactor = 1 | 2 | 3 | 4 | 5;

export interface BotConfig {
  /** Who the bot presents as. Passed as {{persona}} in prompts. */
  persona: string;
  /** Language to write comments in. Passed as {{language}} in prompts. */
  language: string;
  /** Tone for generated comments. Passed as {{tone}} in prompts. */
  tone: string;
  /**
   * Topic filter for relevance check. Empty string = skip the relevance-check
   * step entirely and engage with all posts.
   */
  topic: string;
  /** Automation speed factor (1=slow/cautious, 5=fast/aggressive). Controls delay ranges. */
  speedFactor: SpeedFactor;
}

export const botConfigStorage = createStorage<BotConfig>(
  'bot-config',
  {
    persona: 'a friendly and curious person',
    language: 'English',
    tone: 'friendly',
    topic: 'only about life',
    speedFactor: 3,
  },
  {
    storageEnum: StorageEnum.Local,
    liveUpdate: true,
  },
);
