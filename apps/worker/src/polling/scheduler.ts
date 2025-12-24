/**
 * Subscription Polling Scheduler
 *
 * Main cron job handler for polling subscriptions with distributed locking.
 * Prevents overlapping executions across multiple Cloudflare Worker instances.
 *
 * Key features:
 * - Distributed lock via KV prevents concurrent cron executions
 * - Processes only due subscriptions (based on lastPolledAt and pollIntervalSeconds)
 * - Groups by provider and user for efficient API usage
 * - Handles auth errors by marking connections/subscriptions as disconnected
 * - Updates lastPolledAt after each subscription poll
 *
 * @see /features/subscriptions/backend-spec.md Section 3: Polling Architecture
 */

import { and, eq, or, asc, isNull, inArray, sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { Provider } from '@zine/shared';
import { drizzle } from 'drizzle-orm/d1';
import type { youtube_v3 } from 'googleapis';
import * as schema from '../db/schema';
import { subscriptions, providerConnections } from '../db/schema';
import { tryAcquireLock, releaseLock } from '../lib/locks';
import { isRateLimited } from '../lib/rate-limiter';
import {
  getYouTubeClientForConnection,
  getChannelUploadsPlaylistId,
  fetchRecentVideos,
  type YouTubeClient,
} from '../providers/youtube';
import { getSpotifyClientForConnection, getShowEpisodes } from '../providers/spotify';
import { ingestItem } from '../ingestion';
import { transformYouTubeVideo, transformSpotifyEpisode } from '../ingestion/transformers';
import type { Bindings } from '../types';
import type { ProviderConnection } from '../lib/token-refresh';
import type { SpotifyApi } from '@spotify/web-api-ts-sdk';

// ============================================================================
// Constants
// ============================================================================

/** Distributed lock key for polling cron */
const POLL_LOCK_KEY = 'cron:poll-subscriptions:lock';

/** Lock TTL in seconds (15 minutes) - should cover worst case polling time */
const POLL_LOCK_TTL = 900;

/** Maximum subscriptions to process per cron run */
const BATCH_SIZE = 50;

/** Maximum videos/episodes to fetch per subscription poll */
const MAX_ITEMS_PER_POLL = 10;

// ============================================================================
// Types
// ============================================================================

/**
 * Result of a polling run
 */
export interface PollResult {
  /** Whether polling was skipped (e.g., lock held) */
  skipped: boolean;
  /** Reason for skipping or summary info */
  reason?: string;
  /** Number of subscriptions processed */
  processed?: number;
  /** Number of new items ingested */
  newItems?: number;
}

/**
 * Result of processing a provider batch
 */
interface BatchResult {
  processed: number;
  newItems: number;
}

/**
 * Subscription row from database
 */
type Subscription = typeof subscriptions.$inferSelect;

/**
 * Database type with schema
 */
type DrizzleDB = DrizzleD1Database<typeof schema>;

// ============================================================================
// Main Polling Function
// ============================================================================

/**
 * Poll due subscriptions for new content.
 *
 * This is the main entry point called by the cron scheduled handler.
 * It acquires a distributed lock, finds due subscriptions, and processes them.
 *
 * @param env - Cloudflare Worker environment bindings
 * @param _ctx - Execution context (for waitUntil if needed)
 * @returns PollResult with processing statistics
 */
export async function pollSubscriptions(
  env: Bindings,
  _ctx: ExecutionContext
): Promise<PollResult> {
  // 1. Try to acquire distributed lock
  const lockAcquired = await tryAcquireLock(env.OAUTH_STATE_KV, POLL_LOCK_KEY, POLL_LOCK_TTL);
  if (!lockAcquired) {
    console.log('[poll] Skipped: lock held by another worker');
    return { skipped: true, reason: 'lock_held' };
  }

  try {
    const db = drizzle(env.DB, { schema });
    const now = Date.now();

    // 2. Find due subscriptions
    // A subscription is due when:
    // - status is ACTIVE
    // - AND either:
    //   - lastPolledAt is NULL (never polled)
    //   - OR lastPolledAt < (now - pollIntervalSeconds * 1000)
    const dueSubscriptions = await db.query.subscriptions.findMany({
      where: and(
        eq(subscriptions.status, 'ACTIVE'),
        or(
          isNull(subscriptions.lastPolledAt),
          sql`${subscriptions.lastPolledAt} < ${now} - (${subscriptions.pollIntervalSeconds} * 1000)`
        )
      ),
      orderBy: [asc(subscriptions.lastPolledAt)],
      limit: BATCH_SIZE,
    });

    if (dueSubscriptions.length === 0) {
      console.log('[poll] No subscriptions due for polling');
      return { skipped: false, processed: 0, reason: 'no_due_subscriptions' };
    }

    console.log(`[poll] Found ${dueSubscriptions.length} due subscriptions`);

    // 3. Group by provider
    const youtube = dueSubscriptions.filter((s) => s.provider === 'YOUTUBE');
    const spotify = dueSubscriptions.filter((s) => s.provider === 'SPOTIFY');

    console.log(`[poll] YouTube: ${youtube.length}, Spotify: ${spotify.length}`);

    // 4. Process each provider's batch in parallel
    const [ytResult, spResult] = await Promise.all([
      processYouTubeBatch(youtube, env, db),
      processSpotifyBatch(spotify, env, db),
    ]);

    const totalProcessed = ytResult.processed + spResult.processed;
    const totalNewItems = ytResult.newItems + spResult.newItems;

    console.log(`[poll] Complete: processed ${totalProcessed}, new items ${totalNewItems}`);

    return {
      skipped: false,
      processed: totalProcessed,
      newItems: totalNewItems,
    };
  } finally {
    // Always release the lock
    await releaseLock(env.OAUTH_STATE_KV, POLL_LOCK_KEY);
  }
}

// ============================================================================
// YouTube Batch Processing
// ============================================================================

/**
 * Process a batch of YouTube subscriptions.
 *
 * Groups subscriptions by user to share API connections and respect rate limits.
 */
async function processYouTubeBatch(
  subs: Subscription[],
  env: Bindings,
  db: DrizzleDB
): Promise<BatchResult> {
  let processed = 0;
  let newItems = 0;

  if (subs.length === 0) {
    return { processed, newItems };
  }

  // Group by user to share connection
  const byUser = groupBy(subs, 'userId');

  for (const [userId, userSubs] of Object.entries(byUser)) {
    // Check rate limit before processing
    const rateCheck = await isRateLimited('YOUTUBE', userId, env.OAUTH_STATE_KV);
    if (rateCheck.limited) {
      console.log(
        `[poll:youtube] Skipping user ${userId}: rate limited for ${rateCheck.retryInMs}ms`
      );
      continue;
    }

    // Get connection for this user
    const connection = await db.query.providerConnections.findFirst({
      where: and(
        eq(providerConnections.userId, userId),
        eq(providerConnections.provider, 'YOUTUBE'),
        eq(providerConnections.status, 'ACTIVE')
      ),
    });

    if (!connection) {
      console.log(
        `[poll:youtube] No active connection for user ${userId}, marking subscriptions disconnected`
      );
      await markSubscriptionsDisconnected(
        userSubs.map((s) => s.id),
        db
      );
      continue;
    }

    try {
      // Create YouTube client with valid token
      const client = await getYouTubeClientForConnection(
        connection as ProviderConnection,
        env as Parameters<typeof getYouTubeClientForConnection>[1]
      );

      // Process each subscription for this user
      for (const sub of userSubs) {
        try {
          const result = await pollSingleYouTubeSubscription(sub, client, userId, env, db);
          processed++;
          newItems += result.newItems;
        } catch (subError) {
          console.error(`[poll:youtube] Error polling subscription ${sub.id}:`, subError);
          // Update lastPolledAt even on error to prevent infinite retry
          await updateSubscriptionPolled(sub.id, db);
          processed++;
        }
      }
    } catch (error: unknown) {
      // Handle auth errors at the user level
      if (isAuthError(error)) {
        console.log(`[poll:youtube] Auth error for user ${userId}, marking connection expired`);
        await markConnectionExpired(connection.id, db);
        await markSubscriptionsDisconnected(
          userSubs.map((s) => s.id),
          db
        );
      } else {
        console.error(`[poll:youtube] Batch error for user ${userId}:`, error);
      }
    }
  }

  return { processed, newItems };
}

/**
 * Poll a single YouTube subscription for new videos.
 */
async function pollSingleYouTubeSubscription(
  sub: Subscription,
  client: YouTubeClient,
  userId: string,
  env: Bindings,
  db: DrizzleDB
): Promise<{ newItems: number }> {
  console.log(`[poll:youtube] Polling subscription ${sub.id} (${sub.name})`);

  // Get the channel's uploads playlist
  const uploadsPlaylistId = await getChannelUploadsPlaylistId(client, sub.providerChannelId);

  // Fetch recent videos
  const videos = await fetchRecentVideos(client, uploadsPlaylistId, MAX_ITEMS_PER_POLL);

  if (videos.length === 0) {
    console.log(`[poll:youtube] No videos found for ${sub.name}`);
    await updateSubscriptionPolled(sub.id, db);
    return { newItems: 0 };
  }

  // Filter to new videos based on lastPolledAt
  const newVideos = sub.lastPolledAt
    ? videos.filter((v) => {
        const publishedAt = v.snippet?.publishedAt ? new Date(v.snippet.publishedAt).getTime() : 0;
        return publishedAt > sub.lastPolledAt!;
      })
    : videos.slice(0, 1); // First poll: only latest video

  console.log(
    `[poll:youtube] Found ${videos.length} videos, ${newVideos.length} are new for ${sub.name}`
  );

  // Ingest new items
  let newItemsCount = 0;
  for (const video of newVideos) {
    try {
      // Cast to the expected type - the transformer handles null checks
      const result = await ingestItem(
        userId,
        sub.id,
        video as youtube_v3.Schema$PlaylistItem,
        Provider.YOUTUBE,
        db as unknown as DrizzleD1Database,
        transformYouTubeVideo as (
          raw: youtube_v3.Schema$PlaylistItem
        ) => ReturnType<typeof transformYouTubeVideo>
      );
      if (result.created) {
        newItemsCount++;
      }
    } catch (ingestError) {
      console.error(`[poll:youtube] Failed to ingest video:`, ingestError);
    }
  }

  // Calculate newest published timestamp from all videos
  const newestPublishedAt =
    videos.length > 0
      ? Math.max(
          ...videos
            .map((v) => (v.snippet?.publishedAt ? new Date(v.snippet.publishedAt).getTime() : 0))
            .filter((t) => t > 0)
        )
      : sub.lastPublishedAt;

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
// Spotify Batch Processing
// ============================================================================

/**
 * Process a batch of Spotify subscriptions.
 *
 * Groups subscriptions by user to share API connections and respect rate limits.
 */
async function processSpotifyBatch(
  subs: Subscription[],
  env: Bindings,
  db: DrizzleDB
): Promise<BatchResult> {
  let processed = 0;
  let newItems = 0;

  if (subs.length === 0) {
    return { processed, newItems };
  }

  // Group by user to share connection
  const byUser = groupBy(subs, 'userId');

  for (const [userId, userSubs] of Object.entries(byUser)) {
    // Check rate limit before processing
    const rateCheck = await isRateLimited('SPOTIFY', userId, env.OAUTH_STATE_KV);
    if (rateCheck.limited) {
      console.log(
        `[poll:spotify] Skipping user ${userId}: rate limited for ${rateCheck.retryInMs}ms`
      );
      continue;
    }

    // Get connection for this user
    const connection = await db.query.providerConnections.findFirst({
      where: and(
        eq(providerConnections.userId, userId),
        eq(providerConnections.provider, 'SPOTIFY'),
        eq(providerConnections.status, 'ACTIVE')
      ),
    });

    if (!connection) {
      console.log(
        `[poll:spotify] No active connection for user ${userId}, marking subscriptions disconnected`
      );
      await markSubscriptionsDisconnected(
        userSubs.map((s) => s.id),
        db
      );
      continue;
    }

    try {
      // Create Spotify client with valid token
      const client = await getSpotifyClientForConnection(
        connection as ProviderConnection,
        env as Parameters<typeof getSpotifyClientForConnection>[1]
      );

      // Process each subscription for this user
      for (const sub of userSubs) {
        try {
          const result = await pollSingleSpotifySubscription(sub, client, userId, env, db);
          processed++;
          newItems += result.newItems;
        } catch (subError) {
          console.error(`[poll:spotify] Error polling subscription ${sub.id}:`, subError);
          // Update lastPolledAt even on error to prevent infinite retry
          await updateSubscriptionPolled(sub.id, db);
          processed++;
        }
      }
    } catch (error: unknown) {
      // Handle auth errors at the user level
      if (isAuthError(error)) {
        console.log(`[poll:spotify] Auth error for user ${userId}, marking connection expired`);
        await markConnectionExpired(connection.id, db);
        await markSubscriptionsDisconnected(
          userSubs.map((s) => s.id),
          db
        );
      } else {
        console.error(`[poll:spotify] Batch error for user ${userId}:`, error);
      }
    }
  }

  return { processed, newItems };
}

/**
 * Poll a single Spotify subscription for new episodes.
 */
async function pollSingleSpotifySubscription(
  sub: Subscription,
  client: SpotifyApi,
  userId: string,
  env: Bindings,
  db: DrizzleDB
): Promise<{ newItems: number }> {
  console.log(`[poll:spotify] Polling subscription ${sub.id} (${sub.name})`);

  // Fetch recent episodes from the show
  const episodes = await getShowEpisodes(client, sub.providerChannelId, MAX_ITEMS_PER_POLL);

  if (episodes.length === 0) {
    console.log(`[poll:spotify] No episodes found for ${sub.name}`);
    await updateSubscriptionPolled(sub.id, db);
    return { newItems: 0 };
  }

  // Filter to new episodes based on lastPolledAt
  const newEpisodes = sub.lastPolledAt
    ? episodes.filter((e) => {
        const releaseDate = parseSpotifyDate(e.releaseDate);
        return releaseDate > sub.lastPolledAt!;
      })
    : episodes.slice(0, 1); // First poll: only latest episode

  console.log(
    `[poll:spotify] Found ${episodes.length} episodes, ${newEpisodes.length} are new for ${sub.name}`
  );

  // Ingest new items
  let newItemsCount = 0;
  for (const episode of newEpisodes) {
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
        sub.id,
        rawEpisode,
        Provider.SPOTIFY,
        db as unknown as DrizzleD1Database,
        (raw) => transformSpotifyEpisode(raw, sub.name)
      );
      if (result.created) {
        newItemsCount++;
      }
    } catch (ingestError) {
      console.error(`[poll:spotify] Failed to ingest episode:`, ingestError);
    }
  }

  // Calculate newest published timestamp from all episodes
  const newestPublishedAt =
    episodes.length > 0
      ? Math.max(...episodes.map((e) => parseSpotifyDate(e.releaseDate)).filter((t) => t > 0))
      : sub.lastPublishedAt;

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
 * Check if an error indicates an authentication failure.
 */
function isAuthError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const err = error as Record<string, unknown>;

  // Check HTTP status codes
  if (err.status === 401 || err.status === 403) {
    return true;
  }

  // Check nested response status
  if (err.response && typeof err.response === 'object') {
    const response = err.response as Record<string, unknown>;
    if (response.status === 401 || response.status === 403) {
      return true;
    }
  }

  // Check error messages
  const message = typeof err.message === 'string' ? err.message.toLowerCase() : '';
  return (
    message.includes('unauthorized') ||
    message.includes('invalid_grant') ||
    message.includes('token expired') ||
    message.includes('access denied')
  );
}

/**
 * Mark subscriptions as disconnected.
 */
async function markSubscriptionsDisconnected(ids: string[], db: DrizzleDB): Promise<void> {
  if (ids.length === 0) return;

  await db
    .update(subscriptions)
    .set({ status: 'DISCONNECTED', updatedAt: Date.now() })
    .where(inArray(subscriptions.id, ids));
}

/**
 * Mark a provider connection as expired.
 */
async function markConnectionExpired(connectionId: string, db: DrizzleDB): Promise<void> {
  await db
    .update(providerConnections)
    .set({ status: 'EXPIRED' })
    .where(eq(providerConnections.id, connectionId));
}

/**
 * Update subscription lastPolledAt (used after errors to prevent infinite retry).
 */
async function updateSubscriptionPolled(subscriptionId: string, db: DrizzleDB): Promise<void> {
  await db
    .update(subscriptions)
    .set({ lastPolledAt: Date.now(), updatedAt: Date.now() })
    .where(eq(subscriptions.id, subscriptionId));
}

/**
 * Group an array of items by a key.
 */
function groupBy<T, K extends keyof T>(items: T[], key: K): Record<string, T[]> {
  return items.reduce(
    (acc, item) => {
      const groupKey = String(item[key]);
      if (!acc[groupKey]) {
        acc[groupKey] = [];
      }
      acc[groupKey].push(item);
      return acc;
    },
    {} as Record<string, T[]>
  );
}

/**
 * Parse Spotify's variable date format into Unix milliseconds.
 *
 * Spotify release_date can be:
 * - YYYY (just year)
 * - YYYY-MM (year-month)
 * - YYYY-MM-DD (full date)
 */
function parseSpotifyDate(dateStr: string): number {
  const normalized =
    dateStr.length === 4 ? `${dateStr}-01-01` : dateStr.length === 7 ? `${dateStr}-01` : dateStr;

  return new Date(`${normalized}T00:00:00Z`).getTime();
}
