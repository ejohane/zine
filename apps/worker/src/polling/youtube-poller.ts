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
  getChannelUploadsPlaylistId,
  fetchRecentVideos,
  fetchVideoDetails,
  type YouTubeClient,
} from '../providers/youtube';
import { ingestItem } from '../ingestion/processor';
import { transformYouTubeVideo } from '../ingestion/transformers';
import type { Bindings } from '../types';
import type { ProviderConnection } from '../lib/token-refresh';
import type {
  Subscription,
  DrizzleDB,
  PollingResult,
  ProviderBatchConfig,
  ProviderConnectionRow,
} from './types';
import { MAX_ITEMS_PER_POLL, SHORTS_DURATION_THRESHOLD } from './types';

// ============================================================================
// Logger
// ============================================================================

const ytLogger = pollLogger.child('youtube');

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
  const newVideos = filterNewVideos(nonShortVideos, sub.lastPolledAt);

  ytLogger.info('Found videos', {
    total: videos.length,
    afterShortsFilter: nonShortVideos.length,
    new: newVideos.length,
    name: sub.name,
  });

  // Ingest new items
  const newItemsCount = await ingestNewVideos(newVideos, userId, sub.id, db);

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
 * For first poll (no lastPolledAt), return only the latest video.
 */
function filterNewVideos(videos: EnrichedVideo[], lastPolledAt: number | null): EnrichedVideo[] {
  if (lastPolledAt) {
    return videos.filter((v) => {
      const publishedAt = v.snippet?.publishedAt ? new Date(v.snippet.publishedAt).getTime() : 0;
      return publishedAt > lastPolledAt;
    });
  }
  // First poll: only latest video
  return videos.slice(0, 1);
}

/**
 * Ingest new videos into the database.
 * Returns the count of successfully created items.
 */
async function ingestNewVideos(
  videos: EnrichedVideo[],
  userId: string,
  subscriptionId: string,
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

  return newItemsCount;
}

/**
 * Calculate the newest published timestamp from a list of videos.
 * Used to update subscription.lastPublishedAt.
 */
function calculateNewestPublishedAt(
  videos: youtube_v3.Schema$PlaylistItem[],
  fallback: number | null
): number | null {
  if (videos.length === 0) {
    return fallback;
  }

  const timestamps = videos
    .map((v) => (v.snippet?.publishedAt ? new Date(v.snippet.publishedAt).getTime() : 0))
    .filter((t) => t > 0);

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
