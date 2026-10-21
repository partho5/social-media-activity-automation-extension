import { createStorage, StorageEnum } from '../../base/index.js';

export type SpeedFactor = 1 | 2 | 3 | 4 | 5;

export type CommentStyle =
  | 'supportive'
  | 'curious'
  | 'analytical'
  | 'critical'
  | 'humorous'
  | 'empathetic'
  | 'skeptical'
  | 'informative'
  | 'inspirational'
  | 'conversational'
  | 'provocative'
  | 'sarcastic'
  | 'neutral'
  | 'personal'
  | 'enthusiastic';

export const ALL_STYLES: CommentStyle[] = [
  'supportive',
  'curious',
  'analytical',
  'critical',
  'humorous',
  'empathetic',
  'skeptical',
  'informative',
  'inspirational',
  'conversational',
  'provocative',
  'sarcastic',
  'neutral',
  'personal',
  'enthusiastic',
];

export interface FacebookBotConfig {
  persona: string;
  language: string;
  tone: string;
  topic: string;
  styles: CommentStyle[];
  engageWhen: string;
  skipWhen: string;
  speedFactor: SpeedFactor;
  maxCommentsPerHour: number;
  maxCommentsPerDay: number;
  minReactions: number;
  minComments: number;
  hungryLeadFinder: boolean;
  commentWhileHunting: boolean;
  leadCriteria: string;
  leadConfidenceThreshold: number;
}

export interface SavedLead {
  url: string;
  confidence: number;
  snippet: string;
  reason: string;
  savedAt: number;
}

export interface CommentRateTracker {
  hourKey: string;
  hourCount: number;
  dayKey: string;
  dayCount: number;
}

/**
 * Per-action activity tallies for the on-page panel. Each action increments
 * ONLY its own field — likes never touch shares and vice-versa. Windowed by
 * day so the panel can show "today" totals; resets when the day key rolls.
 */
export interface ActivityStats {
  dayKey: string;
  likesDay: number;
  sharesDay: number;
}

export const FACEBOOK_DEFAULTS: FacebookBotConfig = {
  persona:
    'a thoughtful Bangladeshi news commentator who reads each post and responds in the register that fits the moment',
  language: 'Bangla',
  tone: 'context-driven — let the post decide the register',
  topic:
    'Bengali news — politics, economy, geopolitics, disasters, science, sports, religion, or world affairs',
  styles: [...ALL_STYLES],
  engageWhen:
    'There is any newsworthy signal — a headline (even a few words), an event with a date, a news agency or channel name, a domain like prothomalo.com or dbcnews.tv, a political figure, disaster, election, war, or world event. Image alt text from news graphics counts even when sponsor brand names appear alongside the headline.',
  skipWhen:
    'The post is clearly and entirely one of: a purely personal status or selfie caption; a standalone motivational or religious quote with no news anchor; a product advertisement or giveaway with no news context; entertainment or celebrity gossip with no hard-news event attached.',
  speedFactor: 3,
  maxCommentsPerHour: 15,
  maxCommentsPerDay: 80,
  minReactions: 0,
  minComments: 0,
  hungryLeadFinder: false,
  commentWhileHunting: true,
  leadCriteria:
    'The post indicates someone actively looking for a product, service, recommendation, or hiring — a buying or hiring intent signal.',
  leadConfidenceThreshold: 70,
};

export const facebookBotConfigStorage = createStorage<FacebookBotConfig>(
  'facebook-config',
  FACEBOOK_DEFAULTS,
  {
    storageEnum: StorageEnum.Local,
    liveUpdate: true,
  },
);

const RATE_TRACKER_DEFAULTS: CommentRateTracker = {
  hourKey: '',
  hourCount: 0,
  dayKey: '',
  dayCount: 0,
};

export const commentRateTrackerStorage = createStorage<CommentRateTracker>(
  'facebook-comment-rate',
  RATE_TRACKER_DEFAULTS,
  {
    storageEnum: StorageEnum.Local,
    liveUpdate: false,
  },
);

const ACTIVITY_STATS_DEFAULTS: ActivityStats = {
  dayKey: '',
  likesDay: 0,
  sharesDay: 0,
};

export const activityStatsStorage = createStorage<ActivityStats>(
  'facebook-activity-stats',
  ACTIVITY_STATS_DEFAULTS,
  {
    storageEnum: StorageEnum.Local,
    liveUpdate: false,
  },
);

export const savedLeadsStorage = createStorage<SavedLead[]>(
  'facebook-saved-leads',
  [],
  {
    storageEnum: StorageEnum.Local,
    liveUpdate: true,
  },
);
