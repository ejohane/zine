/**
 * Initial Fetch for New Subscriptions
 *
 * When a user subscribes to a channel/show, we fetch ONLY the single latest item
 * to avoid flooding their inbox with historical content. This provides a "welcome"
 * item without spending excessive API quota on old content.
 *
 * Key behaviors:
 * - Fetches only the latest public/released item
 * - Filters out scheduled/private YouTube videos
 * - Uses the ingestion pipeline for idempotency
 * - Updates lastPolledAt after fetch
 * - Errors don't fail subscription creation (async, fire-and-forget)
 *
 * @see /features/subscriptions/backend-spec.md - Section 4.4: Initial Fetch Semantics
 */

import { eq } from 'drizzle-orm';
import type { youtube_v3 } from 'googleapis';
import { Provider, YOUTUBE_SHORTS_MAX_DURATION_SECONDS } from '@zine/shared';
import {
  getYouTubeClientForConnection,
  getUploadsPlaylistId,
  fetchVideoDetails,
  type YouTubeClient,
} from '../providers/youtube';
import {
  getSpotifyClientForConnection,
  getLatestEpisode,
  getShow,
  getLargestImage,
} from '../providers/spotify';
import { ingestItem } from '../ingestion/processor';
import { transformYouTubeVideo, transformSpotifyEpisode } from '../ingestion/transformers';
import { subscriptions } from '../db/schema';
import type { ProviderConnection } from '../lib/token-refresh';
import type { Database } from '../db';
import { logger } from '../lib/logger';
import { parseSpotifyDate } from '../lib/timestamps';

const fetchLogger = logger.child('initial-fetch');

// ============================================================================
// Types
// ============================================================================

/**
 * Result of initial fetch operation
 */
export interface InitialFetchResult {
  /** Whether a new item was ingested */
  itemIngested: boolean;
  /** Error message if fetch failed */
  error?: string;
}

/**
 * Environment bindings required for initial fetch
 * Combines all required env vars for YouTube and Spotify operations
 */
export interface InitialFetchEnv {
  /** D1 database for token storage */
  DB: D1Database;
  /** KV namespace for OAuth state and locking */
  OAUTH_STATE_KV: KVNamespace;
  /** AES-256 encryption key for token decryption */
  ENCRYPTION_KEY: string;
  /** Google OAuth client ID (for YouTube) */
  GOOGLE_CLIENT_ID: string;
  /** Google OAuth client secret (for YouTube) - optional for PKCE flows */
  GOOGLE_CLIENT_SECRET?: string;
  /** OAuth redirect URI */
  OAUTH_REDIRECT_URI?: string;
  /** Spotify OAuth client ID */
  SPOTIFY_CLIENT_ID: string;
  /** Spotify OAuth client secret */
  SPOTIFY_CLIENT_SECRET: string;
}

/**
 * YouTube Playlist Item structure matching transformer expectations
 * Simplified from googleapis Schema$PlaylistItem to avoid null vs undefined issues
 */
interface YouTubePlaylistItem {
  contentDetails?: {
    videoId?: string;
  };
  snippet?: {
    title?: string;
    description?: string;
    channelTitle?: string;
    channelId?: string;
    publishedAt?: string;
    thumbnails?: {
      high?: { url?: string };
      default?: { url?: string };
    };
  };
  status?: {
    privacyStatus?: string;
  };
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Trigger initial content fetch for a newly created subscription
 *
 * Fetches the single latest item from the channel/show and ingests it
 * into the user's inbox. This provides a "welcome" item without flooding
 * the inbox with historical content.
 *
 * IMPORTANT: This function is designed to be called with waitUntil() and
 * should NOT throw errors - failures are logged but don't block subscription creation.
 *
 * @param userId - Clerk user ID
 * @param subscriptionId - ID of the newly created subscription
 * @param connection - Provider connection with OAuth tokens
 * @param provider - Provider type (YOUTUBE or SPOTIFY)
 * @param providerChannelId - YouTube channel ID or Spotify show ID
 * @param db - Drizzle database instance
 * @param env - Environment bindings with OAuth credentials
 * @returns Result indicating whether an item was ingested
 *
 * @example
 * ```typescript
 * // In subscriptions router add mutation:
 * ctx.executionContext?.waitUntil(
 *   triggerInitialFetch(ctx.userId, subscriptionId, connection, provider, channelId, ctx.db, ctx.env)
 * );
 * ```
 */
export async function triggerInitialFetch(
  userId: string,
  subscriptionId: string,
  connection: ProviderConnection,
  provider: Provider,
  providerChannelId: string,
  db: Database,
  env: InitialFetchEnv,
  subscriptionImageUrl?: string
): Promise<InitialFetchResult> {
  fetchLogger.info('Starting', { provider, providerChannelId });
  try {
    let itemIngested = false;
    let lastPublishedAt: number | null = null;
    let totalItems: number | null = null;

    if (provider === Provider.YOUTUBE) {
      itemIngested = await fetchInitialYouTubeItem(
        userId,
        subscriptionId,
        connection,
        providerChannelId,
        db,
        env,
        subscriptionImageUrl
      );
    } else if (provider === Provider.SPOTIFY) {
      const result = await fetchInitialSpotifyItem(
        userId,
        subscriptionId,
        connection,
        providerChannelId,
        db,
        env,
        subscriptionImageUrl
      );
      itemIngested = result.created;
      lastPublishedAt = result.releaseDate;
      totalItems = result.totalEpisodes;
    }

    // Update subscription with initial poll timestamp and metadata
    // Setting lastPublishedAt and totalItems here prevents the delta detection bug
    // where totalItems gets set without lastPublishedAt, causing future episodes to be missed
    await db
      .update(subscriptions)
      .set({
        lastPolledAt: Date.now(),
        ...(lastPublishedAt && { lastPublishedAt }),
        ...(totalItems !== null && { totalItems }),
        updatedAt: Date.now(),
      })
      .where(eq(subscriptions.id, subscriptionId));

    fetchLogger.info('Completed', {
      provider,
      providerChannelId,
      itemIngested,
      lastPublishedAt: lastPublishedAt ? new Date(lastPublishedAt).toISOString() : null,
      totalItems,
    });
    return { itemIngested };
  } catch (error) {
    // Log but don't fail subscription creation
    const errorMessage = error instanceof Error ? error.message : String(error);
    fetchLogger.error('Failed', { subscriptionId, error: errorMessage });
    return { itemIngested: false, error: errorMessage };
  }
}

// ============================================================================
// YouTube Initial Fetch
// ============================================================================

/**
 * Fetch the latest YouTube video for initial subscription
 */
async function fetchInitialYouTubeItem(
  userId: string,
  subscriptionId: string,
  connection: ProviderConnection,
  channelId: string,
  db: Database,
  env: InitialFetchEnv,
  channelImageUrl?: string
): Promise<boolean> {
  const client = await getYouTubeClientForConnection(connection, env);
  const video = await fetchLatestYouTubeVideo(client, channelId);

  if (!video) {
    fetchLogger.info('No eligible videos found', { channelId });
    return false;
  }

  const result = await ingestItem(
    userId,
    subscriptionId,
    video,
    Provider.YOUTUBE,
    // Cast to Database type for ingestItem
    db as Database,
    (v) => transformYouTubeVideo(v, channelImageUrl)
  );

  return result.created;
}

/**
 * Fetch the single latest eligible YouTube video from a channel
 *
 * "Latest" is defined as the first public, already-published, non-Short video
 * in the uploads playlist. We fetch several items in case some are private,
 * scheduled, or Shorts.
 *
 * @param client - Authenticated YouTube client
 * @param channelId - YouTube channel ID (starts with UC)
 * @returns The latest eligible video, or null if none found
 */
async function fetchLatestYouTubeVideo(
  client: YouTubeClient,
  channelId: string
): Promise<YouTubePlaylistItem | null> {
  // Get the uploads playlist ID for this channel (deterministic, no API call)
  const uploadsPlaylistId = getUploadsPlaylistId(channelId);

  // Fetch more recent videos to account for private/scheduled/Shorts filtering
  const response = await client.api.playlistItems.list({
    part: ['snippet', 'contentDetails', 'status'],
    playlistId: uploadsPlaylistId,
    maxResults: 10, // Fetch more to find a non-Short
  });

  const now = Date.now();

  // Filter to only public, already-published videos
  const eligibleVideos =
    response.data.items?.filter((video) => {
      // Check privacy status
      const status = video.status?.privacyStatus;
      if (status !== 'public') {
        return false;
      }

      // Check publish date (skip scheduled content)
      const publishedAt = video.snippet?.publishedAt
        ? new Date(video.snippet.publishedAt).getTime()
        : 0;

      return publishedAt <= now;
    }) || [];

  if (eligibleVideos.length === 0) {
    return null;
  }

  // Fetch video details (duration + full description) to filter out Shorts
  // Note: playlistItems.list truncates descriptions to ~160 chars, videos.list gives full description
  const videoIds = eligibleVideos
    .map((v) => v.contentDetails?.videoId)
    .filter((id): id is string => !!id);

  const videoDetails = await fetchVideoDetails(client, videoIds);

  // Find the first non-Short video (newest by upload order)
  for (const video of eligibleVideos) {
    const videoId = video.contentDetails?.videoId;
    if (!videoId) continue;

    const details = videoDetails.get(videoId);
    const duration = details?.durationSeconds;

    // If duration fetch failed, include the video (graceful degradation)
    // Otherwise, only include if it's longer than the Shorts threshold
    if (duration === undefined || duration > YOUTUBE_SHORTS_MAX_DURATION_SECONDS) {
      fetchLogger.debug('Selected non-Short video', {
        videoId,
        duration,
        title: video.snippet?.title,
      });
      // Pass the full description from videos.list API
      return convertToYouTubePlaylistItem(video, details?.description);
    }

    fetchLogger.debug('Skipping Short', {
      videoId,
      duration,
      title: video.snippet?.title,
    });
  }

  // All videos were Shorts
  fetchLogger.info('All eligible videos were Shorts', { channelId, count: eligibleVideos.length });
  return null;
}

/**
 * Convert googleapis Schema$PlaylistItem to our simplified YouTubePlaylistItem type
 * This handles the null vs undefined type differences between googleapis and our internal types
 *
 * @param item - The playlist item from YouTube API
 * @param fullDescription - Optional full description from videos.list API (playlistItems truncates to ~160 chars)
 */
function convertToYouTubePlaylistItem(
  item: youtube_v3.Schema$PlaylistItem,
  fullDescription?: string
): YouTubePlaylistItem {
  return {
    contentDetails: item.contentDetails
      ? {
          videoId: item.contentDetails.videoId ?? undefined,
        }
      : undefined,
    snippet: item.snippet
      ? {
          title: item.snippet.title ?? undefined,
          // Use full description from videos.list if provided, otherwise fall back to truncated one
          description: fullDescription ?? item.snippet.description ?? undefined,
          channelTitle: item.snippet.channelTitle ?? undefined,
          channelId: item.snippet.channelId ?? undefined,
          publishedAt: item.snippet.publishedAt ?? undefined,
          thumbnails: item.snippet.thumbnails
            ? {
                high: item.snippet.thumbnails.high
                  ? { url: item.snippet.thumbnails.high.url ?? undefined }
                  : undefined,
                default: item.snippet.thumbnails.default
                  ? { url: item.snippet.thumbnails.default.url ?? undefined }
                  : undefined,
              }
            : undefined,
        }
      : undefined,
    status: item.status
      ? {
          privacyStatus: item.status.privacyStatus ?? undefined,
        }
      : undefined,
  };
}

// ============================================================================
// Spotify Initial Fetch
// ============================================================================

/**
 * Fetch the latest Spotify episode for initial subscription
 */
/**
 * Result of initial Spotify fetch with metadata for subscription update
 */
interface SpotifyFetchResult {
  created: boolean;
  releaseDate: number | null;
  totalEpisodes: number | null;
}

async function fetchInitialSpotifyItem(
  userId: string,
  subscriptionId: string,
  connection: ProviderConnection,
  showId: string,
  db: Database,
  env: InitialFetchEnv,
  subscriptionImageUrl?: string
): Promise<SpotifyFetchResult> {
  fetchLogger.debug('Fetching Spotify client', { showId });
  const client = await getSpotifyClientForConnection(connection, env);

  // Get show details (includes totalEpisodes for delta detection)
  const show = await getShow(client, showId);

  // Get the latest episode
  fetchLogger.debug('Getting latest episode', { showId });
  const episode = await getLatestEpisode(client, showId);

  if (!episode) {
    fetchLogger.info('No episodes found for show', { showId });
    // Still return totalEpisodes so we can set it for future delta detection
    return { created: false, releaseDate: null, totalEpisodes: show.totalEpisodes };
  }

  // Check if episode is already released (not scheduled)
  const releaseDate = parseSpotifyDate(episode.releaseDate);
  if (releaseDate > Date.now()) {
    fetchLogger.info('Latest episode is scheduled, skipping', { showId });
    return { created: false, releaseDate: null, totalEpisodes: show.totalEpisodes };
  }

  // Transform to the format expected by transformSpotifyEpisode
  // CRITICAL: Include show metadata for creator extraction (extractSpotifyCreator expects rawItem.show)
  const showImageUrl = getLargestImage(show.images) ?? subscriptionImageUrl;
  const spotifyEpisode = {
    id: episode.id,
    name: episode.name,
    description: episode.description,
    release_date: episode.releaseDate,
    duration_ms: episode.durationMs,
    external_urls: { spotify: episode.externalUrl },
    images: episode.images,
    // Show metadata for creator extraction
    show: {
      id: showId,
      name: show.name,
      images: showImageUrl ? [{ url: showImageUrl }] : [],
    },
  };

  const result = await ingestItem(
    userId,
    subscriptionId,
    spotifyEpisode,
    Provider.SPOTIFY,
    // Cast to Database type for ingestItem
    db as Database,
    (ep) => transformSpotifyEpisode(ep, show.name, showImageUrl)
  );

  return {
    created: result.created,
    releaseDate: result.created ? releaseDate : null,
    totalEpisodes: show.totalEpisodes,
  };
}
