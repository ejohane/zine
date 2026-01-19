/**
 * Creators tRPC Router
 *
 * Handles creator-related operations for the Creator View feature.
 * Provides endpoints for:
 * 1. get - Get a single creator by ID
 * 2. listBookmarks - List bookmarked items for a creator
 * 3. fetchLatestContent - Fetch latest content from a creator
 * 4. checkSubscription - Check if user is subscribed to a creator
 * 5. subscribe - Subscribe to a creator
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, desc, lt, or, sql } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc';
import { creators, items, userItems } from '../../db/schema';
import { UserItemState } from '@zine/shared';
import { decodeCursor, encodeCursor } from '../../lib/pagination';
import { toItemView, type ItemView } from './items';

// ============================================================================
// Zod Schemas
// ============================================================================

const GetInputSchema = z.object({
  creatorId: z.string().min(1, 'Creator ID is required'),
});

const ListBookmarksInputSchema = z.object({
  creatorId: z.string().min(1, 'Creator ID is required'),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

const FetchLatestContentInputSchema = z.object({
  creatorId: z.string().min(1, 'Creator ID is required'),
});

const CheckSubscriptionInputSchema = z.object({
  creatorId: z.string().min(1, 'Creator ID is required'),
});

const SubscribeInputSchema = z.object({
  creatorId: z.string().min(1, 'Creator ID is required'),
});

// ============================================================================
// Router
// ============================================================================

export const creatorsRouter = router({
  /**
   * Get a single creator by ID
   *
   * Returns the creator profile including name, image, and stats.
   *
   * @param creatorId - The unique identifier of the creator
   * @returns Creator profile
   * @throws NOT_FOUND if creator doesn't exist
   */
  get: protectedProcedure.input(GetInputSchema).query(async ({ ctx, input }) => {
    const creator = await ctx.db
      .select()
      .from(creators)
      .where(eq(creators.id, input.creatorId))
      .limit(1);

    if (creator.length === 0) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Creator not found',
      });
    }

    return creator[0];
  }),

  /**
   * List bookmarked items for a creator
   *
   * Returns a paginated list of items the user has bookmarked
   * from this creator, sorted by bookmarked date descending.
   *
   * @param creatorId - The unique identifier of the creator
   * @param cursor - Optional cursor for pagination
   * @param limit - Number of items to return (default 20, max 50)
   * @returns Paginated list of bookmarked items
   */
  listBookmarks: protectedProcedure
    .input(ListBookmarksInputSchema)
    .query(
      async ({
        ctx,
        input,
      }): Promise<{ items: ItemView[]; nextCursor: string | null; hasMore: boolean }> => {
        const { creatorId, limit } = input;
        const cursor = input.cursor ? decodeCursor(input.cursor) : null;

        // Verify creator exists
        const creator = await ctx.db
          .select({ id: creators.id })
          .from(creators)
          .where(eq(creators.id, creatorId))
          .limit(1);

        if (creator.length === 0) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Creator not found',
          });
        }

        // Build WHERE conditions
        const conditions = [
          eq(items.creatorId, creatorId),
          eq(userItems.userId, ctx.userId),
          eq(userItems.state, UserItemState.BOOKMARKED),
        ];

        // Use COALESCE to handle NULL bookmarkedAt - falls back to ingestedAt
        const sortField = sql`COALESCE(${userItems.bookmarkedAt}, ${userItems.ingestedAt})`;

        // Apply cursor-based pagination (fetch items bookmarked before cursor)
        if (cursor) {
          conditions.push(
            or(
              sql`${sortField} < ${cursor.sortValue}`,
              and(sql`${sortField} = ${cursor.sortValue}`, lt(userItems.id, cursor.id))
            )!
          );
        }

        // Execute query with join
        const results = await ctx.db
          .select()
          .from(userItems)
          .innerJoin(items, eq(userItems.itemId, items.id))
          .where(and(...conditions))
          .orderBy(sql`${sortField} DESC`, desc(userItems.id))
          .limit(limit + 1); // Fetch one extra to check for more

        // Check if there are more results
        const hasMore = results.length > limit;
        const pageResults = hasMore ? results.slice(0, limit) : results;

        // Transform to ItemView
        const itemViews = pageResults.map(toItemView);

        // Generate next cursor
        let nextCursor: string | null = null;
        if (hasMore && pageResults.length > 0) {
          const lastResult = pageResults[pageResults.length - 1];
          nextCursor = encodeCursor({
            sortValue: lastResult.user_items.bookmarkedAt ?? lastResult.user_items.ingestedAt,
            id: lastResult.user_items.id,
          });
        }

        return {
          items: itemViews,
          nextCursor,
          hasMore,
        };
      }
    ),

  /**
   * Fetch latest content from a creator
   *
   * Queries the provider API to get the creator's most recent
   * published content. Used for discovery and suggestions.
   *
   * @param creatorId - The unique identifier of the creator
   * @returns List of latest content items from the creator
   */
  fetchLatestContent: protectedProcedure
    .input(FetchLatestContentInputSchema)
    .query(async ({ ctx, input }) => {
      // TODO: Implement - will be done in zine-l7fp
      void ctx;
      void input;
      return {
        items: [],
      };
    }),

  /**
   * Check if user is subscribed to a creator
   *
   * Returns the subscription status for a creator. This checks
   * both provider-level subscriptions (e.g., YouTube channel subscription)
   * and app-level following.
   *
   * @param creatorId - The unique identifier of the creator
   * @returns Subscription status information
   */
  checkSubscription: protectedProcedure
    .input(CheckSubscriptionInputSchema)
    .query(async ({ ctx, input }) => {
      // TODO: Implement - will be done in zine-tqjs
      void ctx;
      void input;
      return {
        isSubscribed: false,
        subscribedAt: null as string | null,
      };
    }),

  /**
   * Subscribe to a creator
   *
   * Creates or updates a subscription to a creator. May also
   * trigger a provider-level subscription if the user has
   * connected their account.
   *
   * @param creatorId - The unique identifier of the creator
   * @returns Updated subscription status
   */
  subscribe: protectedProcedure.input(SubscribeInputSchema).mutation(async ({ ctx, input }) => {
    // TODO: Implement - will be done in zine-j4cd
    void ctx;
    void input;
    return {
      success: true,
      isSubscribed: true,
      subscribedAt: new Date().toISOString(),
    };
  }),
});

export type CreatorsRouter = typeof creatorsRouter;
