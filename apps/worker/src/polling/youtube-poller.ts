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
 * - Identifies new videos based on lastPolledAt
 *
 * @see /features/subscriptions/backend-spec.md Section 3: Polling Architecture
 */

import { eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { Provider } from '@zine/shared';
import type { youtube_v3 } from 'googleapis';
import { subscriptions } from '../db/schema';
import { pollLogger } from '../lib/logger';
import {
  getYouTubeClientForConnection,
  getUploadsPlaylistId,
  fetchRecentVideos,
  fetchVideoDetails,
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
} from './types';
import { MAX_ITEMS_PER_POLL, SHORTS_DURATION_THRESHOLD } from './types';
import {
  serializeError,
  createPollingError,
  formatPollingErrorLegacy,
  type PollingError,
} from '../utils/error-utils';

// ============================================================================
// Logger
// ============================================================================

const ytLogger = pollLogger.child('youtube');

// ============================================================================
// Date Parsing Utilities
// ============================================================================

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

// ============================================================================
// Provider Configuration
// ============================================================================

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

// ============================================================================
// Main Polling Function
// ============================================================================

/**
 * Poll a single YouTube subscription for new videos.
 *
 * Process:
 * 1. Get channel's uploads playlist ID
 * 2. Fetch recent videos from playlist
 * 3. Fetch video details (duration + full description) in batch
 * 4. Filter out YouTube Shorts (≤ 3 min)
 * 5. Identify new videos based on lastPolledAt
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
  ytLogger.info('Polling subscription', { subscriptionId: sub.id, name: sub.name });

  // Get the channel's uploads playlist (deterministic, no API call needed)
  const uploadsPlaylistId = getUploadsPlaylistId(sub.providerChannelId);

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
  const enrichedVideos = enrichVideosWithDetails(videos, videoDetails);

  // Filter out Shorts before processing
  const nonShortVideos = filterOutShorts(enrichedVideos, sub.name);

  // If all videos were Shorts, we're done
  if (nonShortVideos.length === 0) {
    ytLogger.info('All videos were Shorts, nothing to ingest', { name: sub.name });
    await updateSubscriptionPolled(sub.id, db);
    return { newItems: 0 };
  }

  // Filter to new videos based on lastPolledAt
  const newVideos = filterNewVideos(nonShortVideos, sub.lastPolledAt, sub.name);

  ytLogger.info('Found videos', {
    total: videos.length,
    afterShortsFilter: nonShortVideos.length,
    new: newVideos.length,
    name: sub.name,
  });

  // Ingest new items
  const newItemsCount = await ingestNewVideos(newVideos, userId, sub.id, sub.imageUrl, db);

  // Calculate newest published timestamp from all videos
  const newestPublishedAt = calculateNewestPublishedAt(videos, sub.lastPublishedAt);

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
 * Enriched video type with duration from videos.list API
 */
interface EnrichedVideo extends youtube_v3.Schema$PlaylistItem {
  durationSeconds?: number;
}

/**
 * Enrich videos with duration and full description from videos.list API.
 *
 * The playlistItems.list API truncates descriptions to ~160 chars,
 * so we fetch full details via videos.list API and merge them.
 */
function enrichVideosWithDetails(
  videos: youtube_v3.Schema$PlaylistItem[],
  videoDetails: Map<string, { durationSeconds: number; description: string }>
): EnrichedVideo[] {
  return videos.map((v) => {
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
}

/**
 * Filter out YouTube Shorts from video list.
 *
 * Shorts are videos ≤ 3 minutes (180 seconds) as of 2024.
 * Videos with undefined duration (API error) are NOT filtered - fail-safe behavior.
 */
function filterOutShorts(videos: EnrichedVideo[], subscriptionName: string): EnrichedVideo[] {
  const nonShortVideos = videos.filter((v) => {
    if (v.durationSeconds === undefined) {
      return true; // Graceful degradation - don't lose content
    }
    return v.durationSeconds > SHORTS_DURATION_THRESHOLD;
  });

  // Log filtering stats
  const filteredCount = videos.length - nonShortVideos.length;
  if (filteredCount > 0) {
    ytLogger.info('Filtered Shorts', {
      filtered: filteredCount,
      remaining: nonShortVideos.length,
      name: subscriptionName,
    });
  }

  return nonShortVideos;
}

/**
 * Filter videos to only those published after lastPolledAt.
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
 * @returns Videos that are new (published after lastPolledAt) with valid dates
 */
function filterNewVideos(
  videos: EnrichedVideo[],
  lastPolledAt: number | null,
  subscriptionName?: string
): EnrichedVideo[] {
  // Track invalid dates for logging
  let invalidDateCount = 0;

  // Filter to videos with valid dates
  const validVideos = videos.filter((v) => {
    const publishedAt = parseYouTubeDate(v.snippet?.publishedAt);

    if (publishedAt === null) {
      invalidDateCount++;
      ytLogger.warn('Video missing or invalid publishedAt', {
        videoId: v.contentDetails?.videoId || v.id,
        publishedAt: v.snippet?.publishedAt,
        subscriptionName,
      });
      return false;
    }

    return true;
  });

  // Log summary if we filtered out invalid dates
  if (invalidDateCount > 0) {
    ytLogger.info('Videos with invalid dates filtered', {
      subscriptionName,
      invalidCount: invalidDateCount,
      totalVideos: videos.length,
      validVideos: validVideos.length,
    });
  }

  // First poll (no lastPolledAt): return only the latest video
  if (!lastPolledAt) {
    return validVideos.slice(0, 1);
  }

  // Filter to videos published after lastPolledAt
  return validVideos.filter((v) => {
    // We know publishedAt is valid here since we filtered above
    const publishedAt = parseYouTubeDate(v.snippet?.publishedAt)!;
    return publishedAt > lastPolledAt;
  });
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
        db as unknown as DrizzleD1Database,
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
 * Update subscription lastPolledAt (used after errors or when no new items).
 */
async function updateSubscriptionPolled(subscriptionId: string, db: DrizzleDB): Promise<void> {
  await db
    .update(subscriptions)
    .set({ lastPolledAt: Date.now(), updatedAt: Date.now() })
    .where(eq(subscriptions.id, subscriptionId));
}

// ============================================================================
// Batched Polling (Parallel + Cross-Subscription Batching)
// ============================================================================

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
          const videos = await fetchRecentVideos(client, uploadsPlaylistId, MAX_ITEMS_PER_POLL);
          return { subscription: sub, videos };
        } catch (error) {
          const serialized = serializeError(error);
          ytLogger.error('Failed to fetch playlist', {
            subscriptionId: sub.id,
            name: sub.name,
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
          channelName: result.subscription.name,
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
  const videoDetails = await fetchVideoDetailsBatched(client, allVideoIds);

  // Step 4: Process each subscription with the pre-fetched video details
  let totalNewItems = 0;

  for (const result of playlistResults) {
    // Skip subscriptions that failed to fetch
    if (result.error) {
      continue;
    }

    try {
      const newItems = await processSubscriptionVideos(
        result.subscription,
        result.videos,
        videoDetails,
        userId,
        db
      );
      totalNewItems += newItems;
    } catch (error) {
      const pollingError = createPollingError(result.subscription.id, error, {
        channelId: result.subscription.providerChannelId,
        channelName: result.subscription.name,
        userId,
        operation: 'processSubscriptionVideos',
      });
      ytLogger.error('Failed to process subscription videos', {
        subscriptionId: result.subscription.id,
        name: result.subscription.name,
        error: pollingError.error,
        errorType: pollingError.errorType,
        context: pollingError.context,
      });
      pollingErrors.push(pollingError);
    }
  }

  ytLogger.info('Batch polling complete', {
    processed: playlistResults.length,
    totalNewItems,
    errors: pollingErrors.length,
  });

  return {
    newItems: totalNewItems,
    processed: playlistResults.length,
    skipped: 0, // YouTube doesn't have delta detection
    errors: pollingErrors.length > 0 ? pollingErrors.map(formatPollingErrorLegacy) : undefined,
  };
}

/**
 * Process videos for a single subscription using pre-fetched video details.
 *
 * This helper handles:
 * 1. Enriching videos with duration and full description
 * 2. Filtering out Shorts
 * 3. Filtering to new videos based on lastPolledAt
 * 4. Ingesting new items
 * 5. Updating subscription metadata
 *
 * @param sub - Subscription being processed
 * @param videos - Raw playlist items from fetchRecentVideos
 * @param videoDetails - Pre-fetched video details map
 * @param userId - User ID owning the subscription
 * @param db - Database instance
 * @returns Number of new items ingested
 */
async function processSubscriptionVideos(
  sub: Subscription,
  videos: youtube_v3.Schema$PlaylistItem[],
  videoDetails: Map<string, VideoDetails>,
  userId: string,
  db: DrizzleDB
): Promise<number> {
  if (videos.length === 0) {
    ytLogger.info('No videos found', { name: sub.name });
    await updateSubscriptionPolled(sub.id, db);
    return 0;
  }

  // Enrich videos with details from the pre-fetched map
  const enrichedVideos = enrichVideosWithDetailsMap(videos, videoDetails);

  // Filter out Shorts
  const nonShortVideos = filterOutShorts(enrichedVideos, sub.name);

  if (nonShortVideos.length === 0) {
    ytLogger.info('All videos were Shorts, nothing to ingest', { name: sub.name });
    await updateSubscriptionPolled(sub.id, db);
    return 0;
  }

  // Filter to new videos based on lastPolledAt
  const newVideos = filterNewVideos(nonShortVideos, sub.lastPolledAt, sub.name);

  ytLogger.info('Found videos', {
    total: videos.length,
    afterShortsFilter: nonShortVideos.length,
    new: newVideos.length,
    name: sub.name,
  });

  // Ingest new items
  const newItemsCount = await ingestNewVideos(newVideos, userId, sub.id, sub.imageUrl, db);

  // Calculate newest published timestamp
  const newestPublishedAt = calculateNewestPublishedAt(videos, sub.lastPublishedAt);

  // Update subscription
  await db
    .update(subscriptions)
    .set({
      lastPolledAt: Date.now(),
      lastPublishedAt: newestPublishedAt || undefined,
      updatedAt: Date.now(),
    })
    .where(eq(subscriptions.id, sub.id));

  return newItemsCount;
}

/**
 * Enrich videos with duration and full description from a pre-fetched details map.
 *
 * Similar to enrichVideosWithDetails but uses the cross-subscription batched map.
 */
function enrichVideosWithDetailsMap(
  videos: youtube_v3.Schema$PlaylistItem[],
  videoDetails: Map<string, VideoDetails>
): EnrichedVideo[] {
  return videos.map((v) => {
    const details = videoDetails.get(v.contentDetails?.videoId || '');
    return {
      ...v,
      durationSeconds: details?.durationSeconds,
      snippet: {
        ...v.snippet,
        description: details?.description ?? v.snippet?.description,
      },
    };
  });
}
