import { TRPCError } from '@trpc/server';
import { and, desc, eq, inArray, like, lt, or } from 'drizzle-orm';
import { ulid } from 'ulid';
import { z } from 'zod';

import type { Database } from '../../db';
import { rssFeeds } from '../../db/schema';
import { discoverFeedsForUrl } from '../../rss/discovery';
import { syncRssFeed, syncRssFeedById } from '../../rss/service';
import { hashString, normalizeFeedUrl } from '../../rss/url';
import { protectedProcedure, router } from '../trpc';

const RssFeedStatusSchema = z.enum(['ACTIVE', 'PAUSED', 'UNSUBSCRIBED', 'ERROR']);

const ListRssFeedsInputSchema = z.object({
  status: RssFeedStatusSchema.optional(),
  search: z.string().trim().min(1).max(100).optional(),
  limit: z.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

const AddRssFeedInputSchema = z.object({
  feedUrl: z.string().min(1),
  seedMode: z.enum(['latest', 'none']).optional(),
});

const RssFeedActionInputSchema = z.object({
  feedId: z.string().min(1),
});

const DiscoverRssFeedInputSchema = z.object({
  url: z.string().url('Invalid URL format'),
  refresh: z.boolean().optional(),
});

async function getOwnedFeed(db: Database, userId: string, feedId: string) {
  return db.query.rssFeeds.findFirst({
    where: and(eq(rssFeeds.id, feedId), eq(rssFeeds.userId, userId)),
  });
}

export const rssRouter = router({
  list: protectedProcedure
    .input(ListRssFeedsInputSchema.optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50;
      const conditions = [eq(rssFeeds.userId, ctx.userId)];

      if (input?.status) {
        conditions.push(eq(rssFeeds.status, input.status));
      }

      if (input?.search) {
        const term = `%${input.search}%`;
        conditions.push(or(like(rssFeeds.title, term), like(rssFeeds.feedUrl, term))!);
      }

      if (input?.cursor) {
        conditions.push(lt(rssFeeds.id, input.cursor));
      }

      const rows = await ctx.db.query.rssFeeds.findMany({
        where: and(...conditions),
        orderBy: [desc(rssFeeds.id)],
        limit: limit + 1,
      });

      const hasMore = rows.length > limit;
      const visibleRows = hasMore ? rows.slice(0, limit) : rows;

      return {
        items: visibleRows.map((row) => ({
          id: row.id,
          feedUrl: row.feedUrl,
          title: row.title ?? row.feedUrl,
          description: row.description,
          siteUrl: row.siteUrl,
          imageUrl: row.imageUrl,
          status: row.status as z.infer<typeof RssFeedStatusSchema>,
          errorCount: row.errorCount,
          lastError: row.lastError,
          lastPolledAt: row.lastPolledAt,
          lastSuccessAt: row.lastSuccessAt,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        })),
        nextCursor: hasMore ? (visibleRows[visibleRows.length - 1]?.id ?? null) : null,
        hasMore,
      };
    }),

  add: protectedProcedure.input(AddRssFeedInputSchema).mutation(async ({ ctx, input }) => {
    const normalizedFeedUrl = normalizeFeedUrl(input.feedUrl);
    const seedMode = input.seedMode ?? 'latest';
    const feedUrlHash = hashString(normalizedFeedUrl);
    const now = Date.now();

    const existing = await ctx.db.query.rssFeeds.findFirst({
      where: and(eq(rssFeeds.userId, ctx.userId), eq(rssFeeds.feedUrl, normalizedFeedUrl)),
    });

    const feedId = existing?.id ?? ulid();
    let created = false;

    if (!existing) {
      await ctx.db.insert(rssFeeds).values({
        id: feedId,
        userId: ctx.userId,
        feedUrl: normalizedFeedUrl,
        feedUrlHash,
        title: null,
        description: null,
        siteUrl: null,
        imageUrl: null,
        etag: null,
        lastModified: null,
        lastPolledAt: null,
        lastSuccessAt: null,
        lastErrorAt: null,
        lastError: null,
        errorCount: 0,
        status: 'ACTIVE',
        pollIntervalSeconds: 3600,
        createdAt: now,
        updatedAt: now,
      });
      created = true;
    } else {
      await ctx.db
        .update(rssFeeds)
        .set({
          status: 'ACTIVE',
          lastError: null,
          errorCount: 0,
          updatedAt: now,
        })
        .where(eq(rssFeeds.id, existing.id));
    }

    const feed = await ctx.db.query.rssFeeds.findFirst({
      where: and(eq(rssFeeds.id, feedId), eq(rssFeeds.userId, ctx.userId)),
    });

    if (!feed) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create RSS feed',
      });
    }

    try {
      const seedResult = await syncRssFeed(ctx.db, feed, {
        maxEntries: seedMode === 'none' ? 0 : 1,
        useConditional: false,
      });

      const refreshedFeed = await ctx.db.query.rssFeeds.findFirst({
        where: and(eq(rssFeeds.id, feed.id), eq(rssFeeds.userId, ctx.userId)),
      });

      return {
        id: feed.id,
        feedUrl: feed.feedUrl,
        title: refreshedFeed?.title ?? feed.feedUrl,
        status: (refreshedFeed?.status ?? 'ACTIVE') as z.infer<typeof RssFeedStatusSchema>,
        created,
        seededItems: seedResult.newItems,
      };
    } catch (error) {
      if (created) {
        await ctx.db.delete(rssFeeds).where(eq(rssFeeds.id, feed.id));
      }

      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: error instanceof Error ? error.message : 'Failed to validate RSS feed',
      });
    }
  }),

  discover: protectedProcedure.input(DiscoverRssFeedInputSchema).query(async ({ ctx, input }) => {
    const discoveryResult = await discoverFeedsForUrl(ctx.db, input.url, {
      refresh: input.refresh ?? false,
    });

    const candidateUrls = discoveryResult.candidates.map((candidate) => candidate.feedUrl);
    const existingFeeds =
      candidateUrls.length > 0
        ? await ctx.db.query.rssFeeds.findMany({
            where: and(eq(rssFeeds.userId, ctx.userId), inArray(rssFeeds.feedUrl, candidateUrls)),
          })
        : [];

    const existingByUrl = new Map(existingFeeds.map((feed) => [feed.feedUrl, feed]));

    return {
      sourceUrl: discoveryResult.sourceUrl,
      sourceOrigin: discoveryResult.sourceOrigin,
      checkedAt: discoveryResult.checkedAt,
      cached: discoveryResult.cached,
      candidates: discoveryResult.candidates.map((candidate) => {
        const existing = existingByUrl.get(candidate.feedUrl);
        return {
          ...candidate,
          subscription: existing
            ? {
                feedId: existing.id,
                status: existing.status as z.infer<typeof RssFeedStatusSchema>,
              }
            : null,
        };
      }),
    };
  }),

  remove: protectedProcedure.input(RssFeedActionInputSchema).mutation(async ({ ctx, input }) => {
    const feed = await getOwnedFeed(ctx.db, ctx.userId, input.feedId);
    if (!feed) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'RSS feed not found',
      });
    }

    await ctx.db
      .update(rssFeeds)
      .set({
        status: 'UNSUBSCRIBED',
        updatedAt: Date.now(),
      })
      .where(eq(rssFeeds.id, feed.id));

    return { success: true as const };
  }),

  pause: protectedProcedure.input(RssFeedActionInputSchema).mutation(async ({ ctx, input }) => {
    const feed = await getOwnedFeed(ctx.db, ctx.userId, input.feedId);
    if (!feed) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'RSS feed not found',
      });
    }

    await ctx.db
      .update(rssFeeds)
      .set({
        status: 'PAUSED',
        updatedAt: Date.now(),
      })
      .where(eq(rssFeeds.id, feed.id));

    return { success: true as const };
  }),

  resume: protectedProcedure.input(RssFeedActionInputSchema).mutation(async ({ ctx, input }) => {
    const feed = await getOwnedFeed(ctx.db, ctx.userId, input.feedId);
    if (!feed) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'RSS feed not found',
      });
    }

    await ctx.db
      .update(rssFeeds)
      .set({
        status: 'ACTIVE',
        lastError: null,
        errorCount: 0,
        updatedAt: Date.now(),
      })
      .where(eq(rssFeeds.id, feed.id));

    return { success: true as const };
  }),

  syncNow: protectedProcedure.input(RssFeedActionInputSchema).mutation(async ({ ctx, input }) => {
    const feed = await getOwnedFeed(ctx.db, ctx.userId, input.feedId);
    if (!feed) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'RSS feed not found',
      });
    }

    if (feed.status === 'UNSUBSCRIBED') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Cannot sync an unsubscribed feed',
      });
    }

    const rateLimitKey = `manual-sync:rss:${feed.id}`;
    const lastSync = await ctx.env.OAUTH_STATE_KV.get(rateLimitKey);
    if (lastSync && Date.now() - Number.parseInt(lastSync, 10) < 5 * 60 * 1000) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: 'Please wait 5 minutes between manual syncs',
      });
    }

    await ctx.env.OAUTH_STATE_KV.put(rateLimitKey, Date.now().toString(), {
      expirationTtl: 300,
    });

    try {
      const result = await syncRssFeedById(ctx.db, ctx.userId, feed.id, {
        maxEntries: 20,
        // Manual sync is user-initiated and should always attempt metadata repair/backfill.
        useConditional: false,
      });

      return {
        success: true as const,
        itemsFound: result.newItems,
        processedEntries: result.processedEntries,
        reason: result.reason,
      };
    } catch (error) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: error instanceof Error ? error.message : 'Failed to sync RSS feed',
      });
    }
  }),

  stats: protectedProcedure.query(async ({ ctx }) => {
    const feeds = await ctx.db.query.rssFeeds.findMany({
      where: eq(rssFeeds.userId, ctx.userId),
      columns: {
        status: true,
        lastSuccessAt: true,
      },
    });

    const stats = {
      total: feeds.length,
      active: feeds.filter((feed) => feed.status === 'ACTIVE').length,
      paused: feeds.filter((feed) => feed.status === 'PAUSED').length,
      unsubscribed: feeds.filter((feed) => feed.status === 'UNSUBSCRIBED').length,
      error: feeds.filter((feed) => feed.status === 'ERROR').length,
      lastSuccessAt:
        feeds
          .map((feed) => feed.lastSuccessAt)
          .filter((value): value is number => typeof value === 'number')
          .sort((a, b) => b - a)[0] ?? null,
    };

    return stats;
  }),
});

export type RssRouter = typeof rssRouter;
