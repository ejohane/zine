import { TRPCError } from '@trpc/server';
import { and, desc, eq, inArray, like, lt } from 'drizzle-orm';
import { z } from 'zod';
import { ulid } from 'ulid';

import {
  newsletterFeeds,
  newsletterUnsubscribeEvents,
  gmailMailboxes,
  newsletterFeedMessages,
  items,
  providerConnections,
} from '../../db/schema';
import {
  syncGmailNewslettersForUser,
  isLikelyNewsletterFeedIdentity,
  seedLatestNewsletterItemForFeed,
} from '../../newsletters/gmail';
import type { TokenRefreshEnv } from '../../lib/token-refresh';
import { protectedProcedure, router } from '../trpc';
import type { Database } from '../../db';

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

type ActiveGmailMailbox = {
  id: string;
  lastSyncAt: number | null;
  lastSyncStatus: string;
  lastSyncError: string | null;
  updatedAt: number;
};

async function getActiveGmailMailboxes(
  db: Database,
  userId: string
): Promise<ActiveGmailMailbox[]> {
  const connection = await db.query.providerConnections.findFirst({
    where: and(
      eq(providerConnections.userId, userId),
      eq(providerConnections.provider, 'GMAIL'),
      eq(providerConnections.status, 'ACTIVE')
    ),
    columns: {
      id: true,
    },
  });

  if (!connection) {
    return [];
  }

  return db.query.gmailMailboxes.findMany({
    where: and(
      eq(gmailMailboxes.userId, userId),
      eq(gmailMailboxes.providerConnectionId, connection.id)
    ),
    columns: {
      id: true,
      lastSyncAt: true,
      lastSyncStatus: true,
      lastSyncError: true,
      updatedAt: true,
    },
  });
}

export const newslettersRouter = router({
  list: protectedProcedure
    .input(ListNewslettersInputSchema.optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50;
      const activeMailboxes = await getActiveGmailMailboxes(ctx.db, ctx.userId);
      const mailboxIds = activeMailboxes.map((row) => row.id);

      if (mailboxIds.length === 0) {
        return {
          items: [],
          nextCursor: null,
          hasMore: false,
        };
      }

      const conditions = [
        eq(newsletterFeeds.userId, ctx.userId),
        inArray(newsletterFeeds.gmailMailboxId, mailboxIds),
      ];

      if (input?.status) {
        conditions.push(eq(newsletterFeeds.status, input.status));
      }

      if (input?.search) {
        const term = `%${input.search.toLowerCase()}%`;
        conditions.push(like(newsletterFeeds.displayName, term));
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
      const visibleRows = (hasMore ? rows.slice(0, limit) : rows).filter((row) =>
        isLikelyNewsletterFeedIdentity({
          listId: row.listId,
          unsubscribeMailto: row.unsubscribeMailto,
          unsubscribeUrl: row.unsubscribeUrl,
          fromAddress: row.fromAddress,
          displayName: row.displayName,
        })
      );

      const latestThumbnailByFeedId = new Map<string, string | null>();
      const visibleFeedIds = visibleRows.map((row) => row.id);

      if (visibleFeedIds.length > 0) {
        const messageRows = await ctx.db.query.newsletterFeedMessages.findMany({
          where: and(
            eq(newsletterFeedMessages.userId, ctx.userId),
            inArray(newsletterFeedMessages.newsletterFeedId, visibleFeedIds)
          ),
          columns: {
            newsletterFeedId: true,
            itemId: true,
            internalDate: true,
            createdAt: true,
          },
          orderBy: [
            desc(newsletterFeedMessages.internalDate),
            desc(newsletterFeedMessages.createdAt),
          ],
        });

        const latestItemIdByFeedId = new Map<string, string>();
        for (const row of messageRows) {
          if (!latestItemIdByFeedId.has(row.newsletterFeedId)) {
            latestItemIdByFeedId.set(row.newsletterFeedId, row.itemId);
          }
        }

        const latestItemIds = Array.from(new Set(latestItemIdByFeedId.values()));
        if (latestItemIds.length > 0) {
          const latestItems = await ctx.db.query.items.findMany({
            where: inArray(items.id, latestItemIds),
            columns: {
              id: true,
              thumbnailUrl: true,
            },
          });

          const thumbnailByItemId = new Map(
            latestItems.map((item) => [item.id, item.thumbnailUrl])
          );

          for (const [feedId, itemId] of latestItemIdByFeedId.entries()) {
            latestThumbnailByFeedId.set(feedId, thumbnailByItemId.get(itemId) ?? null);
          }
        }
      }

      return {
        items: visibleRows.map((row) => ({
          id: row.id,
          displayName: row.displayName ?? row.fromAddress ?? 'Newsletter',
          fromAddress: row.fromAddress,
          listId: row.listId,
          imageUrl: latestThumbnailByFeedId.get(row.id) ?? null,
          status: row.status,
          detectionScore: row.detectionScore,
          lastSeenAt: row.lastSeenAt,
          firstSeenAt: row.firstSeenAt,
          unsubscribeUrl: row.unsubscribeUrl,
          unsubscribeMailto: row.unsubscribeMailto,
        })),
        nextCursor: hasMore ? (rows[rows.length - 1]?.id ?? null) : null,
        hasMore,
      };
    }),

  updateStatus: protectedProcedure
    .input(UpdateStatusInputSchema)
    .mutation(async ({ ctx, input }) => {
      const activeMailboxes = await getActiveGmailMailboxes(ctx.db, ctx.userId);
      const mailboxIds = activeMailboxes.map((row) => row.id);

      if (mailboxIds.length === 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Gmail is not connected. Connect Gmail to manage newsletters.',
        });
      }

      const row = await ctx.db.query.newsletterFeeds.findFirst({
        where: and(
          eq(newsletterFeeds.id, input.feedId),
          eq(newsletterFeeds.userId, ctx.userId),
          inArray(newsletterFeeds.gmailMailboxId, mailboxIds)
        ),
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

      let seededLatestItem = false;
      let seedReason: string | null = null;
      const shouldSeedLatest = row.status !== 'ACTIVE' && input.status === 'ACTIVE';

      if (shouldSeedLatest) {
        try {
          const seedResult = await seedLatestNewsletterItemForFeed({
            db: ctx.db,
            userId: ctx.userId,
            feedId: row.id,
            env: ctx.env as TokenRefreshEnv,
          });

          seededLatestItem = seedResult.created;
          seedReason = seedResult.reason;
        } catch (error) {
          // Status update should still succeed if seeding fails.
          seedReason = error instanceof Error ? error.message : 'seed_failed';
        }
      }

      return {
        success: true as const,
        seededLatestItem,
        seedReason,
      };
    }),

  unsubscribe: protectedProcedure.input(UnsubscribeInputSchema).mutation(async ({ ctx, input }) => {
    const activeMailboxes = await getActiveGmailMailboxes(ctx.db, ctx.userId);
    const mailboxIds = activeMailboxes.map((row) => row.id);

    if (mailboxIds.length === 0) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Gmail is not connected. Connect Gmail to manage newsletters.',
      });
    }

    const feed = await ctx.db.query.newsletterFeeds.findFirst({
      where: and(
        eq(newsletterFeeds.id, input.feedId),
        eq(newsletterFeeds.userId, ctx.userId),
        inArray(newsletterFeeds.gmailMailboxId, mailboxIds)
      ),
    });

    if (!feed) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Newsletter feed not found' });
    }

    const now = Date.now();

    let method: 'URL' | 'MAILTO' | 'ONE_CLICK_POST';
    let target: string;
    let status: 'REQUESTED' | 'COMPLETED' | 'FAILED' = 'REQUESTED';
    let errorMessage: string | null = null;

    if (feed.unsubscribePostHeader?.toLowerCase().includes('one-click') && feed.unsubscribeUrl) {
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
    const activeMailboxes = await getActiveGmailMailboxes(ctx.db, ctx.userId);
    if (activeMailboxes.length === 0) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Gmail is not connected. Connect Gmail before syncing newsletters.',
      });
    }

    try {
      const result = await syncGmailNewslettersForUser(
        ctx.userId,
        ctx.db,
        ctx.env as TokenRefreshEnv
      );

      // Repair/upgrade latest issue links for active feeds (legacy mail.google.com URLs).
      // This runs only on manual "Sync now" and is best-effort.
      const mailboxIds = activeMailboxes.map((row) => row.id);
      const activeFeeds = await ctx.db.query.newsletterFeeds.findMany({
        where: and(
          eq(newsletterFeeds.userId, ctx.userId),
          inArray(newsletterFeeds.gmailMailboxId, mailboxIds),
          eq(newsletterFeeds.status, 'ACTIVE')
        ),
        columns: {
          id: true,
        },
      });

      let repairedFeeds = 0;
      let repairFailures = 0;
      for (const feed of activeFeeds) {
        try {
          await seedLatestNewsletterItemForFeed({
            db: ctx.db,
            userId: ctx.userId,
            feedId: feed.id,
            env: ctx.env as TokenRefreshEnv,
          });
          repairedFeeds += 1;
        } catch {
          repairFailures += 1;
        }
      }

      return {
        success: true as const,
        result,
        repair: {
          attempted: activeFeeds.length,
          repairedFeeds,
          repairFailures,
        },
      };
    } catch (error) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: error instanceof Error ? error.message : 'Failed to sync newsletters',
      });
    }
  }),

  stats: protectedProcedure.query(async ({ ctx }) => {
    const activeMailboxes = await getActiveGmailMailboxes(ctx.db, ctx.userId);
    if (activeMailboxes.length === 0) {
      return {
        total: 0,
        active: 0,
        hidden: 0,
        unsubscribed: 0,
        lastSyncAt: null,
        lastSyncStatus: 'IDLE',
        lastSyncError: null,
      };
    }

    const mailboxIds = activeMailboxes.map((row) => row.id);
    const feeds = await ctx.db.query.newsletterFeeds.findMany({
      where: and(
        eq(newsletterFeeds.userId, ctx.userId),
        inArray(newsletterFeeds.gmailMailboxId, mailboxIds)
      ),
      columns: {
        status: true,
      },
    });

    const mailbox = [...activeMailboxes].sort((a, b) => b.updatedAt - a.updatedAt)[0];

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
