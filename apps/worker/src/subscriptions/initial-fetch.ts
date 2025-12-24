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
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { youtube_v3 } from 'googleapis';
import { Provider } from '@zine/shared';
import {
  getYouTubeClientForConnection,
  getChannelUploadsPlaylistId,
  type YouTubeClient,
} from '../providers/youtube';
import { getSpotifyClientForConnection, getLatestEpisode, getShow } from '../providers/spotify';
import { ingestItem } from '../ingestion/processor';
import { transformYouTubeVideo, transformSpotifyEpisode } from '../ingestion/transformers';
import { subscriptions } from '../db/schema';
import type { ProviderConnection } from '../lib/token-refresh';
import type { Database } from '../db';

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
  env: InitialFetchEnv
): Promise<InitialFetchResult> {
  console.log(`[initial-fetch] Starting for ${provider} channel ${providerChannelId}`);
  try {
    let itemIngested = false;

    if (provider === Provider.YOUTUBE) {
      itemIngested = await fetchInitialYouTubeItem(
        userId,
        subscriptionId,
        connection,
        providerChannelId,
        db,
        env
      );
    } else if (provider === Provider.SPOTIFY) {
      itemIngested = await fetchInitialSpotifyItem(
        userId,
        subscriptionId,
        connection,
        providerChannelId,
        db,
        env
      );
    }

    // Update subscription with initial poll timestamp
    await db
      .update(subscriptions)
      .set({
        lastPolledAt: Date.now(),
        updatedAt: Date.now(),
      })
      .where(eq(subscriptions.id, subscriptionId));

    console.log(
      `[initial-fetch] Completed for ${provider} channel ${providerChannelId}, itemIngested: ${itemIngested}`
    );
    return { itemIngested };
  } catch (error) {
    // Log but don't fail subscription creation
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[initial-fetch] Failed for subscription ${subscriptionId}:`, errorMessage);
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
  env: InitialFetchEnv
): Promise<boolean> {
  const client = await getYouTubeClientForConnection(connection, env);
  const video = await fetchLatestYouTubeVideo(client, channelId);

  if (!video) {
    console.log(`[initial-fetch] No eligible videos found for channel ${channelId}`);
    return false;
  }

  const result = await ingestItem(
    userId,
    subscriptionId,
    video,
    Provider.YOUTUBE,
    // Cast to satisfy ingestItem's generic DrizzleD1Database type
    db as unknown as DrizzleD1Database,
    transformYouTubeVideo
  );

  return result.created;
}

/**
 * Fetch the single latest eligible YouTube video from a channel
 *
 * "Latest" is defined as the first public, already-published video in the
 * uploads playlist. We fetch a few items in case some are private/scheduled.
 *
 * @param client - Authenticated YouTube client
 * @param channelId - YouTube channel ID (starts with UC)
 * @returns The latest eligible video, or null if none found
 */
async function fetchLatestYouTubeVideo(
  client: YouTubeClient,
  channelId: string
): Promise<YouTubePlaylistItem | null> {
  // Get the uploads playlist ID for this channel
  const uploadsPlaylistId = await getChannelUploadsPlaylistId(client, channelId);

  // Fetch a few recent videos (in case some are private/scheduled)
  const response = await client.api.playlistItems.list({
    part: ['snippet', 'contentDetails', 'status'],
    playlistId: uploadsPlaylistId,
    maxResults: 5, // Fetch a few in case some are private/scheduled
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

  // Return the first eligible video (newest by upload order), converting to our type
  const video = eligibleVideos[0];
  if (!video) {
    return null;
  }

  // Convert googleapis type to our simplified type (handles null vs undefined)
  return convertToYouTubePlaylistItem(video);
}

/**
 * Convert googleapis Schema$PlaylistItem to our simplified YouTubePlaylistItem type
 * This handles the null vs undefined type differences between googleapis and our internal types
 */
function convertToYouTubePlaylistItem(item: youtube_v3.Schema$PlaylistItem): YouTubePlaylistItem {
  return {
    contentDetails: item.contentDetails
      ? {
          videoId: item.contentDetails.videoId ?? undefined,
        }
      : undefined,
    snippet: item.snippet
      ? {
          title: item.snippet.title ?? undefined,
          description: item.snippet.description ?? undefined,
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
async function fetchInitialSpotifyItem(
  userId: string,
  subscriptionId: string,
  connection: ProviderConnection,
  showId: string,
  db: Database,
  env: InitialFetchEnv
): Promise<boolean> {
  console.log(`[initial-fetch] Fetching Spotify client for show ${showId}`);
  const client = await getSpotifyClientForConnection(connection, env);

  // Get the latest episode
  console.log(`[initial-fetch] Getting latest episode for show ${showId}`);
  const episode = await getLatestEpisode(client, showId);

  if (!episode) {
    console.log(`[initial-fetch] No episodes found for show ${showId}`);
    return false;
  }

  // Check if episode is already released (not scheduled)
  const releaseDate = parseSpotifyReleaseDate(episode.releaseDate);
  if (releaseDate > Date.now()) {
    console.log(`[initial-fetch] Latest episode is scheduled, skipping`);
    return false;
  }

  // Get show name for the transformer
  const show = await getShow(client, showId);

  // Transform to the format expected by transformSpotifyEpisode
  const spotifyEpisode = {
    id: episode.id,
    name: episode.name,
    description: episode.description,
    release_date: episode.releaseDate,
    duration_ms: episode.durationMs,
    external_urls: { spotify: episode.externalUrl },
    images: episode.images,
  };

  const result = await ingestItem(
    userId,
    subscriptionId,
    spotifyEpisode,
    Provider.SPOTIFY,
    // Cast to satisfy ingestItem's generic DrizzleD1Database type
    db as unknown as DrizzleD1Database,
    (ep) => transformSpotifyEpisode(ep, show.name)
  );

  return result.created;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Parse Spotify's variable date format into Unix milliseconds
 *
 * Spotify release_date can be:
 * - YYYY (just year) → normalizes to YYYY-01-01
 * - YYYY-MM (year-month) → normalizes to YYYY-MM-01
 * - YYYY-MM-DD (full date) → used as-is
 */
function parseSpotifyReleaseDate(dateStr: string): number {
  // Normalize to YYYY-MM-DD format
  const normalized =
    dateStr.length === 4
      ? `${dateStr}-01-01` // YYYY → YYYY-01-01
      : dateStr.length === 7
        ? `${dateStr}-01` // YYYY-MM → YYYY-MM-01
        : dateStr; // YYYY-MM-DD → unchanged

  return new Date(`${normalized}T00:00:00Z`).getTime();
}
