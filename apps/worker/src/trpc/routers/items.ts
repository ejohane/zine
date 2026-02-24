// apps/worker/src/trpc/routers/items.ts
import { z } from 'zod';
import { ulid } from 'ulid';
import { TRPCError } from '@trpc/server';
import { eq, and, desc, or, lt, isNotNull, sql, inArray, type SQL } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc';
import {
  ContentType,
  type Provider,
  UserItemState,
  ProviderSchema,
  ContentTypeSchema,
} from '@zine/shared';
import { userItems, items, creators, tags, userItemTags } from '../../db/schema';
import { decodeCursor, encodeCursor, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../lib/pagination';
import { getArticleContent } from '../../lib/article-storage';
import type { Database } from '../../db';
import { buildNewsletterAvatarUrl } from '../../newsletters/avatar';

// ============================================================================
// Types
// ============================================================================

export type ItemTag = {
  id: string;
  name: string;
};

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
  creatorImageUrl: string | null;
  creatorId: string | null;
  publisher: string | null;

  // Metadata
  summary: string | null;
  duration: number | null; // seconds
  publishedAt: string | null;

  // Article-specific metadata
  wordCount: number | null;
  readingTimeMinutes: number | null;

  // User state
  state: UserItemState;
  ingestedAt: string;
  bookmarkedAt: string | null;
  lastOpenedAt: string | null;

  // Progress
  progress: {
    position: number;
    duration: number;
    percent: number;
  } | null;

  // Consumption tracking
  isFinished: boolean;
  finishedAt: string | null;

  // Optional user-defined organization
  tags: ItemTag[];
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalize a string value that might contain the literal string "null" to actual null.
 * This handles legacy data where null values were stored as the string "null".
 */
function normalizeNullString(value: string | null): string | null {
  if (value === 'null' || value === null) {
    return null;
  }
  return value;
}

function normalizeCanonicalUrlForResponse(url: string): string {
  if (!url) {
    return url;
  }

  try {
    const parsed = new URL(url);
    const isOpenSubstack =
      parsed.hostname === 'open.substack.com' || parsed.hostname.endsWith('.open.substack.com');
    if (!isOpenSubstack) {
      return url;
    }

    const pathSegments = parsed.pathname.split('/').filter(Boolean);
    if (pathSegments.length >= 4 && pathSegments[0] === 'pub' && pathSegments[2] === 'p') {
      const publication = pathSegments[1];
      const slug = pathSegments[3];
      if (publication && slug) {
        return `https://${publication}.substack.com/p/${slug}`;
      }
    }

    return url;
  } catch {
    return url;
  }
}

function parseRawMetadata(rawMetadata: string | null): Record<string, unknown> {
  if (!rawMetadata) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawMetadata);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore parse errors and fallback to an empty metadata object.
  }

  return {};
}

function getStringMetadataField(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/**
 * Transform a joined DB row (userItems + items + creators) into an ItemView.
 * Creator data comes from the creators table (single source of truth).
 */
function toItemView(
  row: {
    user_items: typeof userItems.$inferSelect;
    items: typeof items.$inferSelect;
    creators: typeof creators.$inferSelect | null;
  },
  itemTags: ItemTag[] = []
): ItemView {
  const userItem = row.user_items;
  const item = row.items;
  const creator = row.creators;
  const normalizedCreatorImageUrl = normalizeNullString(creator?.imageUrl ?? null);
  const metadata = parseRawMetadata(item.rawMetadata);
  const newsletterAvatarUrl =
    item.provider === 'GMAIL'
      ? buildNewsletterAvatarUrl({
          canonicalUrl: item.canonicalUrl,
          listId: getStringMetadataField(metadata, 'listId'),
          fromAddress:
            getStringMetadataField(metadata, 'fromAddress') ??
            getStringMetadataField(metadata, 'sender') ??
            creator?.handle ??
            null,
          unsubscribeUrl: getStringMetadataField(metadata, 'unsubscribeUrl'),
          creatorHandle: creator?.handle ?? null,
        })
      : null;
  const thumbnailUrl =
    item.thumbnailUrl ??
    (item.provider === 'GMAIL' ? (normalizedCreatorImageUrl ?? newsletterAvatarUrl) : null);
  const creatorImageUrl =
    item.provider === 'GMAIL'
      ? (normalizedCreatorImageUrl ?? newsletterAvatarUrl)
      : normalizedCreatorImageUrl;

  return {
    id: userItem.id,
    itemId: item.id,
    title: item.title,
    thumbnailUrl,
    canonicalUrl: normalizeCanonicalUrlForResponse(item.canonicalUrl),
    contentType: item.contentType as ContentType,
    provider: item.provider as Provider,
    // Creator data from creators table (normalized)
    creator: creator?.name ?? 'Unknown Creator',
    creatorImageUrl,
    creatorId: item.creatorId ?? null,
    publisher: item.publisher,
    summary: item.summary,
    duration: item.duration,
    publishedAt: item.publishedAt,
    wordCount: item.wordCount,
    readingTimeMinutes: item.readingTimeMinutes,
    state: userItem.state as UserItemState,
    ingestedAt: userItem.ingestedAt,
    bookmarkedAt: userItem.bookmarkedAt,
    lastOpenedAt: userItem.lastOpenedAt,
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
    tags: itemTags,
  };
}

function normalizeTagName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeTagKey(value: string): string {
  return normalizeTagName(value).toLowerCase();
}

function toCompactSearchTerm(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function stripVowels(value: string): string {
  return value.replace(/[aeiou]/g, '');
}

function toCompactSql(value: unknown): SQL {
  return sql`replace(replace(replace(replace(replace(replace(lower(coalesce(${value}, '')), ' ', ''), '-', ''), '_', ''), '.', ''), '/', ''), '&', '')`;
}

function toConsonantSql(value: unknown): SQL {
  const compact = toCompactSql(value);
  return sql`replace(replace(replace(replace(replace(${compact}, 'a', ''), 'e', ''), 'i', ''), 'o', ''), 'u', '')`;
}

async function getTagsForUserItems(
  ctx: { db: Database; userId: string },
  userItemIds: string[]
): Promise<Map<string, ItemTag[]>> {
  const map = new Map<string, ItemTag[]>();

  if (userItemIds.length === 0) {
    return map;
  }

  const rows = await ctx.db
    .select({
      userItemId: userItemTags.userItemId,
      tagId: tags.id,
      tagName: tags.name,
    })
    .from(userItemTags)
    .innerJoin(tags, eq(userItemTags.tagId, tags.id))
    .where(and(inArray(userItemTags.userItemId, userItemIds), eq(tags.userId, ctx.userId)))
    .orderBy(desc(userItemTags.createdAt));

  for (const row of rows) {
    const existing = map.get(row.userItemId) ?? [];
    existing.push({ id: row.tagId, name: row.tagName });
    map.set(row.userItemId, existing);
  }

  return map;
}

async function toItemViewsWithTags(
  ctx: { db: Database; userId: string },
  rows: Array<{
    user_items: typeof userItems.$inferSelect;
    items: typeof items.$inferSelect;
    creators: typeof creators.$inferSelect | null;
  }>
): Promise<ItemView[]> {
  const userItemIds = rows.map((row) => row.user_items.id);
  const tagsByItemId = await getTagsForUserItems(ctx, userItemIds);

  return rows.map((row) => toItemView(row, tagsByItemId.get(row.user_items.id) ?? []));
}

// ============================================================================
// Zod Schemas
// ============================================================================

const FilterSchema = z
  .object({
    provider: ProviderSchema.nullish(),
    contentType: ContentTypeSchema.nullish(),
    isFinished: z.boolean().nullish(),
  })
  .optional();

const PaginationSchema = z.object({
  filter: FilterSchema,
  search: z.string().trim().min(1).max(100).optional(),
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
   * Uses cursor-based pagination sorted by publishedAt DESC (most recent first).
   * Falls back to ingestedAt for items without a publishedAt date.
   */
  inbox: protectedProcedure.input(PaginationSchema.optional()).query(async ({ input, ctx }) => {
    const limit = input?.limit ?? DEFAULT_PAGE_SIZE;
    const cursor = input?.cursor ? decodeCursor(input.cursor) : null;

    // Build WHERE conditions
    const conditions = [
      eq(userItems.userId, ctx.userId),
      eq(userItems.state, UserItemState.INBOX),
      eq(userItems.isFinished, false),
    ];

    // Use COALESCE to handle NULL publishedAt - falls back to ingestedAt
    const sortField = sql`COALESCE(${items.publishedAt}, ${userItems.ingestedAt})`;

    // Apply cursor-based pagination (fetch items published before cursor)
    if (cursor) {
      conditions.push(
        or(
          sql`${sortField} < ${cursor.sortValue}`,
          and(sql`${sortField} = ${cursor.sortValue}`, lt(userItems.id, cursor.id))
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

    // Execute query with joins (items + creators)
    const results = await ctx.db
      .select()
      .from(userItems)
      .innerJoin(items, eq(userItems.itemId, items.id))
      .leftJoin(creators, eq(items.creatorId, creators.id))
      .where(and(...conditions))
      .orderBy(sql`${sortField} DESC`, desc(userItems.id))
      .limit(limit + 1); // Fetch one extra to check for more

    // Check if there are more results
    const hasMore = results.length > limit;
    const pageResults = hasMore ? results.slice(0, limit) : results;

    // Transform to ItemView
    const itemViews = await toItemViewsWithTags(ctx, pageResults);

    // Generate next cursor
    let nextCursor: string | null = null;
    if (hasMore && pageResults.length > 0) {
      const lastResult = pageResults[pageResults.length - 1];
      nextCursor = encodeCursor({
        sortValue: lastResult.items.publishedAt ?? lastResult.user_items.ingestedAt,
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
   * Supports filtering by provider/content type and search by title/creator.
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

    // Filter by finished status
    // Default behavior: hide finished items (isFinished undefined or false)
    // When isFinished: true is passed, show only finished items
    const showFinished = input?.filter?.isFinished ?? false;
    conditions.push(eq(userItems.isFinished, showFinished));

    // Use COALESCE to handle NULL bookmarkedAt - falls back to ingestedAt
    const librarySortField = sql`COALESCE(${userItems.bookmarkedAt}, ${userItems.ingestedAt})`;

    // Apply cursor-based pagination (fetch items bookmarked before cursor)
    if (cursor) {
      conditions.push(
        or(
          sql`${librarySortField} < ${cursor.sortValue}`,
          and(sql`${librarySortField} = ${cursor.sortValue}`, lt(userItems.id, cursor.id))
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

    // Apply search (case-insensitive + punctuation-insensitive + consonant fallback)
    const search = input?.search?.trim();
    if (search) {
      const loweredSearch = search.toLowerCase();
      const compactSearch = toCompactSearchTerm(search);
      const consonantSearch = stripVowels(compactSearch);

      const titleLower = sql`lower(${items.title})`;
      const creatorLower = sql`lower(coalesce(${creators.name}, ''))`;
      const titleCompact = toCompactSql(items.title);
      const creatorCompact = toCompactSql(creators.name);

      const searchConditions: SQL[] = [
        sql`${titleLower} LIKE ${`%${loweredSearch}%`}`,
        sql`${creatorLower} LIKE ${`%${loweredSearch}%`}`,
      ];

      if (compactSearch.length > 0) {
        searchConditions.push(sql`${titleCompact} LIKE ${`%${compactSearch}%`}`);
        searchConditions.push(sql`${creatorCompact} LIKE ${`%${compactSearch}%`}`);
      }

      if (consonantSearch.length >= 3) {
        const titleConsonants = toConsonantSql(items.title);
        const creatorConsonants = toConsonantSql(creators.name);
        searchConditions.push(sql`${titleConsonants} LIKE ${`%${consonantSearch}%`}`);
        searchConditions.push(sql`${creatorConsonants} LIKE ${`%${consonantSearch}%`}`);
      }

      conditions.push(or(...searchConditions)!);
    }

    // Execute query with joins (items + creators)
    const results = await ctx.db
      .select()
      .from(userItems)
      .innerJoin(items, eq(userItems.itemId, items.id))
      .leftJoin(creators, eq(items.creatorId, creators.id))
      .where(and(...conditions))
      .orderBy(sql`${librarySortField} DESC`, desc(userItems.id))
      .limit(limit + 1);

    // Check if there are more results
    const hasMore = results.length > limit;
    const pageResults = hasMore ? results.slice(0, limit) : results;

    // Transform to ItemView
    const itemViews = await toItemViewsWithTags(ctx, pageResults);

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
   * Returns recent bookmarks, recently opened bookmarks ("Jump Back In"), and items by content type.
   */
  home: protectedProcedure.query(async ({ ctx }) => {
    const SECTION_LIMIT = 5;
    const RECENTLY_OPENED_LIMIT = 10;

    // Base query for bookmarked items
    const baseConditions = [
      eq(userItems.userId, ctx.userId),
      eq(userItems.state, UserItemState.BOOKMARKED),
      eq(userItems.isFinished, false),
    ];

    // Fetch recent bookmarks
    const recentBookmarksQuery = ctx.db
      .select()
      .from(userItems)
      .innerJoin(items, eq(userItems.itemId, items.id))
      .leftJoin(creators, eq(items.creatorId, creators.id))
      .where(and(...baseConditions))
      .orderBy(desc(userItems.bookmarkedAt))
      .limit(SECTION_LIMIT);

    // Fetch recently opened bookmarks ("Jump Back In")
    const jumpBackInQuery = ctx.db
      .select()
      .from(userItems)
      .innerJoin(items, eq(userItems.itemId, items.id))
      .leftJoin(creators, eq(items.creatorId, creators.id))
      .where(and(...baseConditions, isNotNull(userItems.lastOpenedAt)))
      .orderBy(desc(userItems.lastOpenedAt))
      .limit(RECENTLY_OPENED_LIMIT);

    // Fetch videos
    const videosQuery = ctx.db
      .select()
      .from(userItems)
      .innerJoin(items, eq(userItems.itemId, items.id))
      .leftJoin(creators, eq(items.creatorId, creators.id))
      .where(and(...baseConditions, eq(items.contentType, ContentType.VIDEO)))
      .orderBy(desc(userItems.bookmarkedAt))
      .limit(SECTION_LIMIT);

    // Fetch podcasts
    const podcastsQuery = ctx.db
      .select()
      .from(userItems)
      .innerJoin(items, eq(userItems.itemId, items.id))
      .leftJoin(creators, eq(items.creatorId, creators.id))
      .where(and(...baseConditions, eq(items.contentType, ContentType.PODCAST)))
      .orderBy(desc(userItems.bookmarkedAt))
      .limit(SECTION_LIMIT);

    // Fetch articles
    const articlesQuery = ctx.db
      .select()
      .from(userItems)
      .innerJoin(items, eq(userItems.itemId, items.id))
      .leftJoin(creators, eq(items.creatorId, creators.id))
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

    const [recentBookmarksViews, jumpBackInViews, videosViews, podcastsViews, articlesViews] =
      await Promise.all([
        toItemViewsWithTags(ctx, recentBookmarks),
        toItemViewsWithTags(ctx, jumpBackIn),
        toItemViewsWithTags(ctx, videos),
        toItemViewsWithTags(ctx, podcasts),
        toItemViewsWithTags(ctx, articles),
      ]);

    return {
      recentBookmarks: recentBookmarksViews,
      jumpBackIn: jumpBackInViews,
      byContentType: {
        videos: videosViews,
        podcasts: podcastsViews,
        articles: articlesViews,
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
        .leftJoin(creators, eq(items.creatorId, creators.id))
        .where(and(eq(userItems.id, input.id), eq(userItems.userId, ctx.userId)))
        .limit(1);

      if (result.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Item ${input.id} not found`,
        });
      }

      const itemViews = await toItemViewsWithTags(ctx, result);
      return itemViews[0];
    }),

  /**
   * List all tags for the current user.
   * Used by the bookmark detail tagging flow.
   */
  listTags: protectedProcedure.query(async ({ ctx }) => {
    const userTags = await ctx.db
      .select({
        id: tags.id,
        name: tags.name,
      })
      .from(tags)
      .where(eq(tags.userId, ctx.userId))
      .orderBy(desc(tags.updatedAt), desc(tags.createdAt));

    return { tags: userTags };
  }),

  /**
   * Replace all tags on a bookmarked item.
   * Tag names are normalized (trim + collapse spaces) and deduplicated case-insensitively.
   */
  setTags: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        tags: z.array(z.string().min(1).max(64)).max(20),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const nowMs = Date.now();
      const nowIso = new Date().toISOString();

      const existingItem = await ctx.db
        .select({ id: userItems.id, state: userItems.state })
        .from(userItems)
        .where(and(eq(userItems.id, input.id), eq(userItems.userId, ctx.userId)))
        .limit(1);

      if (existingItem.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Item ${input.id} not found`,
        });
      }

      if (existingItem[0].state !== UserItemState.BOOKMARKED) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only bookmarked items can be tagged',
        });
      }

      const normalizedMap = new Map<string, string>();
      for (const rawTag of input.tags) {
        const normalizedName = normalizeTagName(rawTag);
        const normalizedKey = normalizeTagKey(rawTag);

        if (!normalizedName) {
          continue;
        }
        if (normalizedName.length > 32) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Tag "${normalizedName}" exceeds 32 characters`,
          });
        }

        if (!normalizedMap.has(normalizedKey)) {
          normalizedMap.set(normalizedKey, normalizedName);
        }
      }

      const desiredTags = Array.from(normalizedMap.entries()).map(([normalizedName, name]) => ({
        normalizedName,
        name,
      }));

      const existingTags =
        desiredTags.length > 0
          ? await ctx.db
              .select({
                id: tags.id,
                name: tags.name,
                normalizedName: tags.normalizedName,
              })
              .from(tags)
              .where(
                and(
                  eq(tags.userId, ctx.userId),
                  inArray(
                    tags.normalizedName,
                    desiredTags.map((tag) => tag.normalizedName)
                  )
                )
              )
          : [];

      const existingTagsByNormalized = new Map(
        existingTags.map((tag) => [tag.normalizedName, { id: tag.id, name: tag.name }])
      );

      const finalTags: ItemTag[] = [];

      for (const desiredTag of desiredTags) {
        const existingTag = existingTagsByNormalized.get(desiredTag.normalizedName);

        if (existingTag) {
          await ctx.db
            .update(tags)
            .set({
              name: desiredTag.name,
              updatedAt: nowMs,
            })
            .where(eq(tags.id, existingTag.id));

          finalTags.push({ id: existingTag.id, name: desiredTag.name });
          continue;
        }

        const tagId = ulid();
        await ctx.db.insert(tags).values({
          id: tagId,
          userId: ctx.userId,
          name: desiredTag.name,
          normalizedName: desiredTag.normalizedName,
          createdAt: nowMs,
          updatedAt: nowMs,
        });

        finalTags.push({ id: tagId, name: desiredTag.name });
      }

      await ctx.db.delete(userItemTags).where(eq(userItemTags.userItemId, input.id));

      if (finalTags.length > 0) {
        await ctx.db.insert(userItemTags).values(
          finalTags.map((tag) => ({
            id: ulid(),
            userItemId: input.id,
            tagId: tag.id,
            createdAt: nowMs,
          }))
        );
      }

      await ctx.db
        .update(userItems)
        .set({
          updatedAt: nowIso,
        })
        .where(eq(userItems.id, input.id));

      return {
        success: true as const,
        tags: finalTags,
      };
    }),

  /**
   * Get article content for an item from R2.
   * Returns null if no content is stored.
   */
  getArticleContent: protectedProcedure
    .input(z.object({ itemId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      // Verify user owns this item
      const userItem = await ctx.db.query.userItems.findFirst({
        where: and(eq(userItems.userId, ctx.userId), eq(userItems.itemId, input.itemId)),
      });

      if (!userItem) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Item not found',
        });
      }

      // Fetch from R2
      const content = await getArticleContent(ctx.env.ARTICLE_CONTENT, input.itemId);

      return { content };
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
   * Move an item from BOOKMARKED to ARCHIVED state.
   * Use case: User removes a bookmark and dismisses the item.
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

      // Update to ARCHIVED state
      await ctx.db
        .update(userItems)
        .set({
          state: UserItemState.ARCHIVED,
          bookmarkedAt: null,
          archivedAt: now,
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
   * Record that a bookmarked item was opened via the FAB.
   */
  markOpened: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const now = new Date().toISOString();

      const existing = await ctx.db
        .select({ id: userItems.id, state: userItems.state })
        .from(userItems)
        .where(and(eq(userItems.id, input.id), eq(userItems.userId, ctx.userId)))
        .limit(1);

      if (existing.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Item ${input.id} not found`,
        });
      }

      if (existing[0].state !== UserItemState.BOOKMARKED) {
        return { success: true as const, updated: false };
      }

      await ctx.db
        .update(userItems)
        .set({
          lastOpenedAt: now,
          updatedAt: now,
        })
        .where(eq(userItems.id, input.id));

      return { success: true as const, updated: true, lastOpenedAt: now };
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

// Export helpers for testing and reuse
export { normalizeNullString, toItemView };
