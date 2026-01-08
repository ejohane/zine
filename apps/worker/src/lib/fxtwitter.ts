/**
 * FxTwitter API Client
 *
 * Provides a typed client for the FxTwitter API to fetch full tweet data.
 * FxTwitter is a free, no-auth API that provides complete tweet information
 * including full text, media, engagement metrics, and more.
 *
 * Why FxTwitter over Twitter's oEmbed?
 * - Full tweet text (not truncated to 140 chars)
 * - Thumbnail/image URLs included
 * - Engagement metrics (likes, retweets, replies, views)
 * - Media attachments (photos, videos)
 * - Poll data
 * - Quote tweets
 *
 * @example
 * ```typescript
 * import { fetchFxTwitterByUrl } from './lib/fxtwitter';
 *
 * const result = await fetchFxTwitterByUrl('https://x.com/elonmusk/status/1234567890');
 * if (result?.tweet) {
 *   console.log(result.tweet.text);
 *   console.log(result.tweet.author.name);
 * }
 * ```
 */

import { logger } from './logger';

// ============================================================================
// Types
// ============================================================================

/**
 * Poll choice in a Twitter poll
 */
export interface FxTwitterPollChoice {
  /** Display label for the choice */
  label: string;
  /** Number of votes for this choice */
  count: number;
  /** Percentage of total votes (0-100) */
  percentage: number;
}

/**
 * Poll attached to a tweet
 */
export interface FxTwitterPoll {
  /** Array of poll choices */
  choices: FxTwitterPollChoice[];
  /** Total number of votes across all choices */
  total_votes: number;
  /** ISO timestamp when the poll ends */
  ends_at: string;
}

/**
 * Photo attachment
 */
export interface FxTwitterPhoto {
  /** Direct URL to the image */
  url: string;
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** Alt text for accessibility (optional) */
  altText?: string;
}

/**
 * Video attachment
 */
export interface FxTwitterVideo {
  /** Direct URL to the video file */
  url: string;
  /** URL to video thumbnail image */
  thumbnail_url: string;
  /** Video width in pixels */
  width: number;
  /** Video height in pixels */
  height: number;
  /** Duration in seconds */
  duration: number;
  /** Video format (e.g., "video/mp4") */
  format?: string;
}

/**
 * Media attachments on a tweet
 */
export interface FxTwitterMedia {
  /** Array of photo attachments */
  photos?: FxTwitterPhoto[];
  /** Array of video attachments */
  videos?: FxTwitterVideo[];
}

/**
 * Tweet author information
 */
export interface FxTwitterAuthor {
  /** Display name (e.g., "Elon Musk") */
  name: string;
  /** Twitter handle without @ (e.g., "elonmusk") */
  screen_name: string;
  /** URL to profile avatar image */
  avatar_url: string;
  /** URL to profile banner image (optional) */
  banner_url?: string;
  /** Whether the account is verified (optional) */
  verified?: boolean;
  /** Twitter user ID (optional) */
  id?: string;
}

/**
 * Full tweet data from FxTwitter
 */
export interface FxTwitterTweet {
  /** Tweet ID */
  id: string;
  /** Canonical URL to the tweet */
  url: string;
  /** Full tweet text */
  text: string;
  /** ISO timestamp when the tweet was created */
  created_at: string;
  /** Unix timestamp (seconds) when the tweet was created */
  created_timestamp: number;
  /** Tweet author information */
  author: FxTwitterAuthor;
  /** Number of likes */
  likes: number;
  /** Number of retweets */
  retweets: number;
  /** Number of replies */
  replies: number;
  /** Number of views (impressions) */
  views: number;
  /** Language code (e.g., "en") */
  lang: string;
  /** Client used to post the tweet (e.g., "Twitter Web App") */
  source: string;
  /** Media attachments (optional) */
  media?: FxTwitterMedia;
  /** Poll data (optional) */
  poll?: FxTwitterPoll;
  /** Quoted tweet (optional) */
  quote?: FxTwitterTweet;
}

/**
 * FxTwitter API response
 */
export interface FxTwitterResponse {
  /** Response code (200 for success) */
  code: number;
  /** Response message */
  message: string;
  /** Tweet data (present on success) */
  tweet?: FxTwitterTweet;
}

/**
 * Parsed Twitter URL components
 */
export interface ParsedTwitterUrl {
  /** Twitter username */
  username: string;
  /** Tweet ID */
  tweetId: string;
}

// ============================================================================
// Constants
// ============================================================================

/** FxTwitter API base URL */
export const FXTWITTER_API_BASE = 'https://api.fxtwitter.com';

/** Request timeout in milliseconds (10s for Worker environment reliability) */
const FETCH_TIMEOUT_MS = 10000;

/** Regex pattern for Twitter/X URLs */
const TWITTER_URL_PATTERN =
  /^https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/([^/]+)\/status\/(\d+)/i;

// ============================================================================
// Logger
// ============================================================================

const fxTwitterLogger = logger.child('fxtwitter');

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Make a fetch request with timeout using AbortController
 */
async function fetchWithTimeout(
  url: string,
  timeoutMs: number = FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================================
// URL Parsing
// ============================================================================

/**
 * Parse a Twitter/X URL to extract username and tweet ID
 *
 * Supports both twitter.com and x.com URLs.
 *
 * @param url - Full Twitter/X URL (e.g., https://x.com/user/status/123)
 * @returns Parsed components, or null if URL doesn't match expected pattern
 *
 * @example
 * ```typescript
 * const parsed = parseTwitterUrl('https://x.com/elonmusk/status/1234567890');
 * if (parsed) {
 *   console.log(parsed.username); // "elonmusk"
 *   console.log(parsed.tweetId); // "1234567890"
 * }
 * ```
 */
export function parseTwitterUrl(url: string): ParsedTwitterUrl | null {
  const match = url.match(TWITTER_URL_PATTERN);

  if (!match || !match[1] || !match[2]) {
    return null;
  }

  return {
    username: match[1],
    tweetId: match[2],
  };
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Fetch tweet data from FxTwitter API
 *
 * @param username - Twitter username (without @)
 * @param tweetId - Tweet ID
 * @returns FxTwitterResponse with tweet data, or null on failure
 *
 * @example
 * ```typescript
 * const result = await fetchFxTwitter('elonmusk', '1234567890');
 * if (result?.tweet) {
 *   console.log(result.tweet.text);
 * }
 * ```
 */
export async function fetchFxTwitter(
  username: string,
  tweetId: string
): Promise<FxTwitterResponse | null> {
  const apiUrl = `${FXTWITTER_API_BASE}/${encodeURIComponent(username)}/status/${encodeURIComponent(tweetId)}`;

  try {
    const response = await fetchWithTimeout(apiUrl);

    if (!response.ok) {
      fxTwitterLogger.warn('FxTwitter API request failed', {
        status: response.status,
        username,
        tweetId,
      });
      return null;
    }

    const data = (await response.json()) as FxTwitterResponse;

    // Check for API-level errors
    if (data.code !== 200) {
      fxTwitterLogger.warn('FxTwitter API returned error', {
        code: data.code,
        message: data.message,
        username,
        tweetId,
      });
      return null;
    }

    fxTwitterLogger.debug('FxTwitter API request successful', {
      username,
      tweetId,
      hasMedia: !!data.tweet?.media,
      hasPoll: !!data.tweet?.poll,
      hasQuote: !!data.tweet?.quote,
    });

    return data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      fxTwitterLogger.warn('FxTwitter API request timed out', {
        username,
        tweetId,
        timeoutMs: FETCH_TIMEOUT_MS,
        apiUrl,
      });
    } else {
      fxTwitterLogger.error('FxTwitter API request error', {
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.name : typeof error,
        username,
        tweetId,
        apiUrl,
      });
    }
    return null;
  }
}

/**
 * Fetch tweet data from FxTwitter API using a Twitter/X URL
 *
 * Convenience function that parses the URL and fetches the tweet data.
 *
 * @param url - Full Twitter/X URL (e.g., https://x.com/user/status/123)
 * @returns FxTwitterResponse with tweet data, or null on failure
 *
 * @example
 * ```typescript
 * const result = await fetchFxTwitterByUrl('https://x.com/elonmusk/status/1234567890');
 * if (result?.tweet) {
 *   console.log(result.tweet.text);
 *   console.log(result.tweet.author.name);
 *   console.log(result.tweet.likes);
 * }
 * ```
 */
export async function fetchFxTwitterByUrl(url: string): Promise<FxTwitterResponse | null> {
  const parsed = parseTwitterUrl(url);

  if (!parsed) {
    fxTwitterLogger.warn('Invalid Twitter URL format', { url });
    return null;
  }

  return fetchFxTwitter(parsed.username, parsed.tweetId);
}
