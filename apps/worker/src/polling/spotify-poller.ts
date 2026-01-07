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
import { subscriptions } from '../db/schema';
import { pollLogger } from '../lib/logger';
import { parseSpotifyDate } from '../lib/timestamps';
import {
  getSpotifyClientForConnection,
  getShowEpisodes,
  getMultipleShows,
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

// ============================================================================
// Logger
// ============================================================================

const spotifyLogger = pollLogger.child('spotify');

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

  // Batch fetch show metadata (1-2 API calls for up to 100 shows)
  let shows: SpotifyShow[];
  try {
    shows = await getMultipleShows(client, showIds);
  } catch (error) {
    spotifyLogger.error('Failed to fetch show metadata', { error, userId });
    // Return error for all subscriptions
    return {
      newItems: 0,
      processed: 0,
      errors: subs.map((sub) => ({
        subscriptionId: sub.id,
        error: `Failed to fetch show metadata: ${String(error)}`,
      })),
    };
  }

  // Build a map of showId -> SpotifyShow for quick lookup
  const showMap = new Map<string, SpotifyShow>();
  for (const show of shows) {
    if (show) {
      showMap.set(show.id, show);
    }
  }

  // Determine which subscriptions need updates via delta detection
  const subsNeedingUpdate: Array<{ sub: Subscription; show: SpotifyShow }> = [];
  const subsUnchanged: Subscription[] = [];

  for (const sub of subs) {
    const show = showMap.get(sub.providerChannelId);
    if (!show) {
      // Show not found - might have been removed from Spotify
      spotifyLogger.warn('Show not found in batch response', {
        subscriptionId: sub.id,
        showId: sub.providerChannelId,
      });
      subsUnchanged.push(sub); // Treat as unchanged, update lastPolledAt
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
  });

  // Batch update lastPolledAt for unchanged subscriptions
  if (subsUnchanged.length > 0) {
    await updateSubscriptionsPolled(
      subsUnchanged.map((s) => s.id),
      db
    );
  }

  // Process subscriptions that need updates
  let totalNewItems = 0;
  const errors: Array<{ subscriptionId: string; error: string }> = [];

  for (const { sub, show } of subsNeedingUpdate) {
    try {
      // Fetch recent episodes from the show
      const episodes = await getShowEpisodes(client, sub.providerChannelId, MAX_ITEMS_PER_POLL);

      if (episodes.length === 0) {
        spotifyLogger.info('No episodes found', { name: sub.name });
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

      // Ingest new items
      const newItemsCount = await ingestNewEpisodes(newEpisodes, userId, sub.id, sub.name, db);
      totalNewItems += newItemsCount;

      // Calculate newest published timestamp from all episodes
      const newestPublishedAt = calculateNewestPublishedAt(episodes, sub.lastPublishedAt);

      // Update subscription with poll results AND totalItems for future delta detection
      await db
        .update(subscriptions)
        .set({
          lastPolledAt: Date.now(),
          lastPublishedAt: newestPublishedAt || undefined,
          totalItems: show.totalEpisodes, // Update for future delta detection
          updatedAt: Date.now(),
        })
        .where(eq(subscriptions.id, sub.id));
    } catch (error) {
      spotifyLogger.error('Failed to poll subscription', {
        subscriptionId: sub.id,
        error,
      });
      errors.push({ subscriptionId: sub.id, error: String(error) });
    }
  }

  return {
    newItems: totalNewItems,
    processed: subsNeedingUpdate.length,
    skipped: subsUnchanged.length,
    errors: errors.length > 0 ? errors : undefined,
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
  const episodes = await getShowEpisodes(client, sub.providerChannelId, MAX_ITEMS_PER_POLL);

  if (episodes.length === 0) {
    spotifyLogger.info('No episodes found', { name: sub.name });
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

  // Ingest new items
  const newItemsCount = await ingestNewEpisodes(newEpisodes, userId, sub.id, sub.name, db);

  // Calculate newest published timestamp from all episodes
  const newestPublishedAt = calculateNewestPublishedAt(episodes, sub.lastPublishedAt);

  // Update subscription with poll results
  await db
    .update(subscriptions)
    .set({
      lastPolledAt: Date.now(),
      lastPublishedAt: newestPublishedAt || undefined,
      updatedAt: Date.now(),
    })
    .where(eq(subscriptions.id, sub.id));

  spotifyLogger.info('Poll complete', {
    name: sub.name,
    newItemsIngested: newItemsCount,
    updatedLastPublishedAt: newestPublishedAt ? new Date(newestPublishedAt).toISOString() : null,
  });

  return { newItems: newItemsCount };
}

// ============================================================================
// Helper Functions
// ============================================================================

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
 * Ingest new episodes into the database.
 * Returns the count of successfully created items.
 */
async function ingestNewEpisodes(
  episodes: SpotifyEpisode[],
  userId: string,
  subscriptionId: string,
  showName: string,
  db: DrizzleDB
): Promise<number> {
  let newItemsCount = 0;
  let skippedCount = 0;

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
        (raw: typeof rawEpisode) => transformSpotifyEpisode(raw, showName)
      );
      if (result.created) {
        newItemsCount++;
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
      spotifyLogger.error('Failed to ingest episode', {
        showName,
        episodeId: episode.id,
        episodeName: episode.name,
        error: ingestError,
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

  return newItemsCount;
}

/**
 * Calculate the newest published timestamp from a list of episodes.
 * Used to update subscription.lastPublishedAt.
 */
function calculateNewestPublishedAt(
  episodes: SpotifyEpisode[],
  fallback: number | null
): number | null {
  if (episodes.length === 0) {
    return fallback;
  }

  const timestamps = episodes.map((e) => parseSpotifyDate(e.releaseDate)).filter((t) => t > 0);

  return timestamps.length > 0 ? Math.max(...timestamps) : fallback;
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
