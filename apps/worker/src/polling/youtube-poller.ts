/**
 * YouTube Polling Provider
 *
 * Handles polling YouTube channels for new videos.
 * Extracts YouTube-specific logic from the main scheduler.
 *
 * Key features:
 * - Fetches recent videos from channel's uploads playlist
 * - Enriches videos with duration and full description
 * - Filters out YouTube Shorts (videos ≤ 3 minutes)
 * - Reconciles an overlap window using ingestion idempotency
 *
 * @see /features/subscriptions/backend-spec.md Section 3: Polling Architecture
 */

import { and, eq, inArray } from 'drizzle-orm';
import { Provider, YOUTUBE_SHORTS_MAX_DURATION_SECONDS } from '@zine/shared';
import type { Database } from '../db';
import type { youtube_v3 } from 'googleapis';
import { subscriptions, creators, providerItemsSeen } from '../db/schema';
import { pollLogger } from '../lib/logger';
import {
  getYouTubeClientForConnection,
  getUploadsPlaylistId,
  fetchVideosForReconciliation,
  YOUTUBE_POLL_OVERLAP_MS,
  fetchVideoDetailsBatched,
  type YouTubeClient,
  type VideoDetails,
} from '../providers/youtube';
import { ingestItem } from '../ingestion/processor';
import { transformYouTubeVideo } from '../ingestion/transformers';
import type { Bindings } from '../types';
import type { ProviderConnection } from '../lib/token-refresh';
import type {
  Subscription,
  DrizzleDB,
  PollingResult,
  BatchPollingResult,
  ProviderBatchConfig,
  ProviderConnectionRow,
  YouTubeSkipMetrics,
} from './types';
import {
  createEmptyYouTubeSkipMetrics,
  aggregateYouTubeSkipMetrics,
  getTotalSkipCount,
} from './types';
import {
  serializeError,
  createPollingError,
  toPollingErrorEntry,
  type PollingError,
} from '../utils/error-utils';

// Logger
const ytLogger = pollLogger.child('youtube');

// Date Parsing Utilities

/**
 * Parse a YouTube date string into a Unix timestamp.
 *
 * Handles edge cases:
 * - Missing/undefined date strings return null
 * - Invalid date strings that produce NaN return null
 * - Valid ISO 8601 dates return the timestamp in milliseconds
 *
 * @param dateString - The date string from YouTube API (ISO 8601 format)
 * @returns Unix timestamp in milliseconds, or null if invalid/missing
 */
export function parseYouTubeDate(dateString: string | undefined | null): number | null {
  if (!dateString) {
    return null;
  }

  const parsed = new Date(dateString).getTime();

  if (Number.isNaN(parsed)) {
    return null;
  }

  return parsed;
}

// Provider Configuration

/**
 * YouTube provider batch configuration.
 * Used by the generic batch processor in scheduler.ts.
 */
export const youtubeProviderConfig: ProviderBatchConfig<YouTubeClient> = {
  provider: 'YOUTUBE',
  getClient: (connection: ProviderConnectionRow, env: Bindings) =>
    getYouTubeClientForConnection(
      connection as ProviderConnection,
      env as Parameters<typeof getYouTubeClientForConnection>[1]
    ),
  pollSingle: pollSingleYouTubeSubscription,
  pollBatch: pollYouTubeSubscriptionsBatched,
};

// Main Polling Function

/**
 * Poll a single YouTube subscription for new videos.
 *
 * Process:
 * 1. Get channel's uploads playlist ID
 * 2. Fetch recent videos from playlist
 * 3. Fetch video details (duration + full description) in batch
 * 4. Filter out YouTube Shorts (≤ 3 min)
 * 5. Reconcile released videos in the overlap window
 * 6. Ingest new videos
 * 7. Update subscription metadata
 *
 * @param sub - Subscription to poll
 * @param client - Authenticated YouTube client
 * @param userId - User ID owning the subscription
 * @param env - Cloudflare Worker bindings
 * @param db - Database instance
 * @returns PollingResult with new item count
 */
export async function pollSingleYouTubeSubscription(
  sub: Subscription,
  client: YouTubeClient,
  userId: string,
  env: Bindings,
  db: DrizzleDB
): Promise<PollingResult> {
  const videos = await fetchVideosForReconciliation(
    client,
    getUploadsPlaylistId(sub.providerChannelId),
    reconciliationSince(sub)
  );
  const ids = videos.map((v) => v.contentDetails?.videoId).filter((id): id is string => !!id);
  const details = await fetchVideoDetailsBatched(client, ids, 3, true);
  return processSubscriptionVideos(sub, videos, details, userId, db);
}

function reconciliationSince(sub: Subscription): number {
  return Math.max(sub.createdAt, (sub.lastPolledAt || Date.now()) - YOUTUBE_POLL_OVERLAP_MS);
}

// Helper Functions

/**
 * Enriched video type with duration from videos.list API
 */
interface EnrichedVideo extends youtube_v3.Schema$PlaylistItem {
  durationSeconds?: number;
}

/**
 * Result of filtering with skip metrics.
 */
interface FilterResult<T> {
  /** Filtered items that passed the filter */
  filtered: T[];
  /** Skip metrics tracking why items were filtered */
  skipMetrics: YouTubeSkipMetrics;
}

/**
 * Filter out YouTube Shorts from video list.
 *
 * Shorts are videos ≤ 3 minutes (180 seconds) as of 2024.
 * Videos with undefined duration (API error) are NOT filtered - fail-safe behavior.
 *
 * @returns Object containing filtered videos and skip metrics
 */
function filterOutShorts(
  videos: EnrichedVideo[],
  subscriptionName: string
): FilterResult<EnrichedVideo> {
  const skipMetrics = createEmptyYouTubeSkipMetrics();

  const filtered = videos.filter((v) => {
    if (v.durationSeconds === undefined) {
      return true; // Graceful degradation - don't lose content
    }
    if (v.durationSeconds <= YOUTUBE_SHORTS_MAX_DURATION_SECONDS) {
      skipMetrics.shortsFiltered++;
      return false;
    }
    return true;
  });

  // Log filtering stats
  if (skipMetrics.shortsFiltered > 0) {
    ytLogger.info('Filtered Shorts', {
      filtered: skipMetrics.shortsFiltered,
      remaining: filtered.length,
      name: subscriptionName,
    });
  }

  return { filtered, skipMetrics };
}

/**
 * Select released videos in the reconciliation window.
 *
 * Edge cases handled:
 * - Missing/invalid dates: Videos without valid publishedAt are logged and skipped
 *   (they can't be properly ordered in the inbox)
 * - First poll (lastPolledAt = null/0): Return only the latest video with a valid date
 * - NaN prevention: parseYouTubeDate explicitly returns null for invalid dates
 *
 * @param videos - Videos to filter
 * @param lastPolledAt - Timestamp of last poll, or null for first poll
 * @param subscriptionName - Name of subscription for logging context
 * @param existingSkipMetrics - Optional existing skip metrics to add to
 * @returns Object containing filtered videos and updated skip metrics
 */
function filterNewVideos(
  videos: EnrichedVideo[],
  lastPolledAt: number | null,
  subscriptionName?: string,
  existingSkipMetrics?: YouTubeSkipMetrics
): FilterResult<EnrichedVideo> {
  const skipMetrics = existingSkipMetrics
    ? { ...existingSkipMetrics }
    : createEmptyYouTubeSkipMetrics();

  // Filter to videos with valid dates
  const validVideos = videos.filter((v) => {
    const publishedAt = parseYouTubeDate(v.snippet?.publishedAt);

    if (publishedAt === null) {
      skipMetrics.invalidDate++;
      ytLogger.warn('Video missing or invalid publishedAt', {
        videoId: v.contentDetails?.videoId || v.id,
        publishedAt: v.snippet?.publishedAt,
        subscriptionName,
      });
      return false;
    }

    return publishedAt <= Date.now();
  });

  // Log summary if we filtered out invalid dates
  if (skipMetrics.invalidDate > 0) {
    ytLogger.info('Videos with invalid dates filtered', {
      subscriptionName,
      invalidCount: skipMetrics.invalidDate,
      totalVideos: videos.length,
      validVideos: validVideos.length,
    });
  }

  // First poll (no lastPolledAt): return only the latest video
  if (!lastPolledAt) {
    return { filtered: validVideos.slice(0, 1), skipMetrics };
  }

  // Reconcile inclusive publication boundary; seen IDs prevent duplicate delivery
  const filtered = validVideos.filter((v) => {
    // We know publishedAt is valid here since we filtered above
    const publishedAt = parseYouTubeDate(v.snippet?.publishedAt)!;
    return publishedAt >= lastPolledAt && publishedAt <= Date.now();
  });

  return { filtered, skipMetrics };
}

/**
 * Ingest new videos into the database.
 * Returns the count of successfully created items.
 */
async function ingestNewVideos(
  videos: EnrichedVideo[],
  userId: string,
  subscriptionId: string,
  channelImageUrl: string | null,
  db: DrizzleDB
): Promise<number> {
  let newItemsCount = 0;

  for (const video of videos) {
    try {
      // Cast to the expected type - the transformer handles null checks
      const result = await ingestItem(
        userId,
        subscriptionId,
        video as youtube_v3.Schema$PlaylistItem,
        Provider.YOUTUBE,
        db as Database,
        (raw: youtube_v3.Schema$PlaylistItem) =>
          transformYouTubeVideo(
            raw as Parameters<typeof transformYouTubeVideo>[0],
            channelImageUrl ?? undefined
          )
      );
      if (result.created) {
        newItemsCount++;
      }
    } catch (ingestError) {
      const serialized = serializeError(ingestError);
      ytLogger.error('Failed to ingest video', {
        videoId: video.contentDetails?.videoId,
        videoTitle: video.snippet?.title,
        error: serialized,
        errorType: serialized.type,
        errorStack: serialized.stack,
      });
      throw ingestError;
    }
  }

  return newItemsCount;
}

/**
 * Calculate the newest published timestamp from a list of videos.
 * Used to update subscription.lastPublishedAt.
 *
 * Uses parseYouTubeDate for consistent date handling:
 * - Invalid/missing dates are filtered out
 * - Only valid timestamps are considered for the max calculation
 */
function calculateNewestPublishedAt(
  videos: youtube_v3.Schema$PlaylistItem[],
  fallback: number | null
): number | null {
  if (videos.length === 0) {
    return fallback;
  }

  const timestamps = videos
    .map((v) => parseYouTubeDate(v.snippet?.publishedAt))
    .filter((t): t is number => t !== null);

  return timestamps.length > 0 ? Math.max(...timestamps) : fallback;
}

/**
 * Mark a successful empty poll. Failed polls must retain the prior cutoff.
 */
async function updateSubscriptionPolled(subscriptionId: string, db: DrizzleDB): Promise<void> {
  await db
    .update(subscriptions)
    .set({ lastPolledAt: Date.now(), updatedAt: Date.now() })
    .where(eq(subscriptions.id, subscriptionId));
}

// Batched Polling (Parallel + Cross-Subscription Batching)

/**
 * Cloudflare Workers limit for concurrent outbound connections.
 * We use 6 to stay safely within limits.
 */
const BATCH_CONCURRENCY = 6;

/**
 * Result from parallel playlist fetch for a single subscription.
 */
interface PlaylistFetchResult {
  subscription: Subscription;
  videos: youtube_v3.Schema$PlaylistItem[];
  error?: Error;
}

/**
 * Fetch playlists in parallel, processing subscriptions in waves.
 *
 * Cloudflare Workers have a limit of 6 concurrent outbound connections,
 * so we process in waves of 6 subscriptions at a time.
 *
 * @param subs - Subscriptions to fetch playlists for
 * @param client - Authenticated YouTube client
 * @returns Array of PlaylistFetchResult (one per subscription)
 */
async function fetchPlaylistsInParallel(
  subs: Subscription[],
  client: YouTubeClient
): Promise<PlaylistFetchResult[]> {
  const results: PlaylistFetchResult[] = [];

  for (let i = 0; i < subs.length; i += BATCH_CONCURRENCY) {
    const wave = subs.slice(i, i + BATCH_CONCURRENCY);
    const waveResults = await Promise.all(
      wave.map(async (sub): Promise<PlaylistFetchResult> => {
        try {
          const uploadsPlaylistId = getUploadsPlaylistId(sub.providerChannelId);
          const videos = await fetchVideosForReconciliation(
            client,
            uploadsPlaylistId,
            reconciliationSince(sub)
          );
          return { subscription: sub, videos };
        } catch (error) {
          const serialized = serializeError(error);
          ytLogger.error('Failed to fetch playlist', {
            subscriptionId: sub.id,
            channelId: sub.providerChannelId,
            error: serialized,
            errorType: serialized.type,
          });
          return { subscription: sub, videos: [], error: error as Error };
        }
      })
    );
    results.push(...waveResults);
  }

  return results;
}

/**
 * Poll multiple YouTube subscriptions in a single batch.
 *
 * This optimized function processes multiple subscriptions efficiently using:
 * 1. Parallel playlist fetches (waves of 6 due to CF connection limit)
 * 2. Cross-subscription video detail batching (50 videos per API call)
 *
 * Performance comparison for 20 subscriptions:
 * - Sequential: 40 API calls, ~20 seconds
 * - Batched: 24 API calls, ~4 seconds (40% fewer calls, 80% faster)
 *
 * @param subs - Subscriptions to poll (all belong to the same user)
 * @param client - Authenticated YouTube client
 * @param userId - User ID owning these subscriptions
 * @param env - Cloudflare Worker bindings
 * @param db - Database instance
 * @returns BatchPollingResult with aggregated metrics
 */
export async function pollYouTubeSubscriptionsBatched(
  subs: Subscription[],
  client: YouTubeClient,
  userId: string,
  env: Bindings,
  db: DrizzleDB
): Promise<BatchPollingResult> {
  ytLogger.info('Batch polling subscriptions', { count: subs.length, userId });

  const pollingErrors: PollingError[] = [];

  // Step 1: Fetch all playlists in parallel (waves of 6)
  const playlistResults = await fetchPlaylistsInParallel(subs, client);

  // Collect errors from playlist fetches
  for (const result of playlistResults) {
    if (result.error) {
      pollingErrors.push(
        createPollingError(result.subscription.id, result.error, {
          channelId: result.subscription.providerChannelId,
          userId,
          operation: 'fetchPlaylist',
        })
      );
    }
  }

  // Step 2: Collect ALL video IDs across subscriptions for batched details fetch
  const allVideoIds: string[] = [];
  for (const result of playlistResults) {
    const ids = result.videos
      .map((v) => v.contentDetails?.videoId)
      .filter((id): id is string => !!id);
    allVideoIds.push(...ids);
  }

  ytLogger.info('Collected video IDs for batch details fetch', {
    totalVideos: allVideoIds.length,
    subscriptions: playlistResults.length,
  });

  // Step 3: Fetch video details in batched calls (50 per call)
  // This is the key optimization: instead of 1 call per subscription,
  // we batch all videos across subscriptions
  const videoDetails = await fetchVideoDetailsBatched(client, [...new Set(allVideoIds)], 3, true);

  // Step 4: Process each subscription with the pre-fetched video details
  let totalNewItems = 0;
  const allSkipMetrics: YouTubeSkipMetrics[] = [];

  for (const result of playlistResults) {
    // Skip subscriptions that failed to fetch
    if (result.error) {
      continue;
    }

    try {
      const processResult = await processSubscriptionVideos(
        result.subscription,
        result.videos,
        videoDetails,
        userId,
        db
      );
      totalNewItems += processResult.newItems;
      allSkipMetrics.push(processResult.skipMetrics);
    } catch (error) {
      const pollingError = createPollingError(result.subscription.id, error, {
        channelId: result.subscription.providerChannelId,
        userId,
        operation: 'processSubscriptionVideos',
      });
      ytLogger.error('Failed to process subscription videos', {
        subscriptionId: result.subscription.id,
        channelId: result.subscription.providerChannelId,
        error: pollingError.error,
        errorType: pollingError.errorType,
        context: pollingError.context,
      });
      pollingErrors.push(pollingError);
    }
  }

  // Aggregate skip metrics across all subscriptions
  const aggregatedSkipMetrics = aggregateYouTubeSkipMetrics(allSkipMetrics);
  const totalSkipped = getTotalSkipCount(aggregatedSkipMetrics);

  ytLogger.info('Batch polling complete', {
    processed: playlistResults.length,
    totalNewItems,
    errors: pollingErrors.length,
    skipMetrics: aggregatedSkipMetrics,
    totalSkipped,
  });

  return {
    newItems: totalNewItems,
    processed: playlistResults.length,
    skipped: totalSkipped,
    errors: pollingErrors.length > 0 ? pollingErrors.map(toPollingErrorEntry) : undefined,
    youtubeSkipMetrics: aggregatedSkipMetrics,
  };
}

/**
 * Result of processing a subscription's videos.
 * Includes both new item count and skip metrics.
 */
interface SubscriptionProcessResult {
  /** Number of new items ingested */
  newItems: number;
  /** Skip metrics for this subscription */
  skipMetrics: YouTubeSkipMetrics;
}

/**
 * Process videos for a single subscription using pre-fetched video details.
 *
 * This helper handles:
 * 1. Enriching videos with duration and full description
 * 2. Filtering out Shorts
 * 3. Select released videos in the overlap window
 * 4. Ingesting new items
 * 5. Updating subscription metadata
 *
 * @param sub - Subscription being processed
 * @param videos - Raw playlist items from fetchRecentVideos
 * @param videoDetails - Pre-fetched video details map
 * @param userId - User ID owning the subscription
 * @param db - Database instance
 * @returns Object containing new items count and skip metrics
 */
async function processSubscriptionVideos(
  sub: Subscription,
  videos: youtube_v3.Schema$PlaylistItem[],
  videoDetails: Map<string, VideoDetails>,
  userId: string,
  db: DrizzleDB
): Promise<SubscriptionProcessResult> {
  // Fetch creator data for logging and ingestion
  const creator = sub.creatorId
    ? await db.query.creators.findFirst({ where: eq(creators.id, sub.creatorId) })
    : null;
  const creatorName = creator?.name ?? sub.providerChannelId;
  const creatorImageUrl = creator?.imageUrl ?? null;

  if (videos.length === 0) {
    ytLogger.info('No videos found', { name: creatorName });
    await updateSubscriptionPolled(sub.id, db);
    return { newItems: 0, skipMetrics: createEmptyYouTubeSkipMetrics() };
  }

  // Enrich videos with details from the pre-fetched map
  const enrichedVideos = enrichVideosWithDetailsMap(videos, videoDetails);

  // Filter out Shorts (returns skip metrics)
  const shortsFilterResult = filterOutShorts(enrichedVideos, creatorName);
  shortsFilterResult.skipMetrics.unavailable = videos.length - enrichedVideos.length;

  if (shortsFilterResult.filtered.length === 0) {
    ytLogger.info('All videos were Shorts, nothing to ingest', {
      name: creatorName,
      skipMetrics: shortsFilterResult.skipMetrics,
    });
    await updateSubscriptionPolled(sub.id, db);
    return { newItems: 0, skipMetrics: shortsFilterResult.skipMetrics };
  }

  // Reconcile the overlap; ingestion deduplicates previously delivered videos.
  const newVideosResult = filterNewVideos(
    shortsFilterResult.filtered,
    sub.lastPolledAt ? reconciliationSince(sub) : null,
    creatorName,
    shortsFilterResult.skipMetrics
  );

  ytLogger.info('Found videos', {
    total: videos.length,
    afterShortsFilter: shortsFilterResult.filtered.length,
    new: newVideosResult.filtered.length,
    name: creatorName,
    skipMetrics: newVideosResult.skipMetrics,
  });

  // Repeated overlap polls must not spend multiple D1 requests per seen item.
  // The ingestion pipeline still protects the remaining writes against races.
  const seenIDs = new Set<string>();
  const candidates = newVideosResult.filtered;
  const ids = candidates.map((v) => v.contentDetails?.videoId).filter((id): id is string => !!id);
  for (let offset = 0; offset < ids.length; offset += 80) {
    const seen = await db
      .select({ providerItemId: providerItemsSeen.providerItemId })
      .from(providerItemsSeen)
      .where(
        and(
          eq(providerItemsSeen.userId, userId),
          eq(providerItemsSeen.provider, Provider.YOUTUBE),
          inArray(providerItemsSeen.providerItemId, ids.slice(offset, offset + 80))
        )
      );
    for (const row of seen) seenIDs.add(row.providerItemId);
  }
  newVideosResult.skipMetrics.alreadySeen += seenIDs.size;
  const unseen = candidates.filter((video) => !seenIDs.has(video.contentDetails?.videoId ?? ''));
  const newItemsCount = await ingestNewVideos(unseen, userId, sub.id, creatorImageUrl, db);

  // Calculate newest published timestamp
  const newestPublishedAt = calculateNewestPublishedAt(
    newVideosResult.filtered,
    sub.lastPublishedAt
  );

  // Update subscription
  await db
    .update(subscriptions)
    .set({
      lastPolledAt: Date.now(),
      lastPublishedAt: newestPublishedAt || undefined,
      updatedAt: Date.now(),
    })
    .where(eq(subscriptions.id, sub.id));

  return { newItems: newItemsCount, skipMetrics: newVideosResult.skipMetrics };
}

/**
 * Enrich videos with duration and full description from a pre-fetched details map.
 *
 * Use actual publication dates and exclude videos unavailable in videos.list.
 */
function enrichVideosWithDetailsMap(
  videos: youtube_v3.Schema$PlaylistItem[],
  videoDetails: Map<string, VideoDetails>
): EnrichedVideo[] {
  return videos
    .filter(
      (v) =>
        videoDetails.has(v.contentDetails?.videoId ?? '') && v.status?.privacyStatus !== 'private'
    )
    .map((v) => {
      const details = videoDetails.get(v.contentDetails?.videoId || '');
      return {
        ...v,
        contentDetails: {
          ...v.contentDetails,
          videoPublishedAt: details?.publishedAt ?? v.contentDetails?.videoPublishedAt,
        },
        durationSeconds: details?.durationSeconds,
        snippet: {
          ...v.snippet,
          publishedAt:
            details?.publishedAt ?? v.contentDetails?.videoPublishedAt ?? v.snippet?.publishedAt,
          description: details?.description ?? v.snippet?.description,
        },
      };
    });
}
