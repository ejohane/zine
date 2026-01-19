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
import { ulid } from 'ulid';
import { router, protectedProcedure } from '../trpc';
import { creators, items, userItems, subscriptions, providerConnections } from '../../db/schema';
import { UserItemState } from '@zine/shared';
import { decodeCursor, encodeCursor } from '../../lib/pagination';
import { toItemView, type ItemView } from './items';

// ============================================================================
// Types
// ============================================================================

/**
 * Response shape for checkSubscription
 */
export interface CheckSubscriptionResponse {
  isSubscribed: boolean;
  subscriptionId?: string;
  canSubscribe: boolean;
  reason?: 'PROVIDER_NOT_SUPPORTED' | 'NOT_CONNECTED';
}

/**
 * Response shape for subscribe
 */
export interface SubscribeResponse {
  id: string;
  provider: string;
  name: string;
  imageUrl: string | null;
  enabled: boolean;
}

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
   * Use cases:
   * 1. Subscribed + Connected: User can view and manage subscription
   * 2. Not Subscribed + Connected: User can subscribe
   * 3. Not Subscribed + Not Connected: Prompt to connect provider
   * 4. Unsupported Provider: No subscription functionality
   *
   * @param creatorId - The unique identifier of the creator
   * @returns Subscription status information
   */
  checkSubscription: protectedProcedure
    .input(CheckSubscriptionInputSchema)
    .query(async ({ ctx, input }): Promise<CheckSubscriptionResponse> => {
      // 1. Get the creator
      const creator = await ctx.db.query.creators.findFirst({
        where: eq(creators.id, input.creatorId),
      });

      if (!creator) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Creator not found',
        });
      }

      // 2. Only YOUTUBE and SPOTIFY support subscriptions
      if (!['YOUTUBE', 'SPOTIFY'].includes(creator.provider)) {
        return {
          isSubscribed: false,
          canSubscribe: false,
          reason: 'PROVIDER_NOT_SUPPORTED',
        };
      }

      // 3. Check if subscription exists for this user + provider + creator
      const subscription = await ctx.db.query.subscriptions.findFirst({
        where: and(
          eq(subscriptions.userId, ctx.userId),
          eq(subscriptions.provider, creator.provider),
          eq(subscriptions.providerChannelId, creator.providerCreatorId)
        ),
      });

      // 4. Check if user is connected to the provider
      const connection = await ctx.db.query.providerConnections.findFirst({
        where: and(
          eq(providerConnections.userId, ctx.userId),
          eq(providerConnections.provider, creator.provider),
          eq(providerConnections.status, 'ACTIVE')
        ),
      });

      return {
        isSubscribed: !!subscription && subscription.status === 'ACTIVE',
        subscriptionId: subscription?.id,
        canSubscribe: !!connection,
        reason: connection ? undefined : 'NOT_CONNECTED',
      };
    }),

  /**
   * Subscribe to a creator
   *
   * Creates a subscription to a creator's content. This is idempotent -
   * if a subscription already exists, it returns the existing subscription.
   *
   * Requirements:
   * - Creator must exist
   * - Provider must support subscriptions (YOUTUBE or SPOTIFY)
   * - User must have an active connection to the provider
   *
   * @param creatorId - The unique identifier of the creator
   * @returns Subscription object
   * @throws NOT_FOUND if creator doesn't exist
   * @throws BAD_REQUEST if provider doesn't support subscriptions
   * @throws PRECONDITION_FAILED if user isn't connected to the provider
   */
  subscribe: protectedProcedure
    .input(SubscribeInputSchema)
    .mutation(async ({ ctx, input }): Promise<SubscribeResponse> => {
      // 1. Get the creator
      const creator = await ctx.db.query.creators.findFirst({
        where: eq(creators.id, input.creatorId),
      });

      if (!creator) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Creator not found',
        });
      }

      // 2. Only YOUTUBE and SPOTIFY support subscriptions
      if (!['YOUTUBE', 'SPOTIFY'].includes(creator.provider)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Subscriptions not supported for this provider',
        });
      }

      // 3. Check if user is connected to the provider
      const connection = await ctx.db.query.providerConnections.findFirst({
        where: and(
          eq(providerConnections.userId, ctx.userId),
          eq(providerConnections.provider, creator.provider),
          eq(providerConnections.status, 'ACTIVE')
        ),
      });

      if (!connection) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Please connect your account first',
        });
      }

      // 4. Check if subscription already exists (idempotent)
      const existing = await ctx.db.query.subscriptions.findFirst({
        where: and(
          eq(subscriptions.userId, ctx.userId),
          eq(subscriptions.provider, creator.provider),
          eq(subscriptions.providerChannelId, creator.providerCreatorId)
        ),
      });

      if (existing) {
        return {
          id: existing.id,
          provider: existing.provider,
          name: existing.name,
          imageUrl: existing.imageUrl,
          enabled: existing.status === 'ACTIVE',
        };
      }

      // 5. Create new subscription
      const now = Date.now();
      const subscriptionId = ulid();

      await ctx.db.insert(subscriptions).values({
        id: subscriptionId,
        userId: ctx.userId,
        provider: creator.provider,
        providerChannelId: creator.providerCreatorId,
        name: creator.name,
        description: creator.description,
        imageUrl: creator.imageUrl,
        externalUrl: creator.externalUrl,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      });

      return {
        id: subscriptionId,
        provider: creator.provider,
        name: creator.name,
        imageUrl: creator.imageUrl,
        enabled: true,
      };
    }),
});

export type CreatorsRouter = typeof creatorsRouter;
