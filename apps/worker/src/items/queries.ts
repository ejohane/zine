import { ContentTypeSchema, ProviderSchema, UserItemState } from '@zine/shared';
import {
  and,
  desc,
  eq,
  gt,
  isNotNull,
  lt,
  lte,
  or,
  sql,
  type SQL,
  type SQLWrapper,
} from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../db';
import { creators, items, userItems } from '../db/schema';
import { decodeCursor, DEFAULT_PAGE_SIZE, encodeCursor, MAX_PAGE_SIZE } from '../lib/pagination';
import { toItemViewsWithTags } from './views';

type ItemReadContext = { db: Database; userId: string };

const FilterSchema = z
  .object({
    provider: ProviderSchema.nullish(),
    contentType: ContentTypeSchema.nullish(),
    isFinished: z.boolean().nullish(),
  })
  .optional();

export const PaginationSchema = z.object({
  filter: FilterSchema,
  search: z.string().trim().min(1).max(100).optional(),
  cursor: z.string().optional(),
  limit: z.number().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export const ContentTypePaginationSchema = PaginationSchema.pick({
  cursor: true,
  limit: true,
}).extend({
  filter: z
    .object({
      contentType: ContentTypeSchema.nullish(),
    })
    .optional(),
});

function toCompactSearchTerm(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function stripVowels(value: string): string {
  return value.replace(/[aeiou]/g, '');
}

function toCompactSql(value: SQLWrapper): SQL {
  return sql`replace(replace(replace(replace(replace(replace(lower(coalesce(${value}, '')), ' ', ''), '-', ''), '_', ''), '.', ''), '/', ''), '&', '')`;
}

function toConsonantSql(value: SQLWrapper): SQL {
  const compact = toCompactSql(value);
  return sql`replace(replace(replace(replace(replace(${compact}, 'a', ''), 'e', ''), 'i', ''), 'o', ''), 'u', '')`;
}

export async function listInboxItems(
  ctx: ItemReadContext,
  input: z.infer<typeof PaginationSchema> | undefined
) {
  const limit = input?.limit ?? DEFAULT_PAGE_SIZE;
  const cursor = input?.cursor ? decodeCursor(input.cursor) : null;

  // Build WHERE conditions
  const conditions = [
    eq(userItems.userId, ctx.userId),
    eq(userItems.state, UserItemState.INBOX),
    eq(userItems.isFinished, false),
  ];

  // Apply cursor-based pagination (fetch items ingested before cursor)
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

  // Execute query with joins (items + creators)
  const results = await ctx.db
    .select()
    .from(userItems)
    .innerJoin(items, eq(userItems.itemId, items.id))
    .leftJoin(creators, eq(items.creatorId, creators.id))
    .where(and(...conditions))
    .orderBy(desc(userItems.ingestedAt), desc(userItems.id))
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
      sortValue: lastResult.user_items.ingestedAt,
      id: lastResult.user_items.id,
    });
  }

  return {
    items: itemViews,
    nextCursor,
  };
}

export async function listLibraryItems(
  ctx: ItemReadContext,
  input: z.infer<typeof PaginationSchema> | undefined
) {
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
}

export async function listRecentlyOpenedItems(
  ctx: ItemReadContext,
  input: z.infer<typeof ContentTypePaginationSchema> | undefined
) {
  const limit = input?.limit ?? DEFAULT_PAGE_SIZE;
  const cursor = input?.cursor ? decodeCursor(input.cursor) : null;
  const conditions = [
    eq(userItems.userId, ctx.userId),
    eq(userItems.state, UserItemState.BOOKMARKED),
    eq(userItems.isFinished, false),
    isNotNull(userItems.lastOpenedAt),
  ];

  if (input?.filter?.contentType) {
    conditions.push(eq(items.contentType, input.filter.contentType));
  }

  if (cursor) {
    conditions.push(
      or(
        lt(userItems.lastOpenedAt, cursor.sortValue),
        and(eq(userItems.lastOpenedAt, cursor.sortValue), lt(userItems.id, cursor.id))
      )!
    );
  }

  const results = await ctx.db
    .select()
    .from(userItems)
    .innerJoin(items, eq(userItems.itemId, items.id))
    .leftJoin(creators, eq(items.creatorId, creators.id))
    .where(and(...conditions))
    .orderBy(desc(userItems.lastOpenedAt), desc(userItems.id))
    .limit(limit + 1);

  const hasMore = results.length > limit;
  const pageResults = hasMore ? results.slice(0, limit) : results;
  const itemViews = await toItemViewsWithTags(ctx, pageResults);

  let nextCursor: string | null = null;
  if (hasMore && pageResults.length > 0) {
    const lastResult = pageResults[pageResults.length - 1];
    nextCursor = encodeCursor({
      sortValue: lastResult.user_items.lastOpenedAt!,
      id: lastResult.user_items.id,
    });
  }

  return {
    items: itemViews,
    nextCursor,
  };
}

export async function listQuickWinItems(
  ctx: ItemReadContext,
  input: z.infer<typeof ContentTypePaginationSchema> | undefined
) {
  const limit = input?.limit ?? DEFAULT_PAGE_SIZE;
  const cursor = input?.cursor ? decodeCursor(input.cursor) : null;
  const sortField = sql`COALESCE(${userItems.bookmarkedAt}, ${userItems.ingestedAt})`;
  const conditions = [
    eq(userItems.userId, ctx.userId),
    eq(userItems.state, UserItemState.BOOKMARKED),
    eq(userItems.isFinished, false),
    or(
      and(gt(items.readingTimeMinutes, 0), lte(items.readingTimeMinutes, 10)),
      and(gt(items.duration, 0), lte(items.duration, 10 * 60))
    )!,
  ];

  if (input?.filter?.contentType) {
    conditions.push(eq(items.contentType, input.filter.contentType));
  }

  if (cursor) {
    conditions.push(
      or(
        sql`${sortField} < ${cursor.sortValue}`,
        and(sql`${sortField} = ${cursor.sortValue}`, lt(userItems.id, cursor.id))
      )!
    );
  }

  const results = await ctx.db
    .select()
    .from(userItems)
    .innerJoin(items, eq(userItems.itemId, items.id))
    .leftJoin(creators, eq(items.creatorId, creators.id))
    .where(and(...conditions))
    .orderBy(sql`${sortField} DESC`, desc(userItems.id))
    .limit(limit + 1);

  const hasMore = results.length > limit;
  const pageResults = hasMore ? results.slice(0, limit) : results;
  const itemViews = await toItemViewsWithTags(ctx, pageResults);

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
}
