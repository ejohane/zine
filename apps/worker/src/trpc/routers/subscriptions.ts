/**
 * Subscriptions tRPC Router
 *
 * Handles OAuth-based channel/show subscriptions (YouTube, Spotify).
 * Supports add, remove, and list operations with pagination.
 *
 * Key behaviors:
 * - add: Validates active connection, creates/reactivates subscription
 * - remove: Soft deletes subscription, cleans up INBOX items (preserves SAVED)
 * - list: Returns paginated subscriptions with optional filters
 *
 * See: features/subscriptions/backend-spec.md
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { ulid } from 'ulid';
import { and, eq, gt, asc, inArray, ne } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc';
import { ProviderSchema, SubscriptionStatusSchema, Provider } from '@zine/shared';
import {
  subscriptions,
  userItems,
  subscriptionItems,
  providerConnections,
  creators,
} from '../../db/schema';
import { findOrCreateCreator } from '../../db/helpers/creators';
import { logger } from '../../lib/logger';
import {
  getYouTubeClientForConnection,
  getAllUserSubscriptions,
  searchChannels,
  getChannelDetails,
} from '../../providers/youtube';
import {
  getSpotifyClientForConnection,
  getAllUserSavedShows,
  searchShows,
  getLargestImage,
} from '../../providers/spotify';
import type { ProviderConnection } from '../../lib/token-refresh';
import type { Database } from '../../db';
import { triggerInitialFetch, type InitialFetchEnv } from '../../subscriptions/initial-fetch';
import {
  pollSingleYouTubeSubscription,
  pollYouTubeSubscriptionsBatched,
} from '../../polling/youtube-poller';
import {
  pollSingleSpotifySubscription,
  pollSpotifySubscriptionsBatched,
} from '../../polling/spotify-poller';
import type { Bindings } from '../../types';
import type { Subscription as PollingSubscription, DrizzleDB } from '../../polling/types';

// ============================================================================
// Constants
// ============================================================================

/**
 * Maximum YouTube subscriptions to sync per request.
 *
 * Cloudflare Workers have a 50 subrequest limit per invocation.
 * Each YouTube subscription poll requires 2 API calls:
 *   1. playlistItems.list (fetch videos from uploads playlist)
 *   2. videos.list (fetch video details/duration for filtering Shorts)
 *
 * 20 subs × 2 calls = 40 subrequests, leaving headroom for:
 *   - Spotify API calls
 *   - Database operations
 *   - Token refresh if needed
 *
 * If user has more than this, remaining subs will be synced on next request.
 */
const MAX_YOUTUBE_SUBS_PER_SYNC = 20;

/**
 * Maximum Spotify subscriptions to sync per request.
 * Spotify uses 1 API call per subscription (episodes.list).
 */
const MAX_SPOTIFY_SUBS_PER_SYNC = 30;

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Input schema for listing subscriptions with optional filters
 */
const ListSubscriptionsInputSchema = z.object({
  provider: ProviderSchema.optional(),
  status: SubscriptionStatusSchema.optional(),
  limit: z.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

/**
 * Input schema for adding a subscription
 */
const AddSubscriptionInputSchema = z.object({
  provider: ProviderSchema,
  providerChannelId: z.string().min(1),
  name: z.string().optional(),
  imageUrl: z.string().url().optional(),
});

/**
 * Input schema for removing a subscription
 */
const RemoveSubscriptionInputSchema = z.object({
  subscriptionId: z.string().min(1),
});

/**
 * Input schema for pause/resume operations
 */
const PauseResumeInputSchema = z.object({
  subscriptionId: z.string().min(1),
});

/**
 * Input schema for manual sync
 */
const SyncNowInputSchema = z.object({
  subscriptionId: z.string().min(1),
});

/**
 * Input schema for discovering available subscriptions from provider
 */
const DiscoverAvailableInputSchema = z.object({
  provider: ProviderSchema,
});

/**
 * Input schema for searching channels/shows on a provider
 */
const SearchInputSchema = z.object({
  provider: ProviderSchema,
  query: z.string().min(2).max(100),
  limit: z.number().min(1).max(20).default(10),
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get an active provider connection for a user
 *
 * @param userId - The user's ID
 * @param provider - The provider to check
 * @param db - Drizzle database instance
 * @returns The active connection or null if not connected
 */
async function getActiveConnection(
  userId: string,
  provider: Provider,
  db: Database
): Promise<ProviderConnection | null> {
  const connection = await db.query.providerConnections.findFirst({
    where: and(
      eq(providerConnections.userId, userId),
      eq(providerConnections.provider, provider),
      eq(providerConnections.status, 'ACTIVE')
    ),
  });

  return connection as ProviderConnection | null;
}

// ============================================================================
// Router
// ============================================================================

export const subscriptionsRouter = router({
  /**
   * List user's subscriptions (paginated)
   *
   * Supports filtering by provider and status.
   * Uses cursor-based pagination sorted by subscription ID (ULID, chronological).
   * Joins creators table to get normalized name, imageUrl, etc.
   *
   * @returns Paginated list of subscriptions with nextCursor and hasMore flags
   */
  list: protectedProcedure
    .input(ListSubscriptionsInputSchema.optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50;
      const conditions = [eq(subscriptions.userId, ctx.userId)];

      // Apply optional filters
      if (input?.provider) {
        conditions.push(eq(subscriptions.provider, input.provider));
      }
      if (input?.status) {
        conditions.push(eq(subscriptions.status, input.status));
      }

      // Apply cursor-based pagination (ULID sorting is chronological)
      if (input?.cursor) {
        conditions.push(gt(subscriptions.id, input.cursor));
      }

      // Query with JOIN to creators for normalized data
      const results = await ctx.db
        .select({
          subscription: subscriptions,
          creator: creators,
        })
        .from(subscriptions)
        .leftJoin(creators, eq(subscriptions.creatorId, creators.id))
        .where(and(...conditions))
        .orderBy(asc(subscriptions.id))
        .limit(limit + 1);

      const hasMore = results.length > limit;
      const rows = hasMore ? results.slice(0, -1) : results;

      // Transform to include creator data
      const items = rows.map((row) => ({
        id: row.subscription.id,
        userId: row.subscription.userId,
        provider: row.subscription.provider,
        providerChannelId: row.subscription.providerChannelId,
        creatorId: row.subscription.creatorId,
        // Get name, imageUrl, etc. from creators table (normalized)
        name: row.creator?.name ?? 'Unknown',
        imageUrl: row.creator?.imageUrl ?? null,
        description: row.creator?.description ?? null,
        externalUrl: row.creator?.externalUrl ?? null,
        // Polling metadata
        totalItems: row.subscription.totalItems,
        lastPublishedAt: row.subscription.lastPublishedAt,
        lastPolledAt: row.subscription.lastPolledAt,
        pollIntervalSeconds: row.subscription.pollIntervalSeconds,
        // Status
        status: row.subscription.status,
        disconnectedAt: row.subscription.disconnectedAt,
        disconnectedReason: row.subscription.disconnectedReason,
        // Timestamps
        createdAt: row.subscription.createdAt,
        updatedAt: row.subscription.updatedAt,
      }));

      return {
        items,
        nextCursor: hasMore && items.length > 0 ? items[items.length - 1].id : null,
        hasMore,
      };
    }),

  /**
   * Add a subscription to a YouTube channel or Spotify show
   *
   * Requirements:
   * 1. User must have an active connection to the provider
   * 2. Creates/finds creator in normalized creators table
   * 3. Creates new subscription or reactivates existing one (upsert behavior)
   *
   * The initial fetch of content is handled asynchronously (zine-teq.18).
   *
   * @throws PRECONDITION_FAILED if user is not connected to the provider
   */
  add: protectedProcedure.input(AddSubscriptionInputSchema).mutation(async ({ ctx, input }) => {
    // 1. Verify user has active connection to this provider
    const connection = await ctx.db.query.providerConnections.findFirst({
      where: and(
        eq(providerConnections.userId, ctx.userId),
        eq(providerConnections.provider, input.provider),
        eq(providerConnections.status, 'ACTIVE')
      ),
    });

    if (!connection) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: `Not connected to ${input.provider}. Please connect your ${input.provider} account first.`,
      });
    }

    // 2. Fetch channel/show metadata to enrich creator data
    let creatorName = input.name || input.providerChannelId;
    let creatorImageUrl = input.imageUrl;
    let creatorDescription: string | undefined;
    let creatorHandle: string | undefined;
    let creatorExternalUrl: string | undefined;

    if (input.provider === 'YOUTUBE') {
      try {
        const youtubeClient = await getYouTubeClientForConnection(
          connection as ProviderConnection,
          ctx.env as Parameters<typeof getYouTubeClientForConnection>[1]
        );
        const channelDetails = await getChannelDetails(youtubeClient, input.providerChannelId);
        if (channelDetails?.snippet) {
          creatorName = channelDetails.snippet.title || creatorName;
          creatorDescription = channelDetails.snippet.description || undefined;
          creatorHandle = channelDetails.snippet.customUrl || undefined;
          creatorImageUrl =
            channelDetails.snippet.thumbnails?.high?.url ||
            channelDetails.snippet.thumbnails?.medium?.url ||
            creatorImageUrl;
          creatorExternalUrl = `https://www.youtube.com/channel/${input.providerChannelId}`;
        }
      } catch {
        // Non-fatal: continue with provided data if channel details fetch fails
        logger.warn(`Failed to fetch YouTube channel details for ${input.providerChannelId}`);
      }
    }

    // 3. Find or create creator in normalized creators table
    const creator = await findOrCreateCreator(
      { db: ctx.db },
      {
        provider: input.provider,
        providerCreatorId: input.providerChannelId,
        name: creatorName,
        imageUrl: creatorImageUrl,
        description: creatorDescription,
        handle: creatorHandle,
        externalUrl: creatorExternalUrl,
      }
    );

    // 4. Create subscription (upsert: reactivate if previously unsubscribed)
    const now = Date.now();
    const subscriptionId = ulid();

    await ctx.db
      .insert(subscriptions)
      .values({
        id: subscriptionId,
        userId: ctx.userId,
        provider: input.provider,
        providerChannelId: input.providerChannelId,
        creatorId: creator.id,
        status: 'ACTIVE',
        pollIntervalSeconds: 3600, // 1 hour default
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [subscriptions.userId, subscriptions.provider, subscriptions.providerChannelId],
        set: {
          status: 'ACTIVE',
          creatorId: creator.id,
          updatedAt: now,
        },
      });

    // 5. Get the subscription ID (might be existing one if upsert)
    const sub = await ctx.db.query.subscriptions.findFirst({
      where: and(
        eq(subscriptions.userId, ctx.userId),
        eq(subscriptions.provider, input.provider),
        eq(subscriptions.providerChannelId, input.providerChannelId)
      ),
      columns: { id: true },
    });

    // 6. Trigger initial fetch (await to ensure it completes before response)
    // Note: triggerInitialFetch catches its own errors internally and won't fail subscription creation
    try {
      await triggerInitialFetch(
        ctx.userId,
        sub!.id,
        connection as ProviderConnection,
        input.provider,
        input.providerChannelId,
        ctx.db,
        ctx.env as InitialFetchEnv,
        input.imageUrl ?? undefined
      );
    } catch (error) {
      // Extra safety: log but don't fail subscription creation
      logger.child('subscriptions').error('Initial fetch failed', { error });
    }

    return {
      subscriptionId: sub!.id,
      name: creator.name,
      imageUrl: creator.imageUrl ?? null,
    };
  }),

  /**
   * Remove (unsubscribe from) a subscription
   *
   * Behavior:
   * 1. Soft delete subscription (status → UNSUBSCRIBED)
   * 2. Delete user_items in INBOX state (user hasn't committed to these)
   * 3. Hard delete subscription_items tracking records
   * 4. Preserve provider_items_seen (prevents re-ingestion on re-subscribe)
   *
   * @throws NOT_FOUND if subscription doesn't exist or doesn't belong to user
   */
  remove: protectedProcedure
    .input(RemoveSubscriptionInputSchema)
    .mutation(async ({ ctx, input }) => {
      // 1. Verify ownership
      const sub = await ctx.db.query.subscriptions.findFirst({
        where: and(
          eq(subscriptions.id, input.subscriptionId),
          eq(subscriptions.userId, ctx.userId)
        ),
      });

      if (!sub) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Subscription not found',
        });
      }

      // 2. Soft delete subscription (preserves metadata for potential re-subscribe)
      await ctx.db
        .update(subscriptions)
        .set({
          status: 'UNSUBSCRIBED',
          updatedAt: Date.now(),
        })
        .where(eq(subscriptions.id, input.subscriptionId));

      // 3. Get item IDs from subscription_items for cleanup
      const subItems = await ctx.db.query.subscriptionItems.findMany({
        where: eq(subscriptionItems.subscriptionId, input.subscriptionId),
        columns: { itemId: true },
      });
      const itemIds = subItems.map((si) => si.itemId);

      // 4. Delete INBOX items only (user hasn't committed to these)
      // BOOKMARKED/ARCHIVED items are preserved as user has explicitly saved them
      if (itemIds.length > 0) {
        await ctx.db
          .delete(userItems)
          .where(
            and(
              eq(userItems.userId, ctx.userId),
              inArray(userItems.itemId, itemIds),
              eq(userItems.state, 'INBOX')
            )
          );
      }

      // 5. Hard delete subscription_items tracking records
      // These have no value after unsubscribe
      await ctx.db
        .delete(subscriptionItems)
        .where(eq(subscriptionItems.subscriptionId, input.subscriptionId));

      // Note: provider_items_seen is preserved to prevent re-ingestion
      // if user re-subscribes to the same channel/show

      return { success: true as const };
    }),

  /**
   * Pause a subscription (stops polling)
   *
   * Changes subscription status from ACTIVE to PAUSED.
   * Only active subscriptions can be paused.
   *
   * @throws NOT_FOUND if subscription doesn't exist, doesn't belong to user, or is not active
   */
  pause: protectedProcedure.input(PauseResumeInputSchema).mutation(async ({ ctx, input }) => {
    const result = await ctx.db
      .update(subscriptions)
      .set({
        status: 'PAUSED',
        updatedAt: Date.now(),
      })
      .where(
        and(
          eq(subscriptions.id, input.subscriptionId),
          eq(subscriptions.userId, ctx.userId),
          eq(subscriptions.status, 'ACTIVE')
        )
      )
      .returning({ id: subscriptions.id });

    if (result.length === 0) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Subscription not found or not active',
      });
    }

    return { success: true as const };
  }),

  /**
   * Resume a paused subscription
   *
   * Changes subscription status from PAUSED to ACTIVE.
   * Validates that the provider connection is still active before resuming.
   *
   * @throws NOT_FOUND if subscription doesn't exist or doesn't belong to user
   * @throws BAD_REQUEST if subscription is not in PAUSED status
   * @throws PRECONDITION_FAILED if provider connection is not active
   */
  resume: protectedProcedure.input(PauseResumeInputSchema).mutation(async ({ ctx, input }) => {
    // 1. Verify ownership and get subscription details
    const sub = await ctx.db.query.subscriptions.findFirst({
      where: and(eq(subscriptions.id, input.subscriptionId), eq(subscriptions.userId, ctx.userId)),
    });

    if (!sub) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Subscription not found',
      });
    }

    // 2. Validate subscription is paused
    if (sub.status !== 'PAUSED') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Cannot resume subscription with status ${sub.status}`,
      });
    }

    // 3. Check if connection is active
    const connection = await ctx.db.query.providerConnections.findFirst({
      where: and(
        eq(providerConnections.userId, ctx.userId),
        eq(providerConnections.provider, sub.provider),
        eq(providerConnections.status, 'ACTIVE')
      ),
    });

    if (!connection) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Provider connection is not active. Please reconnect.',
      });
    }

    // 4. Resume subscription
    await ctx.db
      .update(subscriptions)
      .set({
        status: 'ACTIVE',
        updatedAt: Date.now(),
      })
      .where(eq(subscriptions.id, input.subscriptionId));

    return { success: true as const };
  }),

  /**
   * Manually trigger a sync for a subscription (rate limited)
   *
   * Rate limit: 1 sync per 5 minutes per subscription.
   * Only active subscriptions can be synced.
   * Validates that the provider connection is active.
   *
   * Note: The actual polling logic will be implemented in zine-teq.19.
   * For now, this validates permissions and returns a placeholder result.
   *
   * @throws NOT_FOUND if subscription doesn't exist or doesn't belong to user
   * @throws BAD_REQUEST if subscription is not active
   * @throws PRECONDITION_FAILED if provider connection is not active
   * @throws TOO_MANY_REQUESTS if rate limit is exceeded
   */
  syncNow: protectedProcedure.input(SyncNowInputSchema).mutation(async ({ ctx, input }) => {
    // 1. Verify ownership and get subscription details
    const sub = await ctx.db.query.subscriptions.findFirst({
      where: and(eq(subscriptions.id, input.subscriptionId), eq(subscriptions.userId, ctx.userId)),
    });

    if (!sub) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Subscription not found',
      });
    }

    // 2. Validate subscription is active
    if (sub.status !== 'ACTIVE') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Cannot sync non-active subscription',
      });
    }

    // 3. Check rate limit (1 per 5 minutes per subscription)
    const rateLimitKey = `manual-sync:${input.subscriptionId}`;
    const lastSync = await ctx.env.OAUTH_STATE_KV.get(rateLimitKey);
    if (lastSync && Date.now() - parseInt(lastSync, 10) < 5 * 60 * 1000) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: 'Please wait 5 minutes between manual syncs',
      });
    }

    // 4. Check if connection is active
    const connection = await ctx.db.query.providerConnections.findFirst({
      where: and(
        eq(providerConnections.userId, ctx.userId),
        eq(providerConnections.provider, sub.provider),
        eq(providerConnections.status, 'ACTIVE')
      ),
    });

    if (!connection) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Provider connection is not active',
      });
    }

    // 5. Update rate limit (store current timestamp with 5 min TTL)
    await ctx.env.OAUTH_STATE_KV.put(rateLimitKey, Date.now().toString(), { expirationTtl: 300 });

    // 6. Call appropriate polling function based on provider
    let result: { newItems: number };

    try {
      if (sub.provider === 'YOUTUBE') {
        const client = await getYouTubeClientForConnection(
          connection as ProviderConnection,
          ctx.env as Parameters<typeof getYouTubeClientForConnection>[1]
        );
        result = await pollSingleYouTubeSubscription(
          sub as PollingSubscription,
          client,
          ctx.userId,
          ctx.env as Bindings,
          ctx.db as unknown as DrizzleDB
        );
      } else if (sub.provider === 'SPOTIFY') {
        const client = await getSpotifyClientForConnection(
          connection as ProviderConnection,
          ctx.env as Parameters<typeof getSpotifyClientForConnection>[1]
        );
        result = await pollSingleSpotifySubscription(
          sub as PollingSubscription,
          client,
          ctx.userId,
          ctx.env as Bindings,
          ctx.db as unknown as DrizzleDB
        );
      } else {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Unsupported provider: ${sub.provider}`,
        });
      }
    } catch (err) {
      // Log the error but wrap in TRPCError for consistent client handling
      logger.error('syncNow polling failed', {
        subscriptionId: input.subscriptionId,
        provider: sub.provider,
        error: err,
      });

      // Re-throw TRPCErrors as-is, wrap others
      if (err instanceof TRPCError) {
        throw err;
      }
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to sync subscription',
        cause: err,
      });
    }

    return { success: true as const, itemsFound: result.newItems };
  }),

  /**
   * Sync all active subscriptions for the current user (rate limited)
   *
   * Rate limit: 1 sync-all per 2 minutes per user
   *
   * @throws TOO_MANY_REQUESTS if user rate limit exceeded
   * @returns Summary of sync results
   */
  syncAll: protectedProcedure.mutation(async ({ ctx }) => {
    const syncStartTime = Date.now();
    logger.info('syncAll: started', { userId: ctx.userId });

    // 1. Check user-level rate limit (2 minutes between sync-all)
    const rateLimitKey = `sync-all:${ctx.userId}`;
    const lastSync = await ctx.env.OAUTH_STATE_KV.get(rateLimitKey);
    if (lastSync && Date.now() - parseInt(lastSync, 10) < 2 * 60 * 1000) {
      const waitTime = Math.ceil((2 * 60 * 1000 - (Date.now() - parseInt(lastSync, 10))) / 1000);
      logger.info('syncAll: rate limited', { userId: ctx.userId, waitTimeSeconds: waitTime });
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: 'Please wait 2 minutes between full syncs',
      });
    }

    // 2. Get all active subscriptions for user
    const activeSubs = await ctx.db.query.subscriptions.findMany({
      where: and(eq(subscriptions.userId, ctx.userId), eq(subscriptions.status, 'ACTIVE')),
    });

    if (activeSubs.length === 0) {
      logger.info('syncAll: no active subscriptions', { userId: ctx.userId });
      return { success: true as const, synced: 0, itemsFound: 0, errors: [] as string[] };
    }

    logger.info('syncAll: found subscriptions', {
      userId: ctx.userId,
      total: activeSubs.length,
      youtube: activeSubs.filter((s) => s.provider === 'YOUTUBE').length,
      spotify: activeSubs.filter((s) => s.provider === 'SPOTIFY').length,
    });

    // 3. Update rate limit immediately (before processing)
    await ctx.env.OAUTH_STATE_KV.put(rateLimitKey, Date.now().toString(), { expirationTtl: 120 });

    // 4. Initialize results
    const results = {
      synced: 0,
      itemsFound: 0,
      errors: [] as string[],
    };

    // 5. Group by provider and sort by lastPolledAt (oldest first, null = never polled = highest priority)
    const sortByOldestPoll = (
      a: { lastPolledAt: number | null },
      b: { lastPolledAt: number | null }
    ) => {
      // Null (never polled) comes first
      if (a.lastPolledAt === null && b.lastPolledAt === null) return 0;
      if (a.lastPolledAt === null) return -1;
      if (b.lastPolledAt === null) return 1;
      return a.lastPolledAt - b.lastPolledAt;
    };

    const byProvider = {
      YOUTUBE: activeSubs
        .filter((s) => s.provider === 'YOUTUBE')
        .sort(sortByOldestPoll)
        .slice(0, MAX_YOUTUBE_SUBS_PER_SYNC),
      SPOTIFY: activeSubs
        .filter((s) => s.provider === 'SPOTIFY')
        .sort(sortByOldestPoll)
        .slice(0, MAX_SPOTIFY_SUBS_PER_SYNC),
    };

    // Track total counts for logging
    const totalYouTube = activeSubs.filter((s) => s.provider === 'YOUTUBE').length;
    const totalSpotify = activeSubs.filter((s) => s.provider === 'SPOTIFY').length;
    const skippedYouTube = totalYouTube - byProvider.YOUTUBE.length;
    const skippedSpotify = totalSpotify - byProvider.SPOTIFY.length;

    if (skippedYouTube > 0 || skippedSpotify > 0) {
      logger.info('syncAll: limiting subscriptions due to subrequest budget', {
        totalYouTube,
        syncingYouTube: byProvider.YOUTUBE.length,
        skippedYouTube,
        totalSpotify,
        syncingSpotify: byProvider.SPOTIFY.length,
        skippedSpotify,
      });
    }

    // 6. Process YouTube subscriptions using batched polling
    if (byProvider.YOUTUBE.length > 0) {
      const ytConnection = await ctx.db.query.providerConnections.findFirst({
        where: and(
          eq(providerConnections.userId, ctx.userId),
          eq(providerConnections.provider, 'YOUTUBE'),
          eq(providerConnections.status, 'ACTIVE')
        ),
      });

      if (ytConnection) {
        try {
          const client = await getYouTubeClientForConnection(
            ytConnection as ProviderConnection,
            ctx.env as Parameters<typeof getYouTubeClientForConnection>[1]
          );

          const batchResult = await pollYouTubeSubscriptionsBatched(
            byProvider.YOUTUBE as PollingSubscription[],
            client,
            ctx.userId,
            ctx.env as Bindings,
            ctx.db as unknown as DrizzleDB
          );

          results.synced += batchResult.processed;
          results.itemsFound += batchResult.newItems;

          if (batchResult.errors) {
            for (const err of batchResult.errors) {
              const sub = byProvider.YOUTUBE.find((s) => s.id === err.subscriptionId);
              results.errors.push(`YouTube: ${sub?.providerChannelId ?? err.subscriptionId}`);
            }
          }
        } catch (err) {
          logger.error('syncAll: YouTube batch polling failed', { error: err });
          results.errors.push('YouTube connection error');
        }
      } else {
        logger.warn('syncAll: YouTube subscriptions exist but no active connection');
        results.errors.push('YouTube not connected');
      }
    }

    // 7. Process Spotify subscriptions using batched polling with delta detection
    if (byProvider.SPOTIFY.length > 0) {
      const spConnection = await ctx.db.query.providerConnections.findFirst({
        where: and(
          eq(providerConnections.userId, ctx.userId),
          eq(providerConnections.provider, 'SPOTIFY'),
          eq(providerConnections.status, 'ACTIVE')
        ),
      });

      if (spConnection) {
        try {
          const client = await getSpotifyClientForConnection(
            spConnection as ProviderConnection,
            ctx.env as Parameters<typeof getSpotifyClientForConnection>[1]
          );

          const batchResult = await pollSpotifySubscriptionsBatched(
            byProvider.SPOTIFY as PollingSubscription[],
            client,
            ctx.userId,
            ctx.env as Bindings,
            ctx.db as unknown as DrizzleDB
          );

          results.synced += batchResult.processed;
          results.itemsFound += batchResult.newItems;

          if (batchResult.errors) {
            for (const err of batchResult.errors) {
              const sub = byProvider.SPOTIFY.find((s) => s.id === err.subscriptionId);
              results.errors.push(`Spotify: ${sub?.providerChannelId ?? err.subscriptionId}`);
            }
          }
        } catch (err) {
          logger.error('syncAll: Spotify batch polling failed', { error: err });
          results.errors.push('Spotify connection error');
        }
      } else {
        logger.warn('syncAll: Spotify subscriptions exist but no active connection');
        results.errors.push('Spotify not connected');
      }
    }

    // Calculate if there are remaining subscriptions that weren't synced
    const hasMoreToSync = skippedYouTube > 0 || skippedSpotify > 0;

    const syncDuration = Date.now() - syncStartTime;
    logger.info('syncAll: completed', {
      userId: ctx.userId,
      synced: results.synced,
      itemsFound: results.itemsFound,
      errorCount: results.errors.length,
      errors: results.errors.length > 0 ? results.errors : undefined,
      hasMoreToSync,
      skippedYouTube,
      skippedSpotify,
      durationMs: syncDuration,
    });

    return {
      success: true as const,
      synced: results.synced,
      itemsFound: results.itemsFound,
      errors: results.errors,
      // Let client know if they should sync again to get remaining subs
      hasMoreToSync,
      remaining: skippedYouTube + skippedSpotify,
    };
  }),

  /**
   * Discovery endpoints for browsing available channels/shows to subscribe to
   *
   * Use cases:
   * 1. available: Show channels/podcasts the user follows on provider but hasn't subscribed to in Zine
   * 2. search: Search for channels/podcasts by name
   */
  discover: router({
    /**
     * Get user's provider subscriptions not yet in Zine
     *
     * Fetches the user's YouTube subscriptions or Spotify saved shows,
     * then filters out any they've already subscribed to in Zine.
     *
     * @returns List of available items with isSubscribed flag (always false for this endpoint)
     *          and connectionRequired flag if user hasn't connected the provider
     */
    available: protectedProcedure
      .input(DiscoverAvailableInputSchema)
      .query(async ({ ctx, input }) => {
        // 1. Get active provider connection
        const connection = await getActiveConnection(ctx.userId, input.provider, ctx.db);
        if (!connection) {
          return { items: [], connectionRequired: true };
        }

        // 2. Fetch user's subscriptions from provider
        let providerSubs: { id: string; name: string; imageUrl?: string }[];

        if (input.provider === Provider.YOUTUBE) {
          const client = await getYouTubeClientForConnection(
            connection,
            ctx.env as Parameters<typeof getYouTubeClientForConnection>[1]
          );
          const subs = await getAllUserSubscriptions(client, 500);
          providerSubs = subs
            .map((s) => ({
              id: s.snippet?.resourceId?.channelId || '',
              name: s.snippet?.title || '',
              imageUrl:
                s.snippet?.thumbnails?.high?.url ||
                s.snippet?.thumbnails?.medium?.url ||
                s.snippet?.thumbnails?.default?.url ||
                undefined,
            }))
            .filter((s) => s.id);
        } else {
          const client = await getSpotifyClientForConnection(
            connection,
            ctx.env as Parameters<typeof getSpotifyClientForConnection>[1]
          );
          const shows = await getAllUserSavedShows(client);
          providerSubs = shows.map((s) => ({
            id: s.id,
            name: s.name,
            imageUrl: getLargestImage(s.images),
          }));
        }

        // 3. Get existing Zine subscriptions for this provider (not unsubscribed)
        const existingIds = await ctx.db.query.subscriptions.findMany({
          where: and(
            eq(subscriptions.userId, ctx.userId),
            eq(subscriptions.provider, input.provider),
            ne(subscriptions.status, 'UNSUBSCRIBED')
          ),
          columns: { providerChannelId: true },
        });

        const existingSet = new Set(existingIds.map((s) => s.providerChannelId));

        // 4. Filter to unsubscribed items
        const available = providerSubs
          .filter((s) => !existingSet.has(s.id))
          .map((s) => ({
            ...s,
            isSubscribed: false,
          }));

        return { items: available, connectionRequired: false };
      }),

    /**
     * Search for channels/shows on provider
     *
     * WARNING: YouTube search costs 100 quota units per call! Use sparingly.
     *
     * @returns List of matching channels/shows with isSubscribed flag indicating
     *          if the user has already subscribed in Zine
     */
    search: protectedProcedure.input(SearchInputSchema).query(async ({ ctx, input }) => {
      // 1. Get active provider connection
      const connection = await getActiveConnection(ctx.userId, input.provider, ctx.db);
      if (!connection) {
        return { items: [], connectionRequired: true };
      }

      // 2. Search provider for matching channels/shows
      let results: { id: string; name: string; description?: string; imageUrl?: string }[];

      if (input.provider === Provider.YOUTUBE) {
        // WARNING: YouTube search costs 100 quota units!
        const client = await getYouTubeClientForConnection(
          connection,
          ctx.env as Parameters<typeof getYouTubeClientForConnection>[1]
        );
        const searchResults = await searchChannels(client, input.query, input.limit);
        results = searchResults
          .map((ch) => ({
            id: ch.id?.channelId || '',
            name: ch.snippet?.channelTitle || '',
            description: ch.snippet?.description || undefined,
            imageUrl:
              ch.snippet?.thumbnails?.high?.url ||
              ch.snippet?.thumbnails?.medium?.url ||
              ch.snippet?.thumbnails?.default?.url ||
              undefined,
          }))
          .filter((r) => r.id);
      } else {
        const client = await getSpotifyClientForConnection(
          connection,
          ctx.env as Parameters<typeof getSpotifyClientForConnection>[1]
        );
        const shows = await searchShows(client, input.query, input.limit);
        results = shows.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          imageUrl: getLargestImage(s.images),
        }));
      }

      // 3. Check which are already subscribed in Zine
      const existingIds = await ctx.db.query.subscriptions.findMany({
        where: and(
          eq(subscriptions.userId, ctx.userId),
          eq(subscriptions.provider, input.provider),
          ne(subscriptions.status, 'UNSUBSCRIBED')
        ),
        columns: { providerChannelId: true },
      });
      const existingSet = new Set(existingIds.map((s) => s.providerChannelId));

      // 4. Return results with isSubscribed flag
      return {
        items: results.map((r) => ({
          ...r,
          isSubscribed: existingSet.has(r.id),
        })),
        connectionRequired: false,
      };
    }),
  }),
});

// Export type for client usage
export type SubscriptionsRouter = typeof subscriptionsRouter;
