/**
 * YouTube API Client Factory and Helpers
 *
 * Integrates the googleapis package for YouTube Data API v3 access.
 * Uses OAuth2 authentication with tokens stored in provider_connections.
 *
 * Required OAuth Scope: https://www.googleapis.com/auth/youtube.readonly
 *
 * See: features/subscriptions/backend-spec.md Section 2.3
 */

import type { youtube_v3 } from 'googleapis';
import { google } from 'googleapis';
import type { ProviderConnection } from '../lib/token-refresh';
import { getValidAccessToken } from '../lib/token-refresh';
import { decrypt } from '../lib/crypto';
import { parseISO8601Duration } from '../lib/duration';

// Re-export for external consumers
export { parseISO8601Duration } from '../lib/duration';

// The OAuth2Client type comes from google.auth.OAuth2 instance
type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

// ============================================================================
// Types
// ============================================================================

/**
 * YouTube client wrapper containing the API client and OAuth2 client
 */
export interface YouTubeClient {
  /** YouTube Data API v3 client */
  api: youtube_v3.Youtube;
  /** OAuth2 client for token management */
  oauth2Client: OAuth2Client;
}

/**
 * Environment bindings required for YouTube API access
 */
interface YouTubeEnv {
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
  /** Spotify credentials (required by token-refresh) */
  SPOTIFY_CLIENT_ID: string;
  SPOTIFY_CLIENT_SECRET: string;
}

// ============================================================================
// Client Factory
// ============================================================================

/**
 * Create a YouTube API client with the provided OAuth tokens
 *
 * @param accessToken - Decrypted OAuth access token
 * @param refreshToken - Decrypted OAuth refresh token
 * @param env - Environment bindings with YouTube OAuth credentials
 * @returns YouTubeClient with authenticated API access
 *
 * @example
 * ```typescript
 * const client = createYouTubeClient(accessToken, refreshToken, env);
 * const response = await client.api.channels.list({
 *   part: ['snippet'],
 *   mine: true,
 * });
 * ```
 */
export function createYouTubeClient(
  accessToken: string,
  refreshToken: string,
  env: YouTubeEnv
): YouTubeClient {
  const oauth2Client = new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.OAUTH_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  const api = google.youtube({ version: 'v3', auth: oauth2Client });

  return { api, oauth2Client };
}

/**
 * Get a YouTube client for an existing provider connection
 *
 * Handles token refresh automatically if the access token is expired.
 * This is the preferred method for getting a client in polling/ingestion code.
 *
 * @param connection - Provider connection from database
 * @param env - Environment bindings with credentials
 * @returns YouTubeClient ready for API calls
 * @throws TokenRefreshError if token refresh fails
 *
 * @example
 * ```typescript
 * const connection = await db.query.providerConnections.findFirst({
 *   where: and(
 *     eq(providerConnections.userId, userId),
 *     eq(providerConnections.provider, 'YOUTUBE')
 *   )
 * });
 *
 * const client = await getYouTubeClientForConnection(connection, env);
 * const videos = await fetchRecentVideos(client, uploadsPlaylistId);
 * ```
 */
export async function getYouTubeClientForConnection(
  connection: ProviderConnection,
  env: YouTubeEnv
): Promise<YouTubeClient> {
  // Get valid access token (refreshes if needed)
  const accessToken = await getValidAccessToken(connection, env);

  // Decrypt the refresh token for the client
  const refreshToken = await decrypt(connection.refreshToken, env.ENCRYPTION_KEY);

  return createYouTubeClient(accessToken, refreshToken, env);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the uploads playlist ID for a YouTube channel (deterministic, no API call)
 *
 * Every YouTube channel has a hidden "uploads" playlist containing all their videos.
 * The playlist ID follows a deterministic pattern: replace "UC" prefix with "UU".
 *
 * YouTube API Cost: 0 quota units (no API call needed!)
 *
 * @param channelId - YouTube channel ID (starts with UC)
 * @returns Uploads playlist ID (starts with UU)
 * @throws Error if channelId doesn't start with UC
 *
 * @example
 * ```typescript
 * const playlistId = getUploadsPlaylistId('UCxxxxxx');
 * // Returns 'UUxxxxxx'
 * ```
 */
export function getUploadsPlaylistId(channelId: string): string {
  if (!channelId.startsWith('UC')) {
    throw new Error(`Invalid YouTube channel ID: ${channelId}. Expected UC prefix.`);
  }
  return 'UU' + channelId.slice(2);
}

/**
 * Get the uploads playlist ID for a YouTube channel via legacy API signature.
 *
 * @deprecated Use getUploadsPlaylistId() instead - it's deterministic and requires no API call.
 * This wrapper now avoids the deprecated API call and uses the deterministic mapping.
 *
 * @param _client - Unused (kept for backward compatibility)
 * @param channelId - YouTube channel ID (starts with UC)
 * @returns Uploads playlist ID (starts with UU)
 * @throws Error if channelId doesn't start with UC
 */
export async function getChannelUploadsPlaylistId(
  _client: YouTubeClient,
  channelId: string
): Promise<string> {
  return getUploadsPlaylistId(channelId);
}

/**
 * Fetch recent videos from a YouTube uploads playlist
 *
 * Returns videos in upload order (newest first). Use this for polling
 * to check for new content from a channel.
 *
 * YouTube API Cost: 1 quota unit
 *
 * @param client - Authenticated YouTube client
 * @param uploadsPlaylistId - The channel's uploads playlist ID
 * @param maxResults - Maximum number of videos to fetch (default: 10, max: 50)
 * @returns Array of playlist items with video details
 *
 * @example
 * ```typescript
 * const videos = await fetchRecentVideos(client, 'UUxxxxxx', 10);
 * for (const video of videos) {
 *   console.log(video.snippet?.title, video.contentDetails?.videoId);
 * }
 * ```
 */
export async function fetchRecentVideos(
  client: YouTubeClient,
  uploadsPlaylistId: string,
  maxResults: number = 10
): Promise<youtube_v3.Schema$PlaylistItem[]> {
  const response = await client.api.playlistItems.list({
    part: ['snippet', 'contentDetails'],
    playlistId: uploadsPlaylistId,
    maxResults: Math.min(maxResults, 50), // YouTube API max is 50
  });

  return response.data.items || [];
}

/**
 * Get the authenticated user's YouTube subscriptions
 *
 * Returns channels the user has subscribed to on YouTube.
 * Useful for the "discover available" feature in the app.
 *
 * YouTube API Cost: 1 quota unit per page
 *
 * @param client - Authenticated YouTube client
 * @param maxResults - Maximum subscriptions to fetch (default: 50, max: 50)
 * @returns Array of subscription objects with channel details
 *
 * @example
 * ```typescript
 * const subs = await getUserSubscriptions(client, 50);
 * for (const sub of subs) {
 *   console.log(sub.snippet?.title, sub.snippet?.resourceId?.channelId);
 * }
 * ```
 */
export async function getUserSubscriptions(
  client: YouTubeClient,
  maxResults: number = 50
): Promise<youtube_v3.Schema$Subscription[]> {
  const response = await client.api.subscriptions.list({
    part: ['snippet'],
    mine: true,
    maxResults: Math.min(maxResults, 50), // YouTube API max is 50
  });

  return response.data.items || [];
}

/**
 * Get ALL user subscriptions with automatic pagination.
 *
 * YouTube API Cost: 1 quota unit per page (50 items per page)
 *
 * @param client - Authenticated YouTube client
 * @param maxSubscriptions - Maximum subscriptions to fetch (default: 500)
 * @returns Array of all subscriptions up to maxSubscriptions
 *
 * @example
 * ```typescript
 * const allSubs = await getAllUserSubscriptions(client, 200);
 * console.log(`Found ${allSubs.length} subscriptions`);
 * ```
 */
export async function getAllUserSubscriptions(
  client: YouTubeClient,
  maxSubscriptions: number = 500
): Promise<youtube_v3.Schema$Subscription[]> {
  const subscriptions: youtube_v3.Schema$Subscription[] = [];
  let pageToken: string | undefined;
  const pageSize = 50;

  while (subscriptions.length < maxSubscriptions) {
    const response = await client.api.subscriptions.list({
      part: ['snippet'],
      mine: true,
      maxResults: pageSize,
      pageToken,
    });

    const items = response.data.items || [];
    subscriptions.push(...items);

    if (items.length < pageSize || !response.data.nextPageToken) {
      // No more pages
      break;
    }

    pageToken = response.data.nextPageToken;
  }

  return subscriptions.slice(0, maxSubscriptions);
}

/**
 * Get channel details by channel ID
 *
 * Fetches metadata for a specific channel including name, description,
 * thumbnail, and statistics.
 *
 * YouTube API Cost: 1 quota unit
 *
 * @param client - Authenticated YouTube client
 * @param channelId - YouTube channel ID
 * @returns Channel object with details, or null if not found
 *
 * @example
 * ```typescript
 * const channel = await getChannelDetails(client, 'UCxxxxxx');
 * console.log(channel?.snippet?.title, channel?.statistics?.subscriberCount);
 * ```
 */
export async function getChannelDetails(
  client: YouTubeClient,
  channelId: string
): Promise<youtube_v3.Schema$Channel | null> {
  const response = await client.api.channels.list({
    part: ['snippet', 'statistics', 'contentDetails'],
    id: [channelId],
  });

  return response.data.items?.[0] ?? null;
}

/**
 * Search for YouTube channels by query
 *
 * WARNING: This costs 100 quota units per call! Use sparingly.
 * Consider caching results or using alternative discovery methods.
 *
 * YouTube API Cost: 100 quota units
 *
 * @param client - Authenticated YouTube client
 * @param query - Search query string
 * @param maxResults - Maximum results (default: 10, max: 50)
 * @returns Array of search results (channels only)
 *
 * @example
 * ```typescript
 * // Use sparingly due to high quota cost!
 * const results = await searchChannels(client, 'coding tutorials', 10);
 * ```
 */
export async function searchChannels(
  client: YouTubeClient,
  query: string,
  maxResults: number = 10
): Promise<youtube_v3.Schema$SearchResult[]> {
  const response = await client.api.search.list({
    part: ['snippet'],
    q: query,
    type: ['channel'],
    maxResults: Math.min(maxResults, 50),
  });

  return response.data.items || [];
}

/**
 * Extract video information from a playlist item
 *
 * Utility to safely extract common video fields from a playlist item response.
 *
 * @param item - Playlist item from YouTube API
 * @returns Normalized video info object
 */
export function extractVideoInfo(item: youtube_v3.Schema$PlaylistItem): {
  videoId: string | null;
  title: string;
  description: string;
  channelId: string | null;
  channelTitle: string;
  publishedAt: string | null;
  thumbnailUrl: string | null;
} {
  const snippet = item.snippet;
  const contentDetails = item.contentDetails;

  return {
    videoId: contentDetails?.videoId ?? null,
    title: snippet?.title ?? '',
    description: snippet?.description ?? '',
    channelId: snippet?.channelId ?? null,
    channelTitle: snippet?.channelTitle ?? '',
    publishedAt: snippet?.publishedAt ?? contentDetails?.videoPublishedAt ?? null,
    thumbnailUrl:
      snippet?.thumbnails?.high?.url ??
      snippet?.thumbnails?.medium?.url ??
      snippet?.thumbnails?.default?.url ??
      null,
  };
}

// Note: parseISO8601Duration has been moved to ../lib/duration.ts
// and is re-exported from this file for backward compatibility

/**
 * Video details returned from fetchVideoDetails.
 * Contains duration and full description (not truncated).
 */
export interface VideoDetails {
  /** Duration in seconds */
  durationSeconds: number;
  /** Full video description (from videos.list, not truncated like playlistItems) */
  description: string;
}

/**
 * Fetch video details (duration and full description) for a list of video IDs.
 * Uses videos.list API with part=contentDetails,snippet.
 *
 * IMPORTANT: The playlistItems.list API truncates descriptions to ~160 chars.
 * This function fetches the FULL description via videos.list API.
 *
 * YouTube API Cost: 1 quota unit (regardless of video count, up to 50)
 *
 * @param client - YouTube API client
 * @param videoIds - Array of video IDs to fetch (max 50 per API call)
 * @returns Map of videoId to VideoDetails. Empty map on error (graceful degradation).
 *
 * @example
 * ```typescript
 * const details = await fetchVideoDetails(client, ['abc123', 'def456']);
 * const video = details.get('abc123');
 * console.log(video?.durationSeconds); // e.g., 90
 * console.log(video?.description); // Full description text
 * ```
 */
export async function fetchVideoDetails(
  client: YouTubeClient,
  videoIds: string[]
): Promise<Map<string, VideoDetails>> {
  // Early return if no videos to fetch
  if (videoIds.length === 0) {
    return new Map();
  }

  try {
    const response = await client.api.videos.list({
      part: ['contentDetails', 'snippet'],
      id: videoIds.slice(0, 50), // API max is 50
    });

    const details = new Map<string, VideoDetails>();
    for (const video of response.data.items || []) {
      if (video.id && video.contentDetails?.duration) {
        details.set(video.id, {
          durationSeconds: parseISO8601Duration(video.contentDetails.duration),
          description: video.snippet?.description ?? '',
        });
      }
    }
    return details;
  } catch (error) {
    // Log warning but don't throw - graceful degradation
    console.warn('Failed to fetch video details:', error);
    return new Map();
  }
}

/**
 * Fetch video details for a large batch of videos across multiple subscriptions.
 *
 * This function is optimized for the polling use case where we need to fetch
 * details for videos from many channels. It automatically chunks requests
 * to stay within YouTube API limits (50 IDs per call).
 *
 * YouTube API Cost: ceil(videoIds.length / 50) quota units
 *
 * Example: 200 videos across 20 channels = 4 API calls (vs 20 without batching)
 *
 * @param client - Authenticated YouTube client
 * @param videoIds - Array of video IDs (can exceed 50)
 * @param concurrency - Max concurrent API calls (default: 3, max 6 for CF Workers)
 * @returns Map of videoId to VideoDetails. Missing videos omitted (graceful degradation).
 */
export async function fetchVideoDetailsBatched(
  client: YouTubeClient,
  videoIds: string[],
  concurrency: number = 3
): Promise<Map<string, VideoDetails>> {
  if (videoIds.length === 0) {
    return new Map();
  }

  // Chunk into groups of 50 (YouTube API limit)
  const chunks: string[][] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    chunks.push(videoIds.slice(i, i + 50));
  }

  const allDetails = new Map<string, VideoDetails>();

  // Process in waves of `concurrency` chunks
  for (let i = 0; i < chunks.length; i += concurrency) {
    const wave = chunks.slice(i, i + concurrency);
    const results = await Promise.all(
      wave.map(async (chunk) => {
        try {
          return await fetchVideoDetailsChunk(client, chunk);
        } catch (error) {
          console.warn('Failed to fetch video details chunk:', error);
          return new Map<string, VideoDetails>();
        }
      })
    );

    // Merge results
    for (const result of results) {
      for (const [id, details] of result) {
        allDetails.set(id, details);
      }
    }
  }

  return allDetails;
}

/**
 * Internal: Fetch details for a single chunk of videos (max 50).
 */
async function fetchVideoDetailsChunk(
  client: YouTubeClient,
  videoIds: string[]
): Promise<Map<string, VideoDetails>> {
  const response = await client.api.videos.list({
    part: ['contentDetails', 'snippet'],
    id: videoIds,
  });

  const details = new Map<string, VideoDetails>();
  for (const video of response.data.items || []) {
    if (video.id && video.contentDetails?.duration) {
      details.set(video.id, {
        durationSeconds: parseISO8601Duration(video.contentDetails.duration),
        description: video.snippet?.description ?? '',
      });
    }
  }
  return details;
}
