/**
 * Spotify Polling Provider
 *
 * Handles polling Spotify shows (podcasts) for new episodes.
 * Extracts Spotify-specific logic from the main scheduler.
 *
 * Key features:
 * - Fetches recent episodes from shows
 * - Parses variable date formats (YYYY, YYYY-MM, YYYY-MM-DD)
 * - Identifies new episodes based on lastPolledAt
 *
 * @see /features/subscriptions/backend-spec.md Section 3: Polling Architecture
 */

import { eq, inArray } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { Provider } from '@zine/shared';
import type { SpotifyApi } from '@spotify/web-api-ts-sdk';
import pLimit from 'p-limit';
import { subscriptions } from '../db/schema';
import { pollLogger } from '../lib/logger';
import { parseSpotifyDate } from '../lib/timestamps';
import {
  getSpotifyClientForConnection,
  getShowEpisodes,
  getMultipleShowsWithCache,
  updateShowCache,
  invalidateShowCache,
  type SpotifyEpisode,
  type SpotifyShow,
} from '../providers/spotify';
import { ingestItem } from '../ingestion/processor';
import { transformSpotifyEpisode } from '../ingestion/transformers';
import type { Bindings } from '../types';
import type { ProviderConnection } from '../lib/token-refresh';
import type {
  Subscription,
  DrizzleDB,
  PollingResult,
  BatchPollingResult,
  ProviderBatchConfig,
  ProviderConnectionRow,
} from './types';
import { MAX_ITEMS_PER_POLL } from './types';
import {
  serializeError,
  createPollingError,
  formatPollingErrorLegacy,
  type PollingError,
} from '../utils/error-utils';

// ============================================================================
// Logger
// ============================================================================

const spotifyLogger = pollLogger.child('spotify');

// ============================================================================
// Constants
// ============================================================================

/** Default concurrency for parallel episode fetching */
const DEFAULT_EPISODE_FETCH_CONCURRENCY = 5;

// ============================================================================
// Provider Configuration
// ============================================================================

/**
 * Spotify provider batch configuration.
 * Used by the generic batch processor in scheduler.ts.
 */
export const spotifyProviderConfig: ProviderBatchConfig<SpotifyApi> = {
  provider: 'SPOTIFY',
  getClient: (connection: ProviderConnectionRow, env: Bindings) =>
    getSpotifyClientForConnection(
      connection as ProviderConnection,
      env as Parameters<typeof getSpotifyClientForConnection>[1]
    ),
  pollSingle: pollSingleSpotifySubscription,
  pollBatch: pollSpotifySubscriptionsBatched,
};

// ============================================================================
// Batch Polling Function
// ============================================================================

/**
 * Poll multiple Spotify subscriptions using batch API and delta detection.
 *
 * This is an optimized version of pollSingleSpotifySubscription that:
 * 1. Uses getMultipleShows() to batch fetch show metadata (1-2 API calls vs N)
 * 2. Compares totalEpisodes vs stored totalItems for delta detection
 * 3. Only fetches episodes for shows with new content (~10% typically)
 * 4. Updates totalItems after each successful poll for future delta detection
 *
 * Achieves ~90% reduction in API calls compared to individual polling.
 *
 * @param subs - Subscriptions to poll (all belonging to the same user)
 * @param client - Authenticated Spotify client
 * @param userId - User ID owning the subscriptions
 * @param env - Cloudflare Worker bindings
 * @param db - Database instance
 * @returns BatchPollingResult with aggregated metrics
 */
export async function pollSpotifySubscriptionsBatched(
  subs: Subscription[],
  client: SpotifyApi,
  userId: string,
  env: Bindings,
  db: DrizzleDB
): Promise<BatchPollingResult> {
  spotifyLogger.info('Starting batch poll', { count: subs.length, userId });

  if (subs.length === 0) {
    return { newItems: 0, processed: 0, skipped: 0 };
  }

  // Extract show IDs from subscriptions
  const showIds = subs.map((sub) => sub.providerChannelId);

  // Batch fetch show metadata with caching
  // This checks KV cache first, then fetches uncached shows from API
  let showMap: Map<string, SpotifyShow>;
  let cacheHits = 0;
  let cacheMisses = 0;
  try {
    const cacheResult = await getMultipleShowsWithCache(client, showIds, env);
    showMap = cacheResult.data;
    cacheHits = cacheResult.cacheHits;
    cacheMisses = cacheResult.cacheMisses;

    spotifyLogger.info('Show metadata cache lookup', {
      total: showIds.length,
      cacheHits,
      cacheMisses,
      hitRate: showIds.length > 0 ? Math.round((cacheHits / showIds.length) * 100) : 0,
    });
  } catch (error) {
    spotifyLogger.error('Failed to fetch show metadata', {
      error: serializeError(error),
      userId,
    });
    // Return error for all subscriptions
    return {
      newItems: 0,
      processed: 0,
      errors: subs.map((sub) =>
        formatPollingErrorLegacy(
          createPollingError(sub.id, error, {
            operation: 'getMultipleShowsWithCache',
            userId,
            showCount: showIds.length,
          })
        )
      ),
    };
  }

  // Determine which subscriptions need updates via delta detection
  const subsNeedingUpdate: Array<{ sub: Subscription; show: SpotifyShow }> = [];
  const subsUnchanged: Subscription[] = [];
  const subsMissing: Subscription[] = [];

  for (const sub of subs) {
    const show = showMap.get(sub.providerChannelId);
    if (!show) {
      // Show not found - likely deleted from Spotify or made unavailable
      spotifyLogger.warn('Show not found in batch response - may be deleted from Spotify', {
        subscriptionId: sub.id,
        showId: sub.providerChannelId,
        subscriptionName: sub.name,
      });
      subsMissing.push(sub);
      continue;
    }

    // Delta detection: compare current total with stored total
    const storedCount = sub.totalItems ?? 0;
    const currentCount = show.totalEpisodes;

    if (currentCount > storedCount) {
      // New episodes exist - needs full polling
      spotifyLogger.info('Delta detected', {
        subscriptionId: sub.id,
        name: sub.name,
        stored: storedCount,
        current: currentCount,
        delta: currentCount - storedCount,
      });
      subsNeedingUpdate.push({ sub, show });
    } else {
      // No new episodes - just mark as polled
      subsUnchanged.push(sub);
    }
  }

  spotifyLogger.info('Delta detection complete', {
    needsUpdate: subsNeedingUpdate.length,
    unchanged: subsUnchanged.length,
    missing: subsMissing.length,
  });

  // Mark missing shows as disconnected and invalidate their cache
  if (subsMissing.length > 0) {
    await markSubscriptionsAsDisconnected(
      subsMissing.map((s) => s.id),
      'Show no longer available on Spotify',
      db
    );

    // Invalidate cache for missing shows to ensure we don't serve stale data
    await Promise.all(subsMissing.map((s) => invalidateShowCache(s.providerChannelId, env)));

    spotifyLogger.info('Marked subscriptions as disconnected due to missing shows', {
      count: subsMissing.length,
      subscriptionIds: subsMissing.map((s) => s.id),
    });
  }

  // Batch update lastPolledAt for unchanged subscriptions
  if (subsUnchanged.length > 0) {
    await updateSubscriptionsPolled(
      subsUnchanged.map((s) => s.id),
      db
    );
  }

  // Process subscriptions that need updates in parallel
  const pollingErrors: PollingError[] = [];

  // Get concurrency limit from environment, falling back to default
  const concurrency =
    parseInt(env.SPOTIFY_EPISODE_FETCH_CONCURRENCY ?? '', 10) || DEFAULT_EPISODE_FETCH_CONCURRENCY;
  const limit = pLimit(concurrency);

  // Parallel episode fetching with concurrency control
  const parallelFetchStart = Date.now();

  const episodeResults = await Promise.all(
    subsNeedingUpdate.map(({ sub, show }) =>
      limit(async () => {
        try {
          const episodes = await getShowEpisodes(client, sub.providerChannelId, MAX_ITEMS_PER_POLL);
          return { sub, show, episodes, error: undefined as Error | undefined };
        } catch (error) {
          // Don't let one failure block others
          spotifyLogger.error('Failed to fetch episodes for show', {
            subscriptionId: sub.id,
            showId: sub.providerChannelId,
            showName: sub.name,
            error: serializeError(error),
          });
          return { sub, show, episodes: [] as SpotifyEpisode[], error: error as Error };
        }
      })
    )
  );

  const parallelFetchDuration = Date.now() - parallelFetchStart;
  const failedFetchCount = episodeResults.filter((r) => r.error).length;

  spotifyLogger.info('Parallel episode fetch completed', {
    subscriptionCount: subsNeedingUpdate.length,
    durationMs: parallelFetchDuration,
    avgPerSubscription:
      subsNeedingUpdate.length > 0
        ? Math.round(parallelFetchDuration / subsNeedingUpdate.length)
        : 0,
    concurrency,
    failedCount: failedFetchCount,
    successCount: subsNeedingUpdate.length - failedFetchCount,
  });

  // Process fetched episodes (ingestion happens sequentially to avoid DB contention)
  let totalNewItems = 0;

  for (const { sub, show, episodes: allEpisodes, error } of episodeResults) {
    // Handle fetch errors
    if (error) {
      const pollingError = createPollingError(sub.id, error, {
        showId: sub.providerChannelId,
        showName: sub.name,
        userId,
        operation: 'getShowEpisodes',
      });
      pollingErrors.push(pollingError);
      continue;
    }

    // No episodes found
    if (allEpisodes.length === 0) {
      spotifyLogger.info('No episodes found', { name: sub.name });
      await updateSubscriptionPolled(sub.id, db);
      continue;
    }

    // Filter out unplayable episodes first (geo-restricted, removed, etc.)
    const episodes = filterPlayableEpisodes(allEpisodes, sub.name);

    if (episodes.length === 0) {
      spotifyLogger.info('No playable episodes found', { name: sub.name });
      await updateSubscriptionPolled(sub.id, db);
      continue;
    }

    // Filter to new episodes based on lastPublishedAt (the newest episode we've already seen)
    const newEpisodes = filterNewEpisodes(episodes, sub.lastPublishedAt);

    spotifyLogger.info('Found episodes', {
      total: episodes.length,
      new: newEpisodes.length,
      name: sub.name,
    });

    try {
      // Ingest new items and get the newest successfully ingested timestamp
      const { count: newItemsCount, newestIngestedAt } = await ingestNewEpisodes(
        newEpisodes,
        userId,
        sub.id,
        sub.name,
        sub.imageUrl,
        db
      );
      totalNewItems += newItemsCount;

      // Update subscription with poll results
      // IMPORTANT: Only update lastPublishedAt and totalItems if we successfully ingested at least one episode.
      // This prevents the watermark corruption bug where:
      // 1. Ingestion fails or all episodes are skipped
      // 2. lastPublishedAt gets updated anyway based on ALL fetched episodes
      // 3. Future polls filter out those episodes forever
      // 4. The subscription is stuck with missed episodes
      //
      // The key invariant is: if totalItems == totalEpisodes, then lastPublishedAt must
      // accurately reflect the newest episode we've actually ingested.
      const shouldUpdateTotalItems = newestIngestedAt !== null;

      await db
        .update(subscriptions)
        .set({
          lastPolledAt: Date.now(),
          // Only advance the watermark based on successfully ingested episodes
          ...(newestIngestedAt && { lastPublishedAt: newestIngestedAt }),
          ...(shouldUpdateTotalItems && { totalItems: show.totalEpisodes }),
          updatedAt: Date.now(),
        })
        .where(eq(subscriptions.id, sub.id));

      // Update the cache with fresh show data after successful ingestion
      // This ensures the cache has the latest totalEpisodes for future delta detection
      if (shouldUpdateTotalItems) {
        await updateShowCache(show.id, show, env);
      }
    } catch (ingestError) {
      const pollingError = createPollingError(sub.id, ingestError, {
        showId: sub.providerChannelId,
        showName: sub.name,
        userId,
        operation: 'ingestEpisodes',
      });
      spotifyLogger.error('Failed to ingest episodes for subscription', {
        subscriptionId: sub.id,
        error: pollingError.error,
        errorType: pollingError.errorType,
        context: pollingError.context,
      });
      pollingErrors.push(pollingError);
    }
  }

  return {
    newItems: totalNewItems,
    processed: subsNeedingUpdate.length,
    skipped: subsUnchanged.length,
    disconnected: subsMissing.length,
    errors: pollingErrors.length > 0 ? pollingErrors.map(formatPollingErrorLegacy) : undefined,
    cacheHits,
    cacheMisses,
  };
}

/**
 * Batch update lastPolledAt for multiple subscriptions.
 * Used when delta detection determines no new episodes exist.
 */
async function updateSubscriptionsPolled(ids: string[], db: DrizzleDB): Promise<void> {
  if (ids.length === 0) return;

  await db
    .update(subscriptions)
    .set({ lastPolledAt: Date.now(), updatedAt: Date.now() })
    .where(inArray(subscriptions.id, ids));
}

/**
 * Mark subscriptions as disconnected with a reason.
 * Used when a show is no longer available on Spotify.
 */
async function markSubscriptionsAsDisconnected(
  ids: string[],
  reason: string,
  db: DrizzleDB
): Promise<void> {
  if (ids.length === 0) return;

  const now = Date.now();
  await db
    .update(subscriptions)
    .set({
      status: 'DISCONNECTED',
      disconnectedAt: now,
      disconnectedReason: reason,
      updatedAt: now,
    })
    .where(inArray(subscriptions.id, ids));
}

// ============================================================================
// Main Polling Function
// ============================================================================

/**
 * Poll a single Spotify subscription for new episodes.
 *
 * Process:
 * 1. Fetch recent episodes from the show
 * 2. Identify new episodes based on lastPolledAt
 * 3. Ingest new episodes
 * 4. Update subscription metadata
 *
 * @param sub - Subscription to poll
 * @param client - Authenticated Spotify client
 * @param userId - User ID owning the subscription
 * @param env - Cloudflare Worker bindings
 * @param db - Database instance
 * @returns PollingResult with new item count
 */
export async function pollSingleSpotifySubscription(
  sub: Subscription,
  client: SpotifyApi,
  userId: string,
  env: Bindings,
  db: DrizzleDB
): Promise<PollingResult> {
  spotifyLogger.info('Polling subscription', {
    subscriptionId: sub.id,
    name: sub.name,
    lastPublishedAt: sub.lastPublishedAt,
    lastPublishedAtDate: sub.lastPublishedAt ? new Date(sub.lastPublishedAt).toISOString() : null,
  });

  // Fetch recent episodes from the show
  const allEpisodes = await getShowEpisodes(client, sub.providerChannelId, MAX_ITEMS_PER_POLL);

  if (allEpisodes.length === 0) {
    spotifyLogger.info('No episodes found', { name: sub.name });
    await updateSubscriptionPolled(sub.id, db);
    return { newItems: 0 };
  }

  // Filter out unplayable episodes first (geo-restricted, removed, etc.)
  const episodes = filterPlayableEpisodes(allEpisodes, sub.name);

  if (episodes.length === 0) {
    spotifyLogger.info('No playable episodes found', { name: sub.name });
    await updateSubscriptionPolled(sub.id, db);
    return { newItems: 0 };
  }

  // Filter to new episodes based on lastPublishedAt (the newest episode we've already seen)
  const newEpisodes = filterNewEpisodes(episodes, sub.lastPublishedAt);

  // Log detailed episode info for debugging
  if (episodes.length > 0) {
    const latestEpisode = episodes[0];
    const latestReleaseDate = parseSpotifyDate(latestEpisode.releaseDate);
    spotifyLogger.info('Found episodes', {
      name: sub.name,
      total: episodes.length,
      new: newEpisodes.length,
      latestEpisodeTitle: latestEpisode.name,
      latestEpisodeDate: latestEpisode.releaseDate,
      latestEpisodeDateParsed: new Date(latestReleaseDate).toISOString(),
      lastPublishedAt: sub.lastPublishedAt ? new Date(sub.lastPublishedAt).toISOString() : null,
      wouldBeNew: sub.lastPublishedAt ? latestReleaseDate > sub.lastPublishedAt : true,
    });
  }

  // Ingest new items and get the newest successfully ingested timestamp
  const { count: newItemsCount, newestIngestedAt } = await ingestNewEpisodes(
    newEpisodes,
    userId,
    sub.id,
    sub.name,
    sub.imageUrl,
    db
  );

  // Update subscription with poll results
  // IMPORTANT: Only update lastPublishedAt if we successfully ingested at least one episode.
  // This prevents watermark corruption when ingestion fails or all episodes are skipped.
  await db
    .update(subscriptions)
    .set({
      lastPolledAt: Date.now(),
      // Only advance the watermark based on successfully ingested episodes
      ...(newestIngestedAt && { lastPublishedAt: newestIngestedAt }),
      updatedAt: Date.now(),
    })
    .where(eq(subscriptions.id, sub.id));

  spotifyLogger.info('Poll complete', {
    name: sub.name,
    newItemsIngested: newItemsCount,
    updatedLastPublishedAt: newestIngestedAt ? new Date(newestIngestedAt).toISOString() : null,
  });

  return { newItems: newItemsCount };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Filter out unplayable episodes before processing.
 *
 * Spotify episodes can be unplayable due to:
 * - Geo-restrictions (not available in user's region)
 * - Removed by publisher
 * - Rights expired
 * - Content policy violation
 * - Temporary takedown
 *
 * Unplayable episodes should not be ingested into the user's inbox
 * as they would create frustration (content they can't access).
 *
 * @param episodes - Episodes to filter
 * @param showName - Show name for logging context
 * @returns Only playable episodes
 */
function filterPlayableEpisodes(episodes: SpotifyEpisode[], showName: string): SpotifyEpisode[] {
  const playableEpisodes = episodes.filter((e) => e.isPlayable);

  const unplayableCount = episodes.length - playableEpisodes.length;
  if (unplayableCount > 0) {
    spotifyLogger.info('Filtered unplayable episodes', {
      showName,
      totalEpisodes: episodes.length,
      unplayableCount,
      playableCount: playableEpisodes.length,
    });
  }

  return playableEpisodes;
}

/**
 * Filter episodes to only those published after lastPublishedAt.
 * For first poll (no lastPublishedAt), return only the latest episode.
 *
 * IMPORTANT: We use lastPublishedAt (the release date of the newest episode
 * we've already seen) instead of lastPolledAt (when we last checked).
 *
 * This is critical because Spotify release dates are day-precision only
 * (YYYY-MM-DD at midnight UTC). If we compared against lastPolledAt:
 * - Episode released: 2026-01-06T00:00:00Z (midnight, day-precision)
 * - We poll at: 2026-01-06T12:00:00Z (noon)
 * - Next poll compares: releaseDate (midnight) > lastPolledAt (noon) = FALSE!
 * - The episode would be incorrectly filtered out.
 *
 * By comparing against lastPublishedAt (also day-precision), we ensure
 * episodes released on a NEW day are always included.
 */
function filterNewEpisodes(
  episodes: SpotifyEpisode[],
  lastPublishedAt: number | null
): SpotifyEpisode[] {
  if (lastPublishedAt) {
    return episodes.filter((e) => {
      const releaseDate = parseSpotifyDate(e.releaseDate);
      // Include episodes released AFTER the newest one we've already seen
      return releaseDate > lastPublishedAt;
    });
  }
  // First poll: only latest episode
  return episodes.slice(0, 1);
}

/**
 * Result of ingesting new episodes.
 * Contains the count of successfully created items and the newest timestamp
 * from successfully ingested episodes (used to update lastPublishedAt).
 */
interface IngestResult {
  count: number;
  newestIngestedAt: number | null;
}

/**
 * Ingest new episodes into the database.
 * Returns the count of successfully created items AND the newest timestamp
 * from successfully ingested episodes.
 *
 * IMPORTANT: The newestIngestedAt timestamp is ONLY updated for episodes that
 * were actually created (ingested successfully). This prevents the lastPublishedAt
 * watermark from being corrupted when ingestion fails or episodes are skipped.
 */
async function ingestNewEpisodes(
  episodes: SpotifyEpisode[],
  userId: string,
  subscriptionId: string,
  showName: string,
  showImageUrl: string | null,
  db: DrizzleDB
): Promise<IngestResult> {
  let newItemsCount = 0;
  let skippedCount = 0;
  let newestIngestedAt: number | null = null;

  for (const episode of episodes) {
    try {
      // Transform SpotifyEpisode to the format expected by transformSpotifyEpisode
      const rawEpisode = {
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
        rawEpisode,
        Provider.SPOTIFY,
        db as unknown as DrizzleD1Database,
        (raw: typeof rawEpisode) =>
          transformSpotifyEpisode(raw, showName, showImageUrl ?? undefined)
      );
      if (result.created) {
        newItemsCount++;

        // Track the newest successfully ingested timestamp
        const episodeTimestamp = parseSpotifyDate(episode.releaseDate);
        if (episodeTimestamp > 0 && (!newestIngestedAt || episodeTimestamp > newestIngestedAt)) {
          newestIngestedAt = episodeTimestamp;
        }

        spotifyLogger.info('Episode ingested', {
          showName,
          episodeId: episode.id,
          episodeName: episode.name,
          releaseDate: episode.releaseDate,
          itemId: result.itemId,
          userItemId: result.userItemId,
        });
      } else {
        skippedCount++;
        spotifyLogger.debug('Episode skipped (already seen)', {
          showName,
          episodeId: episode.id,
          episodeName: episode.name,
          reason: result.skipped,
        });
      }
    } catch (ingestError) {
      // IMPORTANT: Do NOT update newestIngestedAt on failure.
      // This ensures lastPublishedAt is only advanced for successful ingestions.
      const serialized = serializeError(ingestError);
      spotifyLogger.error('Failed to ingest episode', {
        showName,
        episodeId: episode.id,
        episodeName: episode.name,
        error: serialized,
        errorType: serialized.type,
        errorStack: serialized.stack,
      });
    }
  }

  if (skippedCount > 0) {
    spotifyLogger.info('Ingestion summary', {
      showName,
      created: newItemsCount,
      skipped: skippedCount,
    });
  }

  return { count: newItemsCount, newestIngestedAt };
}

/**
 * Update subscription lastPolledAt (used after errors or when no new items).
 */
async function updateSubscriptionPolled(subscriptionId: string, db: DrizzleDB): Promise<void> {
  await db
    .update(subscriptions)
    .set({ lastPolledAt: Date.now(), updatedAt: Date.now() })
    .where(eq(subscriptions.id, subscriptionId));
}
