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
import { pollLogger } from '../lib/logger';
import { isRateLimited } from '../lib/rate-limiter';
import {
  getYouTubeClientForConnection,
  getChannelUploadsPlaylistId,
  fetchRecentVideos,
  fetchVideoDetails,
  type YouTubeClient,
} from '../providers/youtube';
import { getSpotifyClientForConnection, getShowEpisodes } from '../providers/spotify';
import { ingestItem } from '../ingestion/processor';
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

/** YouTube Shorts are videos ≤ 3 minutes (180 seconds) as of 2024 */
const SHORTS_DURATION_THRESHOLD = 180;

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

/**
 * Provider batch configuration for the generic batch processor.
 * Encapsulates provider-specific behavior for client creation and polling.
 */
interface ProviderBatchConfig<TClient> {
  /** Provider identifier for logging and rate limiting */
  provider: 'YOUTUBE' | 'SPOTIFY';
  /** Create an API client from a provider connection */
  getClient: (connection: ProviderConnection, env: Bindings) => Promise<TClient>;
  /** Poll a single subscription and return new item count */
  pollSingle: (
    sub: Subscription,
    client: TClient,
    userId: string,
    env: Bindings,
    db: DrizzleDB
  ) => Promise<{ newItems: number }>;
}

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
    pollLogger.info('Skipped: lock held by another worker');
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
      pollLogger.info('No subscriptions due for polling');
      return { skipped: false, processed: 0, reason: 'no_due_subscriptions' };
    }

    pollLogger.info('Found due subscriptions', { count: dueSubscriptions.length });

    // 3. Group by provider
    const youtube = dueSubscriptions.filter((s) => s.provider === 'YOUTUBE');
    const spotify = dueSubscriptions.filter((s) => s.provider === 'SPOTIFY');

    pollLogger.info('Subscriptions by provider', {
      youtube: youtube.length,
      spotify: spotify.length,
    });

    // 4. Process each provider's batch in parallel
    const [ytResult, spResult] = await Promise.all([
      processYouTubeBatch(youtube, env, db),
      processSpotifyBatch(spotify, env, db),
    ]);

    const totalProcessed = ytResult.processed + spResult.processed;
    const totalNewItems = ytResult.newItems + spResult.newItems;

    pollLogger.info('Polling complete', { processed: totalProcessed, newItems: totalNewItems });

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
// Generic Provider Batch Processing
// ============================================================================

/**
 * Process a batch of subscriptions for any provider.
 *
 * This generic function encapsulates the shared batch processing logic:
 * 1. Group subscriptions by user to share API connections
 * 2. Check rate limits per user
 * 3. Get active provider connection from DB
 * 4. Create provider client and process each subscription
 * 5. Handle auth errors by marking connections/subscriptions disconnected
 *
 * @param subs - Subscriptions to process
 * @param config - Provider-specific configuration (client creation, polling logic)
 * @param env - Cloudflare Worker bindings
 * @param db - Database instance
 * @returns BatchResult with processed count and new items count
 */
async function processProviderBatch<TClient>(
  subs: Subscription[],
  config: ProviderBatchConfig<TClient>,
  env: Bindings,
  db: DrizzleDB
): Promise<BatchResult> {
  let processed = 0;
  let newItems = 0;

  if (subs.length === 0) {
    return { processed, newItems };
  }

  const providerLower = config.provider.toLowerCase();

  // Group by user to share connection
  const byUser = groupBy(subs, 'userId');

  for (const [userId, userSubs] of Object.entries(byUser)) {
    // Check rate limit before processing
    const rateCheck = await isRateLimited(config.provider, userId, env.OAUTH_STATE_KV);
    if (rateCheck.limited) {
      pollLogger.child(providerLower).info('Skipping user: rate limited', {
        userId,
        retryInMs: rateCheck.retryInMs,
      });
      continue;
    }

    // Get connection for this user
    const connection = await db.query.providerConnections.findFirst({
      where: and(
        eq(providerConnections.userId, userId),
        eq(providerConnections.provider, config.provider),
        eq(providerConnections.status, 'ACTIVE')
      ),
    });

    if (!connection) {
      pollLogger
        .child(providerLower)
        .info('No active connection for user, marking subscriptions disconnected', {
          userId,
        });
      await markSubscriptionsDisconnected(
        userSubs.map((s) => s.id),
        db
      );
      continue;
    }

    try {
      // Create provider client with valid token
      const client = await config.getClient(connection as ProviderConnection, env);

      // Process each subscription for this user
      for (const sub of userSubs) {
        try {
          const result = await config.pollSingle(sub, client, userId, env, db);
          processed++;
          newItems += result.newItems;
        } catch (subError) {
          pollLogger.child(providerLower).error('Error polling subscription', {
            subscriptionId: sub.id,
            error: subError,
          });
          // Update lastPolledAt even on error to prevent infinite retry
          await updateSubscriptionPolled(sub.id, db);
          processed++;
        }
      }
    } catch (error: unknown) {
      // Handle auth errors at the user level
      if (isAuthError(error)) {
        pollLogger.child(providerLower).info('Auth error for user, marking connection expired', {
          userId,
        });
        await markConnectionExpired(connection.id, db);
        await markSubscriptionsDisconnected(
          userSubs.map((s) => s.id),
          db
        );
      } else {
        pollLogger.child(providerLower).error('Batch error for user', { userId, error });
      }
    }
  }

  return { processed, newItems };
}

// ============================================================================
// YouTube Batch Processing
// ============================================================================

/**
 * Process a batch of YouTube subscriptions.
 *
 * Uses the generic batch processor with YouTube-specific configuration.
 */
async function processYouTubeBatch(
  subs: Subscription[],
  env: Bindings,
  db: DrizzleDB
): Promise<BatchResult> {
  return processProviderBatch(
    subs,
    {
      provider: 'YOUTUBE',
      getClient: (connection, env) =>
        getYouTubeClientForConnection(
          connection,
          env as Parameters<typeof getYouTubeClientForConnection>[1]
        ),
      pollSingle: pollSingleYouTubeSubscription,
    },
    env,
    db
  );
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
  const ytLogger = pollLogger.child('youtube');
  ytLogger.info('Polling subscription', { subscriptionId: sub.id, name: sub.name });

  // Get the channel's uploads playlist
  const uploadsPlaylistId = await getChannelUploadsPlaylistId(client, sub.providerChannelId);

  // Fetch recent videos
  const videos = await fetchRecentVideos(client, uploadsPlaylistId, MAX_ITEMS_PER_POLL);

  if (videos.length === 0) {
    ytLogger.info('No videos found', { name: sub.name });
    await updateSubscriptionPolled(sub.id, db);
    return { newItems: 0 };
  }

  // Extract video IDs for details lookup (duration + full description)
  const videoIds = videos.map((v) => v.contentDetails?.videoId).filter((id): id is string => !!id);

  // Fetch video details (duration + full description) in one batched call (1 quota unit)
  // Note: playlistItems.list truncates descriptions to ~160 chars, videos.list gives full description
  const videoDetails = await fetchVideoDetails(client, videoIds);

  // Enrich videos with duration and full description from videos.list API
  const enrichedVideos = videos.map((v) => {
    const details = videoDetails.get(v.contentDetails?.videoId || '');
    return {
      ...v,
      durationSeconds: details?.durationSeconds,
      // Override truncated description with full description from videos.list
      snippet: {
        ...v.snippet,
        description: details?.description ?? v.snippet?.description,
      },
    };
  });

  // Filter out Shorts before processing
  // Videos with undefined duration (API error) are NOT filtered - fail-safe behavior
  const nonShortVideos = enrichedVideos.filter((v) => {
    if (v.durationSeconds === undefined) {
      return true; // Graceful degradation - don't lose content
    }
    return v.durationSeconds > SHORTS_DURATION_THRESHOLD;
  });

  // Log filtering stats
  const filteredCount = enrichedVideos.length - nonShortVideos.length;
  if (filteredCount > 0) {
    ytLogger.info('Filtered Shorts', {
      filtered: filteredCount,
      remaining: nonShortVideos.length,
      name: sub.name,
    });
  }

  // If all videos were Shorts, we're done
  if (nonShortVideos.length === 0) {
    ytLogger.info('All videos were Shorts, nothing to ingest', { name: sub.name });
    await updateSubscriptionPolled(sub.id, db);
    return { newItems: 0 };
  }

  // Filter to new videos based on lastPolledAt
  const newVideos = sub.lastPolledAt
    ? nonShortVideos.filter((v) => {
        const publishedAt = v.snippet?.publishedAt ? new Date(v.snippet.publishedAt).getTime() : 0;
        return publishedAt > sub.lastPolledAt!;
      })
    : nonShortVideos.slice(0, 1); // First poll: only latest video

  ytLogger.info('Found videos', {
    total: videos.length,
    afterShortsFilter: nonShortVideos.length,
    new: newVideos.length,
    name: sub.name,
  });

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
      ytLogger.error('Failed to ingest video', { error: ingestError });
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
 * Uses the generic batch processor with Spotify-specific configuration.
 */
async function processSpotifyBatch(
  subs: Subscription[],
  env: Bindings,
  db: DrizzleDB
): Promise<BatchResult> {
  return processProviderBatch(
    subs,
    {
      provider: 'SPOTIFY',
      getClient: (connection, env) =>
        getSpotifyClientForConnection(
          connection,
          env as Parameters<typeof getSpotifyClientForConnection>[1]
        ),
      pollSingle: pollSingleSpotifySubscription,
    },
    env,
    db
  );
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
  const spotifyLogger = pollLogger.child('spotify');
  spotifyLogger.info('Polling subscription', { subscriptionId: sub.id, name: sub.name });

  // Fetch recent episodes from the show
  const episodes = await getShowEpisodes(client, sub.providerChannelId, MAX_ITEMS_PER_POLL);

  if (episodes.length === 0) {
    spotifyLogger.info('No episodes found', { name: sub.name });
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

  spotifyLogger.info('Found episodes', {
    total: episodes.length,
    new: newEpisodes.length,
    name: sub.name,
  });

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
        (raw: typeof rawEpisode) => transformSpotifyEpisode(raw, sub.name)
      );
      if (result.created) {
        newItemsCount++;
      }
    } catch (ingestError) {
      spotifyLogger.error('Failed to ingest episode', { error: ingestError });
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
