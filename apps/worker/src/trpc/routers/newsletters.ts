import { TRPCError } from '@trpc/server';
import { and, desc, eq, like, lt } from 'drizzle-orm';
import { z } from 'zod';
import { ulid } from 'ulid';

import { newsletterFeeds, newsletterUnsubscribeEvents, gmailMailboxes } from '../../db/schema';
import { syncGmailNewslettersForUser } from '../../newsletters/gmail';
import type { TokenRefreshEnv } from '../../lib/token-refresh';
import { protectedProcedure, router } from '../trpc';

const NewsletterFeedStatusSchema = z.enum(['ACTIVE', 'HIDDEN', 'UNSUBSCRIBED']);

const ListNewslettersInputSchema = z.object({
  status: NewsletterFeedStatusSchema.optional(),
  search: z.string().trim().min(1).max(100).optional(),
  limit: z.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

const UpdateStatusInputSchema = z.object({
  feedId: z.string().min(1),
  status: z.enum(['ACTIVE', 'HIDDEN']),
});

const UnsubscribeInputSchema = z.object({
  feedId: z.string().min(1),
});

export const newslettersRouter = router({
  list: protectedProcedure.input(ListNewslettersInputSchema.optional()).query(async ({ ctx, input }) => {
    const limit = input?.limit ?? 50;
    const conditions = [eq(newsletterFeeds.userId, ctx.userId)];

    if (input?.status) {
      conditions.push(eq(newsletterFeeds.status, input.status));
    }

    if (input?.search) {
      const term = `%${input.search.toLowerCase()}%`;
      conditions.push(
        like(newsletterFeeds.displayName, term)
      );
    }

    if (input?.cursor) {
      conditions.push(lt(newsletterFeeds.id, input.cursor));
    }

    const rows = await ctx.db.query.newsletterFeeds.findMany({
      where: and(...conditions),
      orderBy: [desc(newsletterFeeds.lastSeenAt), desc(newsletterFeeds.id)],
      limit: limit + 1,
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return {
      items: items.map((row) => ({
        id: row.id,
        displayName: row.displayName ?? row.fromAddress ?? 'Newsletter',
        fromAddress: row.fromAddress,
        status: row.status,
        detectionScore: row.detectionScore,
        lastSeenAt: row.lastSeenAt,
        firstSeenAt: row.firstSeenAt,
        unsubscribeUrl: row.unsubscribeUrl,
        unsubscribeMailto: row.unsubscribeMailto,
      })),
      nextCursor: hasMore && items.length > 0 ? items[items.length - 1].id : null,
      hasMore,
    };
  }),

  updateStatus: protectedProcedure
    .input(UpdateStatusInputSchema)
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.query.newsletterFeeds.findFirst({
        where: and(eq(newsletterFeeds.id, input.feedId), eq(newsletterFeeds.userId, ctx.userId)),
      });

      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Newsletter feed not found' });
      }

      await ctx.db
        .update(newsletterFeeds)
        .set({
          status: input.status,
          updatedAt: Date.now(),
        })
        .where(eq(newsletterFeeds.id, input.feedId));

      return { success: true as const };
    }),

  unsubscribe: protectedProcedure.input(UnsubscribeInputSchema).mutation(async ({ ctx, input }) => {
    const feed = await ctx.db.query.newsletterFeeds.findFirst({
      where: and(eq(newsletterFeeds.id, input.feedId), eq(newsletterFeeds.userId, ctx.userId)),
    });

    if (!feed) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Newsletter feed not found' });
    }

    const now = Date.now();

    let method: 'URL' | 'MAILTO' | 'ONE_CLICK_POST';
    let target: string;
    let status: 'REQUESTED' | 'COMPLETED' | 'FAILED' = 'REQUESTED';
    let errorMessage: string | null = null;

    if (
      feed.unsubscribePostHeader?.toLowerCase().includes('one-click') &&
      feed.unsubscribeUrl
    ) {
      method = 'ONE_CLICK_POST';
      target = feed.unsubscribeUrl;

      try {
        const response = await fetch(feed.unsubscribeUrl, {
          method: 'POST',
        });

        if (!response.ok) {
          const responseText = await response.text();
          throw new Error(`HTTP ${response.status}: ${responseText}`);
        }

        status = 'COMPLETED';
      } catch (error) {
        status = 'FAILED';
        errorMessage = error instanceof Error ? error.message : String(error);
      }
    } else if (feed.unsubscribeUrl) {
      method = 'URL';
      target = feed.unsubscribeUrl;
      status = 'REQUESTED';
    } else if (feed.unsubscribeMailto) {
      method = 'MAILTO';
      target = feed.unsubscribeMailto;
      status = 'REQUESTED';
    } else {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'This newsletter does not expose an unsubscribe method',
      });
    }

    await ctx.db.insert(newsletterUnsubscribeEvents).values({
      id: ulid(),
      userId: ctx.userId,
      newsletterFeedId: feed.id,
      method,
      target,
      status,
      error: errorMessage,
      requestedAt: now,
      completedAt: status === 'COMPLETED' ? now : null,
    });

    await ctx.db
      .update(newsletterFeeds)
      .set({
        status: 'UNSUBSCRIBED',
        updatedAt: now,
      })
      .where(eq(newsletterFeeds.id, feed.id));

    return {
      success: true as const,
      method,
      target,
      status,
      error: errorMessage,
    };
  }),

  syncNow: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      const result = await syncGmailNewslettersForUser(
        ctx.userId,
        ctx.db,
        ctx.env as TokenRefreshEnv
      );

      return {
        success: true as const,
        result,
      };
    } catch (error) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: error instanceof Error ? error.message : 'Failed to sync newsletters',
      });
    }
  }),

  stats: protectedProcedure.query(async ({ ctx }) => {
    const feeds = await ctx.db.query.newsletterFeeds.findMany({
      where: eq(newsletterFeeds.userId, ctx.userId),
      columns: {
        status: true,
      },
    });

    const mailbox = await ctx.db.query.gmailMailboxes.findFirst({
      where: eq(gmailMailboxes.userId, ctx.userId),
      orderBy: [desc(gmailMailboxes.updatedAt)],
    });

    const summary = {
      total: feeds.length,
      active: feeds.filter((feed) => feed.status === 'ACTIVE').length,
      hidden: feeds.filter((feed) => feed.status === 'HIDDEN').length,
      unsubscribed: feeds.filter((feed) => feed.status === 'UNSUBSCRIBED').length,
    };

    return {
      ...summary,
      lastSyncAt: mailbox?.lastSyncAt ?? null,
      lastSyncStatus: mailbox?.lastSyncStatus ?? 'IDLE',
      lastSyncError: mailbox?.lastSyncError ?? null,
    };
  }),
});

export type NewslettersRouter = typeof newslettersRouter;
