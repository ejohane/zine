/**
 * Spotify Client Factory and API Helpers
 *
 * Provides integration with @spotify/web-api-ts-sdk for accessing
 * user-specific Spotify data (saved shows, episodes, etc.).
 *
 * CRITICAL: The SDK's Client Credentials flow can ONLY access PUBLIC Spotify data.
 * For user-specific endpoints (saved shows, etc.), we MUST use the user's stored
 * OAuth tokens from `provider_connections`.
 *
 * Required OAuth Scope: `user-library-read`
 *
 * See: features/subscriptions/backend-spec.md Section 2.4
 */

import { SpotifyApi } from '@spotify/web-api-ts-sdk';
import type {
  SimplifiedShow,
  SimplifiedEpisode,
  Show,
  Episode,
  AccessToken,
  Market,
} from '@spotify/web-api-ts-sdk';
import {
  getValidAccessToken,
  type ProviderConnection,
  type TokenRefreshEnv,
} from '../lib/token-refresh';

// ============================================================================
// Types
// ============================================================================

/**
 * Cached show metadata stored in KV.
 * Contains show metadata that rarely changes, with totalEpisodes for delta detection.
 */
export interface CachedShowMetadata {
  id: string;
  name: string;
  description: string;
  publisher: string;
  images: { url: string; height: number; width: number }[];
  externalUrl: string;
  totalEpisodes: number;
  cachedAt: number;
}

/**
 * Cache configuration for show metadata
 */
export const SHOW_CACHE_CONFIG = {
  /** TTL for cached show metadata (6 hours in seconds) */
  TTL_SECONDS: 6 * 60 * 60,
  /** Key prefix for show metadata in KV */
  KEY_PREFIX: 'spotify:show:',
} as const;

/**
 * Result of a cache lookup operation with hit/miss metrics
 */
export interface CacheResult<T> {
  data: T;
  cacheHits: number;
  cacheMisses: number;
}

/**
 * Simplified Spotify show type for our use cases
 */
export interface SpotifyShow {
  id: string;
  name: string;
  description: string;
  publisher: string;
  images: { url: string; height: number; width: number }[];
  externalUrl: string;
  totalEpisodes: number;
}

/**
 * Simplified Spotify episode type for our use cases
 */
export interface SpotifyEpisode {
  id: string;
  name: string;
  description: string;
  releaseDate: string;
  durationMs: number;
  externalUrl: string;
  images: { url: string; height: number; width: number }[];
  isPlayable: boolean;
  /** Show name (podcast name) - only available from full episode endpoint */
  showName?: string;
  /** Show publisher - only available from full episode endpoint */
  showPublisher?: string;
  /** Show image URL (podcast image) - only available from full episode endpoint */
  showImageUrl?: string;
}

/**
 * Environment bindings required for Spotify client.
 * Extends TokenRefreshEnv to ensure all required fields are present.
 */
type SpotifyEnv = TokenRefreshEnv;

// ============================================================================
// Client Factory
// ============================================================================

/**
 * Create a Spotify API client with a user's access token.
 *
 * We handle token refresh externally via token-refresh.ts, so we provide
 * a minimal AccessToken object to the SDK. The SDK won't have our refresh
 * token - we manage expiry and refresh ourselves before creating the client.
 *
 * @param accessToken - Decrypted user access token
 * @param env - Environment bindings (needs SPOTIFY_CLIENT_ID)
 * @returns SpotifyApi client instance
 *
 * @example
 * ```typescript
 * const accessToken = await getValidAccessToken(connection, env);
 * const client = createSpotifyClient(accessToken, env);
 * const shows = await getUserSavedShows(client);
 * ```
 */
export function createSpotifyClient(accessToken: string, env: SpotifyEnv): SpotifyApi {
  if (!env.SPOTIFY_CLIENT_ID) {
    throw new Error('SPOTIFY_CLIENT_ID is not configured');
  }

  // Create a minimal AccessToken object for the SDK
  // We handle refresh externally via token-refresh.ts, so:
  // - expires_in is nominal (SDK uses this for internal caching)
  // - refresh_token is empty (we don't give SDK our refresh token)
  const token: AccessToken = {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 3600, // Nominal - we manage expiry externally
    refresh_token: '', // We don't give SDK our refresh token
  };

  return SpotifyApi.withAccessToken(env.SPOTIFY_CLIENT_ID, token);
}

/**
 * Convenience wrapper for getting a Spotify client from a provider connection.
 *
 * Handles token refresh automatically if the token is expired or about to expire.
 *
 * @param connection - Provider connection from database
 * @param env - Environment bindings
 * @returns SpotifyApi client instance with a valid access token
 *
 * @example
 * ```typescript
 * const connection = await db.query.providerConnections.findFirst({
 *   where: and(eq(providerConnections.userId, userId), eq(providerConnections.provider, 'SPOTIFY'))
 * });
 *
 * const client = await getSpotifyClientForConnection(connection, env);
 * const shows = await getUserSavedShows(client);
 * ```
 */
export async function getSpotifyClientForConnection(
  connection: ProviderConnection,
  env: SpotifyEnv
): Promise<SpotifyApi> {
  // getValidAccessToken handles proactive refresh (5 min buffer)
  const accessToken = await getValidAccessToken(connection, env);
  return createSpotifyClient(accessToken, env);
}

// ============================================================================
// API Helpers
// ============================================================================

/**
 * Get user's saved shows (podcasts).
 *
 * Requires the `user-library-read` OAuth scope.
 *
 * @param client - Authenticated SpotifyApi client
 * @param limit - Maximum number of shows to return (default: 50, max: 50)
 * @param offset - Offset for pagination (default: 0)
 * @returns Array of simplified show objects
 *
 * @example
 * ```typescript
 * const client = await getSpotifyClientForConnection(connection, env);
 * const shows = await getUserSavedShows(client);
 * console.log(shows.map(s => s.name));
 * ```
 */
export async function getUserSavedShows(
  client: SpotifyApi,
  limit: number = 50,
  offset: number = 0
): Promise<SpotifyShow[]> {
  const response = await client.currentUser.shows.savedShows(
    Math.min(limit, 50) as 1, // SDK uses MaxInt type, we cast to satisfy it
    offset
  );

  // Filter out null items (can occur when shows are unavailable or removed)
  return response.items
    .filter(
      (item): item is { show: SimplifiedShow; added_at: string } =>
        item !== null && item.show !== null
    )
    .map((item) => transformShow(item.show));
}

/**
 * Get all saved shows with automatic pagination.
 *
 * Fetches all pages of saved shows for users with many subscriptions.
 *
 * @param client - Authenticated SpotifyApi client
 * @param maxShows - Maximum total shows to fetch (default: 500)
 * @returns Array of all saved shows
 */
export async function getAllUserSavedShows(
  client: SpotifyApi,
  maxShows: number = 500
): Promise<SpotifyShow[]> {
  const shows: SpotifyShow[] = [];
  let offset = 0;
  const pageSize = 50;

  while (shows.length < maxShows) {
    const page = await getUserSavedShows(client, pageSize, offset);
    shows.push(...page);

    if (page.length < pageSize) {
      // No more pages
      break;
    }

    offset += pageSize;
  }

  return shows.slice(0, maxShows);
}

/**
 * Get episodes for a specific show.
 *
 * @param client - Authenticated SpotifyApi client
 * @param showId - Spotify show ID (22 alphanumeric characters)
 * @param limit - Maximum number of episodes to return (default: 10, max: 50)
 * @param offset - Offset for pagination (default: 0)
 * @returns Array of simplified episode objects
 *
 * @example
 * ```typescript
 * const client = await getSpotifyClientForConnection(connection, env);
 * const episodes = await getShowEpisodes(client, '4rOoJ6Egrf8K2IrywzwOMk', 10);
 * console.log(episodes.map(e => e.name));
 * ```
 */
export async function getShowEpisodes(
  client: SpotifyApi,
  showId: string,
  limit: number = 10,
  offset: number = 0
): Promise<SpotifyEpisode[]> {
  const response = await client.shows.episodes(
    showId,
    undefined, // market - use user's market from token
    Math.min(limit, 50) as 1,
    offset
  );

  // Filter out null episodes (can occur when episodes are unavailable in user's market or removed)
  return response.items
    .filter((episode): episode is SimplifiedEpisode => episode !== null)
    .map(transformEpisode);
}

/**
 * Get the latest episode from a show.
 *
 * Useful for initial subscription fetch where we only want the most recent item.
 *
 * @param client - Authenticated SpotifyApi client
 * @param showId - Spotify show ID
 * @returns The latest episode, or null if show has no episodes
 */
export async function getLatestEpisode(
  client: SpotifyApi,
  showId: string
): Promise<SpotifyEpisode | null> {
  const episodes = await getShowEpisodes(client, showId, 1, 0);
  return episodes[0] ?? null;
}

/**
 * Get a single episode by ID.
 *
 * @param accessToken - Decrypted user access token
 * @param episodeId - Spotify episode ID (22 alphanumeric characters)
 * @returns Episode details, or null if episode not found
 *
 * @example
 * ```typescript
 * const accessToken = await getValidAccessToken(connection, env);
 * const episode = await getEpisode(accessToken, '512ojhOuo1ktJprKbVcKyQ');
 * if (episode) {
 *   console.log(episode.name);
 * }
 * ```
 */
export async function getEpisode(
  accessToken: string,
  episodeId: string
): Promise<SpotifyEpisode | null> {
  // Use fetch directly since we need to handle 404 gracefully
  // and the SDK doesn't expose episode.get() directly
  const response = await fetch(`https://api.spotify.com/v1/episodes/${episodeId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Spotify API error: ${response.status} ${response.statusText} - ${errorBody}`);
  }

  const episode = (await response.json()) as Episode;
  return transformFullEpisode(episode);
}

/**
 * Get show details by ID.
 *
 * @param client - Authenticated SpotifyApi client
 * @param showId - Spotify show ID
 * @returns Show details
 */
export async function getShow(client: SpotifyApi, showId: string): Promise<SpotifyShow> {
  // Market defaults to user's market when using authenticated client
  const show = await client.shows.get(showId, 'US');
  return transformShow(show);
}

/**
 * Get multiple shows (podcasts) by their IDs in a single API call.
 *
 * This is the batch version of getShow() - use this when fetching metadata
 * for multiple subscriptions to dramatically reduce API calls.
 *
 * Key use case: Delta detection for polling. The returned `totalEpisodes`
 * field can be compared with stored `subscription.totalItems` to determine
 * if new episodes exist without fetching the actual episodes.
 *
 * Spotify API Cost: 1 API call per 50 shows
 * Endpoint: GET /shows?ids=...
 * Rate Limit: ~180 req/30s
 *
 * @param client - Authenticated SpotifyApi client
 * @param showIds - Array of Spotify show IDs (max 50 per API call, automatically chunked)
 * @param market - Market code (default: 'US')
 * @returns Array of SpotifyShow objects in same order as input IDs.
 *          Missing shows will have undefined at that index (SDK behavior).
 */
export async function getMultipleShows(
  client: SpotifyApi,
  showIds: string[],
  market: Market = 'US'
): Promise<SpotifyShow[]> {
  if (showIds.length === 0) {
    return [];
  }

  // Chunk into groups of 50 (API limit)
  const chunks: string[][] = [];
  for (let i = 0; i < showIds.length; i += 50) {
    chunks.push(showIds.slice(i, i + 50));
  }

  const allShows: SpotifyShow[] = [];

  for (const chunk of chunks) {
    // SDK's get() is overloaded: string[] returns Show[]
    const shows = await client.shows.get(chunk, market);
    // Transform each show to our simplified type
    allShows.push(...shows.map(transformShow));
  }

  return allShows;
}

// ============================================================================
// Cache Functions
// ============================================================================

/**
 * Environment interface for cache operations.
 * Requires the SPOTIFY_CACHE KV namespace binding.
 */
interface CacheEnv {
  SPOTIFY_CACHE: KVNamespace;
}

/**
 * Convert SpotifyShow to CachedShowMetadata for storage.
 */
function toCacheFormat(show: SpotifyShow): CachedShowMetadata {
  return {
    id: show.id,
    name: show.name,
    description: show.description,
    publisher: show.publisher,
    images: show.images,
    externalUrl: show.externalUrl,
    totalEpisodes: show.totalEpisodes,
    cachedAt: Date.now(),
  };
}

/**
 * Convert CachedShowMetadata back to SpotifyShow.
 */
function fromCacheFormat(cached: CachedShowMetadata): SpotifyShow {
  return {
    id: cached.id,
    name: cached.name,
    description: cached.description,
    publisher: cached.publisher,
    images: cached.images,
    externalUrl: cached.externalUrl,
    totalEpisodes: cached.totalEpisodes,
  };
}

/**
 * Get the cache key for a show ID.
 */
function getShowCacheKey(showId: string): string {
  return `${SHOW_CACHE_CONFIG.KEY_PREFIX}${showId}`;
}

/**
 * Get multiple shows with KV caching.
 *
 * This function checks the cache first for each show, then fetches
 * any uncached shows from the Spotify API and stores them in the cache.
 *
 * Benefits:
 * - Reduces API calls by 50-80% (most shows are already cached)
 * - KV lookup ~50ms vs API ~200ms
 * - Provides more headroom for episode fetching within rate limits
 *
 * @param client - Authenticated SpotifyApi client
 * @param showIds - Array of Spotify show IDs
 * @param env - Environment with SPOTIFY_CACHE KV binding
 * @param market - Market code (default: 'US')
 * @returns CacheResult with shows map and cache metrics
 */
export async function getMultipleShowsWithCache(
  client: SpotifyApi,
  showIds: string[],
  env: CacheEnv,
  market: Market = 'US'
): Promise<CacheResult<Map<string, SpotifyShow>>> {
  if (showIds.length === 0) {
    return { data: new Map(), cacheHits: 0, cacheMisses: 0 };
  }

  const result = new Map<string, SpotifyShow>();
  const uncachedIds: string[] = [];
  let cacheHits = 0;

  // Check cache for all shows
  // Note: We do sequential KV lookups here. Cloudflare KV is fast (~50ms per read)
  // and batching KV reads is not supported. For 10-20 shows this is still much
  // faster than API calls (~200ms each).
  for (const showId of showIds) {
    try {
      const cached = await env.SPOTIFY_CACHE.get<CachedShowMetadata>(
        getShowCacheKey(showId),
        'json'
      );
      if (cached) {
        result.set(showId, fromCacheFormat(cached));
        cacheHits++;
      } else {
        uncachedIds.push(showId);
      }
    } catch {
      // If cache read fails, fall back to API
      uncachedIds.push(showId);
    }
  }

  // Fetch uncached shows from API
  if (uncachedIds.length > 0) {
    const apiShows = await getMultipleShows(client, uncachedIds, market);

    // Store fetched shows in cache and add to result
    // We don't await the cache writes to avoid blocking the response
    const cachePromises: Promise<void>[] = [];

    for (const show of apiShows) {
      if (show) {
        result.set(show.id, show);

        // Store in cache with TTL
        cachePromises.push(
          env.SPOTIFY_CACHE.put(getShowCacheKey(show.id), JSON.stringify(toCacheFormat(show)), {
            expirationTtl: SHOW_CACHE_CONFIG.TTL_SECONDS,
          }).catch(() => {
            // Silently ignore cache write failures - not critical
          })
        );
      }
    }

    // Wait for cache writes to complete (they're quick)
    await Promise.all(cachePromises);
  }

  return {
    data: result,
    cacheHits,
    cacheMisses: uncachedIds.length,
  };
}

/**
 * Update cached show metadata after detecting new episodes.
 *
 * Call this after successfully detecting delta (new episodes) to update
 * the cached totalEpisodes count. This ensures future delta detection
 * works correctly.
 *
 * @param showId - Spotify show ID
 * @param show - Updated show data
 * @param env - Environment with SPOTIFY_CACHE KV binding
 */
export async function updateShowCache(
  showId: string,
  show: SpotifyShow,
  env: CacheEnv
): Promise<void> {
  try {
    await env.SPOTIFY_CACHE.put(getShowCacheKey(showId), JSON.stringify(toCacheFormat(show)), {
      expirationTtl: SHOW_CACHE_CONFIG.TTL_SECONDS,
    });
  } catch {
    // Silently ignore cache write failures - not critical
  }
}

/**
 * Invalidate cached show metadata.
 *
 * Use this when you know the cache is stale (e.g., after a show is
 * deleted or becomes unavailable).
 *
 * @param showId - Spotify show ID
 * @param env - Environment with SPOTIFY_CACHE KV binding
 */
export async function invalidateShowCache(showId: string, env: CacheEnv): Promise<void> {
  try {
    await env.SPOTIFY_CACHE.delete(getShowCacheKey(showId));
  } catch {
    // Silently ignore cache delete failures - not critical
  }
}

/**
 * Search for shows (podcasts).
 *
 * Note: Search uses public data and doesn't require user authentication,
 * but we use the authenticated client for consistency.
 *
 * @param client - SpotifyApi client
 * @param query - Search query string
 * @param limit - Maximum results (default: 10, max: 50)
 * @returns Array of matching shows
 *
 * @example
 * ```typescript
 * const client = await getSpotifyClientForConnection(connection, env);
 * const results = await searchShows(client, 'technology podcast', 20);
 * ```
 */
export async function searchShows(
  client: SpotifyApi,
  query: string,
  limit: number = 10
): Promise<SpotifyShow[]> {
  const response = await client.search(query, ['show'], undefined, Math.min(limit, 50) as 1);

  return (response.shows?.items ?? []).map((show) => transformShow(show));
}

/**
 * Check if specific shows are saved in user's library.
 *
 * @param client - Authenticated SpotifyApi client
 * @param showIds - Array of show IDs to check
 * @returns Array of booleans indicating if each show is saved
 */
export async function checkSavedShows(client: SpotifyApi, showIds: string[]): Promise<boolean[]> {
  return client.currentUser.shows.hasSavedShow(showIds);
}

// ============================================================================
// Transform Helpers
// ============================================================================

/**
 * Transform SDK's SimplifiedShow/Show to our SpotifyShow type
 */
function transformShow(show: SimplifiedShow | Show): SpotifyShow {
  return {
    id: show.id,
    name: show.name,
    description: show.description,
    publisher: show.publisher,
    images: show.images.map((img) => ({
      url: img.url,
      height: img.height,
      width: img.width,
    })),
    externalUrl: show.external_urls.spotify,
    totalEpisodes: show.total_episodes,
  };
}

/**
 * Transform SDK's SimplifiedEpisode to our SpotifyEpisode type
 */
function transformEpisode(episode: SimplifiedEpisode): SpotifyEpisode {
  return {
    id: episode.id,
    name: episode.name,
    description: episode.description,
    releaseDate: episode.release_date,
    durationMs: episode.duration_ms,
    externalUrl: episode.external_urls.spotify,
    images: episode.images.map((img) => ({
      url: img.url,
      height: img.height,
      width: img.width,
    })),
    isPlayable: episode.is_playable,
  };
}

/**
 * Transform SDK's full Episode to our SpotifyEpisode type
 * The full Episode type is returned from GET /episodes/{id}
 */
function transformFullEpisode(episode: Episode): SpotifyEpisode {
  // Get the show's image (prefer larger sizes)
  const showImageUrl = episode.show?.images?.[0]?.url;

  return {
    id: episode.id,
    name: episode.name,
    description: episode.description,
    releaseDate: episode.release_date,
    durationMs: episode.duration_ms,
    externalUrl: episode.external_urls.spotify,
    images: episode.images.map((img) => ({
      url: img.url,
      height: img.height,
      width: img.width,
    })),
    isPlayable: episode.is_playable,
    showName: episode.show?.name,
    showPublisher: episode.show?.publisher,
    showImageUrl,
  };
}
