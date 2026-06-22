import { DAY_MS, HOUR_MS } from "@/utils.js";

/** How far back to fetch tweets before excluding already-scored posts. */
export const SOCIAL_MEDIA_FETCH_WINDOW_MS = 4 * HOUR_MS;

/** How long scored tweets remain available for trade prompts and reports. */
export const SOCIAL_MEDIA_RETENTION_MS = DAY_MS * 30;

/** Minimum relevance score (1–10) included in prompts and Telegram. */
export const SOCIAL_MEDIA_MIN_RELEVANCE_SCORE = 4;

/** Top tweets from the rolling window for the trade recommendation prompt. */
export const SOCIAL_MEDIA_PROMPT_TOP_COUNT = 10;

/** Top tweets from the last hour for the Telegram run report. */
export const SOCIAL_MEDIA_REPORT_TOP_COUNT = 3;

/** Posts per LLM relevance-scoring batch (sequential). */
export const SOCIAL_MEDIA_SCORE_BATCH_SIZE = 20;

export const SOCIAL_MEDIA_SCORING_PROMPT_VERSION = "v1";
