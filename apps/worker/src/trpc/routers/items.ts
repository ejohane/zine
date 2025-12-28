// apps/worker/src/trpc/routers/items.ts
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, desc, or, lt, isNotNull } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc';
import { ContentType, type Provider, UserItemState } from '@zine/shared';
import { userItems, items } from '../../db/schema';
import { decodeCursor, encodeCursor, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../lib/pagination';

// ============================================================================
// Types
// ============================================================================

/**
 * Combined view of Item + UserItem for API responses.
 * This flattens the joined data for easier consumption by the mobile client.
 */
export type ItemView = {
  // Identifiers
  id: string; // UserItem ID (for mutations)
  itemId: string; // Canonical Item ID

  // Display
  title: string;
  thumbnailUrl: string | null;
  canonicalUrl: string;

  // Classification
  contentType: ContentType;
  provider: Provider;

  // Attribution
  creator: string;
  publisher: string | null;

  // Metadata
  summary: string | null;
  duration: number | null; // seconds
  publishedAt: string | null;

  // User state
  state: UserItemState;
  ingestedAt: string;
  bookmarkedAt: string | null;

  // Progress (for "Jump Back In")
  progress: {
    position: number;
    duration: number;
    percent: number;
  } | null;

  // Consumption tracking
  isFinished: boolean;
  finishedAt: string | null;
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Transform a joined DB row (userItems + items) into an ItemView
 */
function toItemView(row: {
  user_items: typeof userItems.$inferSelect;
  items: typeof items.$inferSelect;
}): ItemView {
  const userItem = row.user_items;
  const item = row.items;

  return {
    id: userItem.id,
    itemId: item.id,
    title: item.title,
    thumbnailUrl: item.thumbnailUrl,
    canonicalUrl: item.canonicalUrl,
    contentType: item.contentType as ContentType,
    provider: item.provider as Provider,
    creator: item.creator,
    publisher: item.publisher,
    summary: item.summary,
    duration: item.duration,
    publishedAt: item.publishedAt,
    state: userItem.state as UserItemState,
    ingestedAt: userItem.ingestedAt,
    bookmarkedAt: userItem.bookmarkedAt,
    progress:
      userItem.progressPosition !== null && userItem.progressDuration !== null
        ? {
            position: userItem.progressPosition,
            duration: userItem.progressDuration,
            percent: Math.round(
              (userItem.progressPosition / (userItem.progressDuration || 1)) * 100
            ),
          }
        : null,
    isFinished: userItem.isFinished,
    finishedAt: userItem.finishedAt,
  };
}

// ============================================================================
// Zod Schemas
// ============================================================================

// Use UPPERCASE enum values to match @zine/shared enums
const ProviderSchema = z.enum(['YOUTUBE', 'SPOTIFY', 'SUBSTACK', 'RSS']);
const ContentTypeSchema = z.enum(['VIDEO', 'PODCAST', 'ARTICLE', 'POST']);

const FilterSchema = z
  .object({
    provider: ProviderSchema.optional(),
    contentType: ContentTypeSchema.optional(),
  })
  .optional();

const PaginationSchema = z.object({
  filter: FilterSchema,
  cursor: z.string().optional(),
  limit: z.number().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

// ============================================================================
// Router
// ============================================================================

export const itemsRouter = router({
  /**
   * Get items in the triage queue (INBOX state).
   * Supports filtering by provider and content type.
   * Uses cursor-based pagination sorted by ingestedAt DESC.
   */
  inbox: protectedProcedure.input(PaginationSchema.optional()).query(async ({ input, ctx }) => {
    const limit = input?.limit ?? DEFAULT_PAGE_SIZE;
    const cursor = input?.cursor ? decodeCursor(input.cursor) : null;

    // Build WHERE conditions
    const conditions = [eq(userItems.userId, ctx.userId), eq(userItems.state, UserItemState.INBOX)];

    // Apply cursor-based pagination (fetch items older than cursor)
    if (cursor) {
      conditions.push(
        or(
          lt(userItems.ingestedAt, cursor.sortValue),
          and(eq(userItems.ingestedAt, cursor.sortValue), lt(userItems.id, cursor.id))
        )!
      );
    }

    // Apply filters
    if (input?.filter?.provider) {
      conditions.push(eq(items.provider, input.filter.provider));
    }
    if (input?.filter?.contentType) {
      conditions.push(eq(items.contentType, input.filter.contentType));
    }

    // Execute query with join
    const results = await ctx.db
      .select()
      .from(userItems)
      .innerJoin(items, eq(userItems.itemId, items.id))
      .where(and(...conditions))
      .orderBy(desc(userItems.ingestedAt), desc(userItems.id))
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
        sortValue: lastResult.user_items.ingestedAt,
        id: lastResult.user_items.id,
      });
    }

    return {
      items: itemViews,
      nextCursor,
    };
  }),

  /**
   * Get bookmarked items (BOOKMARKED state).
   * Supports filtering by provider and content type.
   * Uses cursor-based pagination sorted by bookmarkedAt DESC.
   */
  library: protectedProcedure.input(PaginationSchema.optional()).query(async ({ input, ctx }) => {
    const limit = input?.limit ?? DEFAULT_PAGE_SIZE;
    const cursor = input?.cursor ? decodeCursor(input.cursor) : null;

    // Build WHERE conditions
    const conditions = [
      eq(userItems.userId, ctx.userId),
      eq(userItems.state, UserItemState.BOOKMARKED),
    ];

    // Apply cursor-based pagination (fetch items bookmarked before cursor)
    if (cursor) {
      conditions.push(
        or(
          lt(userItems.bookmarkedAt, cursor.sortValue),
          and(eq(userItems.bookmarkedAt, cursor.sortValue), lt(userItems.id, cursor.id))
        )!
      );
    }

    // Apply filters
    if (input?.filter?.provider) {
      conditions.push(eq(items.provider, input.filter.provider));
    }
    if (input?.filter?.contentType) {
      conditions.push(eq(items.contentType, input.filter.contentType));
    }

    // Execute query with join
    const results = await ctx.db
      .select()
      .from(userItems)
      .innerJoin(items, eq(userItems.itemId, items.id))
      .where(and(...conditions))
      .orderBy(desc(userItems.bookmarkedAt), desc(userItems.id))
      .limit(limit + 1);

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
    };
  }),

  /**
   * Get curated home sections.
   * Returns recent bookmarks, items with progress ("Jump Back In"), and items by content type.
   */
  home: protectedProcedure.query(async ({ ctx }) => {
    const SECTION_LIMIT = 5;

    // Base query for bookmarked items
    const baseConditions = [
      eq(userItems.userId, ctx.userId),
      eq(userItems.state, UserItemState.BOOKMARKED),
    ];

    // Fetch recent bookmarks
    const recentBookmarksQuery = ctx.db
      .select()
      .from(userItems)
      .innerJoin(items, eq(userItems.itemId, items.id))
      .where(and(...baseConditions))
      .orderBy(desc(userItems.bookmarkedAt))
      .limit(SECTION_LIMIT);

    // Fetch items with progress ("Jump Back In")
    const jumpBackInQuery = ctx.db
      .select()
      .from(userItems)
      .innerJoin(items, eq(userItems.itemId, items.id))
      .where(
        and(
          ...baseConditions,
          // Has progress but not finished
          isNotNull(userItems.progressPosition)
        )
      )
      .orderBy(desc(userItems.progressUpdatedAt))
      .limit(SECTION_LIMIT);

    // Fetch videos
    const videosQuery = ctx.db
      .select()
      .from(userItems)
      .innerJoin(items, eq(userItems.itemId, items.id))
      .where(and(...baseConditions, eq(items.contentType, ContentType.VIDEO)))
      .orderBy(desc(userItems.bookmarkedAt))
      .limit(SECTION_LIMIT);

    // Fetch podcasts
    const podcastsQuery = ctx.db
      .select()
      .from(userItems)
      .innerJoin(items, eq(userItems.itemId, items.id))
      .where(and(...baseConditions, eq(items.contentType, ContentType.PODCAST)))
      .orderBy(desc(userItems.bookmarkedAt))
      .limit(SECTION_LIMIT);

    // Fetch articles
    const articlesQuery = ctx.db
      .select()
      .from(userItems)
      .innerJoin(items, eq(userItems.itemId, items.id))
      .where(and(...baseConditions, eq(items.contentType, ContentType.ARTICLE)))
      .orderBy(desc(userItems.bookmarkedAt))
      .limit(SECTION_LIMIT);

    // Execute all queries in parallel
    const [recentBookmarks, jumpBackIn, videos, podcasts, articles] = await Promise.all([
      recentBookmarksQuery,
      jumpBackInQuery,
      videosQuery,
      podcastsQuery,
      articlesQuery,
    ]);

    // Filter jumpBackIn to only include items with actual progress
    const jumpBackInFiltered = jumpBackIn.filter(
      (row) => row.user_items.progressPosition !== null && row.user_items.progressPosition > 0
    );

    return {
      recentBookmarks: recentBookmarks.map(toItemView),
      jumpBackIn: jumpBackInFiltered.map(toItemView),
      byContentType: {
        videos: videos.map(toItemView),
        podcasts: podcasts.map(toItemView),
        articles: articles.map(toItemView),
      },
    };
  }),

  /**
   * Get a single item by UserItem ID.
   */
  get: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const result = await ctx.db
        .select()
        .from(userItems)
        .innerJoin(items, eq(userItems.itemId, items.id))
        .where(and(eq(userItems.id, input.id), eq(userItems.userId, ctx.userId)))
        .limit(1);

      if (result.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Item ${input.id} not found`,
        });
      }

      return toItemView(result[0]);
    }),

  /**
   * Move an item to BOOKMARKED state.
   */
  bookmark: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const now = new Date().toISOString();

      // Verify the item exists and belongs to the user
      const existing = await ctx.db
        .select({ id: userItems.id })
        .from(userItems)
        .where(and(eq(userItems.id, input.id), eq(userItems.userId, ctx.userId)))
        .limit(1);

      if (existing.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Item ${input.id} not found`,
        });
      }

      // Update the item state
      await ctx.db
        .update(userItems)
        .set({
          state: UserItemState.BOOKMARKED,
          bookmarkedAt: now,
          updatedAt: now,
        })
        .where(eq(userItems.id, input.id));

      return { success: true as const };
    }),

  /**
   * Move an item to ARCHIVED state.
   */
  archive: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const now = new Date().toISOString();

      // Verify the item exists and belongs to the user
      const existing = await ctx.db
        .select({ id: userItems.id })
        .from(userItems)
        .where(and(eq(userItems.id, input.id), eq(userItems.userId, ctx.userId)))
        .limit(1);

      if (existing.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Item ${input.id} not found`,
        });
      }

      // Update the item state
      await ctx.db
        .update(userItems)
        .set({
          state: UserItemState.ARCHIVED,
          archivedAt: now,
          updatedAt: now,
        })
        .where(eq(userItems.id, input.id));

      return { success: true as const };
    }),

  /**
   * Move an item from BOOKMARKED back to INBOX state.
   * Use case: User changes their mind, wants to re-triage.
   */
  unbookmark: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const now = new Date().toISOString();

      // Find the user item
      const existing = await ctx.db
        .select({ id: userItems.id, state: userItems.state })
        .from(userItems)
        .where(and(eq(userItems.id, input.id), eq(userItems.userId, ctx.userId)))
        .limit(1);

      if (existing.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Item not found',
        });
      }

      // Verify bookmarked state
      if (existing[0].state !== UserItemState.BOOKMARKED) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Item is not bookmarked',
        });
      }

      // Update to INBOX state
      await ctx.db
        .update(userItems)
        .set({
          state: UserItemState.INBOX,
          bookmarkedAt: null,
          updatedAt: now,
        })
        .where(eq(userItems.id, input.id));

      return { success: true as const };
    }),

  /**
   * Toggle the isFinished state of an item.
   * Works in any state (INBOX, BOOKMARKED, ARCHIVED).
   */
  toggleFinished: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const now = new Date().toISOString();

      // Find the user item
      const existing = await ctx.db
        .select({ id: userItems.id, isFinished: userItems.isFinished })
        .from(userItems)
        .where(and(eq(userItems.id, input.id), eq(userItems.userId, ctx.userId)))
        .limit(1);

      if (existing.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Item not found',
        });
      }

      // Calculate new state
      const newIsFinished = !existing[0].isFinished;
      const newFinishedAt = newIsFinished ? now : null;

      // Update
      await ctx.db
        .update(userItems)
        .set({
          isFinished: newIsFinished,
          finishedAt: newFinishedAt,
          updatedAt: now,
        })
        .where(eq(userItems.id, input.id));

      return {
        success: true as const,
        isFinished: newIsFinished,
        finishedAt: newFinishedAt,
      };
    }),

  /**
   * Update playback/reading progress for an item.
   */
  updateProgress: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        position: z.number().min(0),
        duration: z.number().min(0),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const now = new Date().toISOString();

      // Verify the item exists and belongs to the user
      const existing = await ctx.db
        .select({ id: userItems.id })
        .from(userItems)
        .where(and(eq(userItems.id, input.id), eq(userItems.userId, ctx.userId)))
        .limit(1);

      if (existing.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Item ${input.id} not found`,
        });
      }

      // Update progress
      await ctx.db
        .update(userItems)
        .set({
          progressPosition: input.position,
          progressDuration: input.duration,
          progressUpdatedAt: now,
          updatedAt: now,
        })
        .where(eq(userItems.id, input.id));

      return { success: true as const };
    }),
});

export type ItemsRouter = typeof itemsRouter;
