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

import { eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { Provider } from '@zine/shared';
import type { SpotifyApi } from '@spotify/web-api-ts-sdk';
import { subscriptions } from '../db/schema';
import { pollLogger } from '../lib/logger';
import { parseSpotifyDate } from '../lib/timestamps';
import {
  getSpotifyClientForConnection,
  getShowEpisodes,
  type SpotifyEpisode,
} from '../providers/spotify';
import { ingestItem } from '../ingestion/processor';
import { transformSpotifyEpisode } from '../ingestion/transformers';
import type { Bindings } from '../types';
import type { ProviderConnection } from '../lib/token-refresh';
import type {
  Subscription,
  DrizzleDB,
  PollingResult,
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
};

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
  spotifyLogger.info('Polling subscription', { subscriptionId: sub.id, name: sub.name });

  // Fetch recent episodes from the show
  const episodes = await getShowEpisodes(client, sub.providerChannelId, MAX_ITEMS_PER_POLL);

  if (episodes.length === 0) {
    spotifyLogger.info('No episodes found', { name: sub.name });
    await updateSubscriptionPolled(sub.id, db);
    return { newItems: 0 };
  }

  // Filter to new episodes based on lastPolledAt
  const newEpisodes = filterNewEpisodes(episodes, sub.lastPolledAt);

  spotifyLogger.info('Found episodes', {
    total: episodes.length,
    new: newEpisodes.length,
    name: sub.name,
  });

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

  return { newItems: newItemsCount };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Filter episodes to only those published after lastPolledAt.
 * For first poll (no lastPolledAt), return only the latest episode.
 */
function filterNewEpisodes(
  episodes: SpotifyEpisode[],
  lastPolledAt: number | null
): SpotifyEpisode[] {
  if (lastPolledAt) {
    return episodes.filter((e) => {
      const releaseDate = parseSpotifyDate(e.releaseDate);
      return releaseDate > lastPolledAt;
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
      }
    } catch (ingestError) {
      spotifyLogger.error('Failed to ingest episode', { error: ingestError });
    }
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
