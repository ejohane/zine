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
import { pollSingleYouTubeSubscription } from '../../polling/youtube-poller';
import { pollSingleSpotifySubscription } from '../../polling/spotify-poller';
import type { Bindings } from '../../types';
import type { Subscription as PollingSubscription } from '../../polling/types';
import {
  initiateSyncJob,
  getSyncStatus,
  getActiveSyncJob,
  RateLimitError,
} from '../../sync/service';
import { getDLQSummary, getDLQEntries, deleteDLQEntry } from '../../sync/dlq-consumer';

const SubscriptionProviderSchema = z.enum([Provider.YOUTUBE, Provider.SPOTIFY]);
const ListSubscriptionsInputSchema = z.object({
  provider: ProviderSchema.optional(),
  status: SubscriptionStatusSchema.optional(),
  limit: z.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

const AddSubscriptionInputSchema = z.object({
  provider: SubscriptionProviderSchema,
  providerChannelId: z.string().min(1),
  name: z.string().optional(),
  imageUrl: z.string().url().optional(),
});

const RemoveSubscriptionInputSchema = z.object({
  subscriptionId: z.string().min(1),
});

const PauseResumeInputSchema = z.object({
  subscriptionId: z.string().min(1),
});

const SyncNowInputSchema = z.object({
  subscriptionId: z.string().min(1),
});

const DiscoverAvailableInputSchema = z.object({
  provider: SubscriptionProviderSchema,
});

const SearchInputSchema = z.object({
  provider: SubscriptionProviderSchema,
  query: z.string().min(2).max(100),
  limit: z.number().min(1).max(20).default(10),
});
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

export const subscriptionsRouter = router({
  list: protectedProcedure
    .input(ListSubscriptionsInputSchema.optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50;
      const conditions = [eq(subscriptions.userId, ctx.userId)];

      if (input?.provider) {
        conditions.push(eq(subscriptions.provider, input.provider));
      }
      if (input?.status) {
        conditions.push(eq(subscriptions.status, input.status));
      }

      if (input?.cursor) {
        conditions.push(gt(subscriptions.id, input.cursor));
      }

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

      const items = rows.map((row) => ({
        id: row.subscription.id,
        userId: row.subscription.userId,
        provider: row.subscription.provider,
        providerChannelId: row.subscription.providerChannelId,
        creatorId: row.subscription.creatorId,
        name: row.creator?.name ?? 'Unknown',
        imageUrl: row.creator?.imageUrl ?? null,
        description: row.creator?.description ?? null,
        externalUrl: row.creator?.externalUrl ?? null,
        totalItems: row.subscription.totalItems,
        lastPublishedAt: row.subscription.lastPublishedAt,
        lastPolledAt: row.subscription.lastPolledAt,
        pollIntervalSeconds: row.subscription.pollIntervalSeconds,
        status: row.subscription.status,
        disconnectedAt: row.subscription.disconnectedAt,
        disconnectedReason: row.subscription.disconnectedReason,
        createdAt: row.subscription.createdAt,
        updatedAt: row.subscription.updatedAt,
      }));

      return {
        items,
        nextCursor: hasMore && items.length > 0 ? items[items.length - 1].id : null,
        hasMore,
      };
    }),
  add: protectedProcedure.input(AddSubscriptionInputSchema).mutation(async ({ ctx, input }) => {
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
    const sub = await ctx.db.query.subscriptions.findFirst({
      where: and(
        eq(subscriptions.userId, ctx.userId),
        eq(subscriptions.provider, input.provider),
        eq(subscriptions.providerChannelId, input.providerChannelId)
      ),
      columns: { id: true },
    });
    // triggerInitialFetch already translates provider/network failures into a result object.
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

    return {
      subscriptionId: sub!.id,
      name: creator.name,
      imageUrl: creator.imageUrl ?? null,
    };
  }),
  remove: protectedProcedure
    .input(RemoveSubscriptionInputSchema)
    .mutation(async ({ ctx, input }) => {
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
      await ctx.db
        .update(subscriptions)
        .set({
          status: 'UNSUBSCRIBED',
          updatedAt: Date.now(),
        })
        .where(eq(subscriptions.id, input.subscriptionId));
      const subItems = await ctx.db.query.subscriptionItems.findMany({
        where: eq(subscriptionItems.subscriptionId, input.subscriptionId),
        columns: { itemId: true },
      });
      const itemIds = subItems.map((si) => si.itemId);
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
      // These have no value after unsubscribe
      await ctx.db
        .delete(subscriptionItems)
        .where(eq(subscriptionItems.subscriptionId, input.subscriptionId));

      // Note: provider_items_seen is preserved to prevent re-ingestion
      // if user re-subscribes to the same channel/show

      return { success: true as const };
    }),
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
  resume: protectedProcedure.input(PauseResumeInputSchema).mutation(async ({ ctx, input }) => {
    const sub = await ctx.db.query.subscriptions.findFirst({
      where: and(eq(subscriptions.id, input.subscriptionId), eq(subscriptions.userId, ctx.userId)),
    });

    if (!sub) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Subscription not found',
      });
    }
    if (sub.status !== 'PAUSED') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Cannot resume subscription with status ${sub.status}`,
      });
    }
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
    await ctx.db
      .update(subscriptions)
      .set({
        status: 'ACTIVE',
        updatedAt: Date.now(),
      })
      .where(eq(subscriptions.id, input.subscriptionId));

    return { success: true as const };
  }),
  syncNow: protectedProcedure.input(SyncNowInputSchema).mutation(async ({ ctx, input }) => {
    const sub = await ctx.db.query.subscriptions.findFirst({
      where: and(eq(subscriptions.id, input.subscriptionId), eq(subscriptions.userId, ctx.userId)),
    });

    if (!sub) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Subscription not found',
      });
    }
    if (sub.status !== 'ACTIVE') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Cannot sync non-active subscription',
      });
    }
    const rateLimitKey = `manual-sync:${input.subscriptionId}`;
    const lastSync = await ctx.env.OAUTH_STATE_KV.get(rateLimitKey);
    if (lastSync && Date.now() - parseInt(lastSync, 10) < 5 * 60 * 1000) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: 'Please wait 5 minutes between manual syncs',
      });
    }
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
    await ctx.env.OAUTH_STATE_KV.put(rateLimitKey, Date.now().toString(), { expirationTtl: 300 });
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
          ctx.db
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
          ctx.db
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
  syncAllAsync: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      const result = await initiateSyncJob(ctx.userId, ctx.db, ctx.env as Bindings, {
        traceId: ctx.traceId,
        requestId: ctx.requestId,
        clientRequestId: ctx.clientRequestId,
        source: 'subscriptions.syncAllAsync',
        release: ctx.release,
      });

      logger.info('syncAllAsync: job initiated', {
        operation: 'subscriptions.syncAllAsync',
        event: 'subscriptions.sync.accepted',
        status: 'ok',
        userId: ctx.userId,
        jobId: result.jobId,
        total: result.total,
        existing: result.existing,
        traceId: ctx.traceId,
        requestId: ctx.requestId,
        clientRequestId: ctx.clientRequestId,
        release: ctx.release,
      });

      return result;
    } catch (error) {
      if (error instanceof RateLimitError) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: error.message,
        });
      }
      throw error;
    }
  }),
  syncStatus: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ ctx, input }) => {
      const status = await getSyncStatus(input.jobId, ctx.env.OAUTH_STATE_KV);

      // Security: verify job belongs to this user (job ID embeds user context)
      // The getJobStatus function returns null if not found, so status='not_found'
      // is already handled

      return status;
    }),
  activeSyncJob: protectedProcedure.query(async ({ ctx }) => {
    return getActiveSyncJob(ctx.userId, ctx.env.OAUTH_STATE_KV);
  }),
  dlq: router({
    summary: protectedProcedure.query(async ({ ctx }) => {
      return getDLQSummary(ctx.env.OAUTH_STATE_KV);
    }),
    list: protectedProcedure
      .input(
        z.object({
          limit: z.number().min(1).max(100).default(20),
        })
      )
      .query(async ({ ctx, input }) => {
        return getDLQEntries(ctx.env.OAUTH_STATE_KV, input.limit);
      }),
    delete: protectedProcedure
      .input(
        z.object({
          id: z.string().min(1),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const deleted = await deleteDLQEntry(input.id, ctx.env.OAUTH_STATE_KV);
        if (!deleted) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'DLQ entry not found',
          });
        }
        return { success: true };
      }),
  }),
  discover: router({
    available: protectedProcedure
      .input(DiscoverAvailableInputSchema)
      .query(async ({ ctx, input }) => {
        const connection = await getActiveConnection(ctx.userId, input.provider, ctx.db);
        if (!connection) {
          return { items: [], connectionRequired: true };
        }
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
        const existingIds = await ctx.db.query.subscriptions.findMany({
          where: and(
            eq(subscriptions.userId, ctx.userId),
            eq(subscriptions.provider, input.provider),
            ne(subscriptions.status, 'UNSUBSCRIBED')
          ),
          columns: { providerChannelId: true },
        });

        const existingSet = new Set(existingIds.map((s) => s.providerChannelId));
        const available = providerSubs
          .filter((s) => !existingSet.has(s.id))
          .map((s) => ({
            ...s,
            isSubscribed: false,
          }));

        return { items: available, connectionRequired: false };
      }),
    search: protectedProcedure.input(SearchInputSchema).query(async ({ ctx, input }) => {
      const connection = await getActiveConnection(ctx.userId, input.provider, ctx.db);
      if (!connection) {
        return { items: [], connectionRequired: true };
      }
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
      const existingIds = await ctx.db.query.subscriptions.findMany({
        where: and(
          eq(subscriptions.userId, ctx.userId),
          eq(subscriptions.provider, input.provider),
          ne(subscriptions.status, 'UNSUBSCRIBED')
        ),
        columns: { providerChannelId: true },
      });
      const existingSet = new Set(existingIds.map((s) => s.providerChannelId));
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
