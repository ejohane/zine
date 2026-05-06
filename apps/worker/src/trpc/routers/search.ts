import { and, desc, eq, gt, lt, ne, or, sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import { z } from 'zod';
import type { Provider } from '@zine/shared';
import { UserItemState } from '@zine/shared';

import { router, protectedProcedure } from '../trpc';
import { creators, items, subscriptions, userItems, userPeople } from '../../db/schema';
import { decodeCursor, encodeCursor, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../lib/pagination';
import { toItemViewsWithTags, type ItemView } from './items';

const DEFAULT_CREATORS_LIMIT = 5;

const SearchInputSchema = z.object({
  query: z.string().trim().min(1).max(100),
  scope: z.enum(['library']).default('library'),
  creatorsLimit: z.number().int().min(0).max(10).default(DEFAULT_CREATORS_LIMIT),
  peopleLimit: z.number().int().min(0).max(10).default(DEFAULT_CREATORS_LIMIT),
  itemsLimit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  cursor: z.string().optional(),
});

export type SearchScope = z.infer<typeof SearchInputSchema>['scope'];

export type CreatorSearchRow = {
  id: string;
  name: string;
  normalizedName: string;
  handle: string | null;
  imageUrl: string | null;
  provider: Provider;
  description: string | null;
  externalUrl: string | null;
  isSubscribed: boolean;
  subscriptionId: string | null;
  libraryItemCount: number;
  latestPublishedAt: string | null;
};

export type CreatorSearchResult = {
  type: 'creator';
  id: string;
  creatorId: string;
  name: string;
  handle: string | null;
  imageUrl: string | null;
  provider: Provider;
  description: string | null;
  externalUrl: string | null;
  isSubscribed: boolean;
  subscriptionId: string | null;
  libraryItemCount: number;
  latestPublishedAt: string | null;
  score: number;
};

export type PersonSearchRow = {
  id: string;
  displayName: string;
  profileImageUrl: string | null;
  profileImageSource: string | null;
  xHandle: string | null;
  itemCount: number;
  latestSeenAt: number | null;
  latestItemTitle: string | null;
};

export type PersonSearchResult = {
  type: 'person';
  id: string;
  personId: string;
  displayName: string;
  profileImageUrl: string | null;
  profileImageSource: string | null;
  xHandle: string | null;
  itemCount: number;
  latestSeenAt: number | null;
  latestItemTitle: string | null;
  score: number;
};

export type SearchItemView = ItemView;

export type ItemSearchResult = SearchItemView & {
  type: 'item';
  score: number;
};

export type SearchResult = CreatorSearchResult | PersonSearchResult | ItemSearchResult;

export type SearchResponse = {
  results: SearchResult[];
  sections: {
    creators: CreatorSearchResult[];
    people: PersonSearchResult[];
    items: ItemSearchResult[];
  };
  nextCursor: string | null;
};

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

function buildSearchConditions(search: string, fields: SQLWrapper[]): SQL[] {
  const loweredSearch = search.toLowerCase();
  const compactSearch = toCompactSearchTerm(search);
  const consonantSearch = stripVowels(compactSearch);
  const conditions: SQL[] = [];

  for (const field of fields) {
    conditions.push(sql`lower(coalesce(${field}, '')) LIKE ${`%${loweredSearch}%`}`);
  }

  if (compactSearch.length > 0) {
    for (const field of fields) {
      conditions.push(sql`${toCompactSql(field)} LIKE ${`%${compactSearch}%`}`);
    }
  }

  if (consonantSearch.length >= 3) {
    for (const field of fields) {
      conditions.push(sql`${toConsonantSql(field)} LIKE ${`%${consonantSearch}%`}`);
    }
  }

  return conditions;
}

function normalizeForRanking(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function compactForRanking(value: string | null | undefined): string {
  return toCompactSearchTerm(value ?? '');
}

function scoreTextMatch(query: string, value: string | null | undefined): number {
  const normalizedQuery = normalizeForRanking(query);
  const normalizedValue = normalizeForRanking(value);
  const compactQuery = compactForRanking(query);
  const compactValue = compactForRanking(value);

  if (!normalizedValue || !normalizedQuery) {
    return 0;
  }

  if (normalizedValue === normalizedQuery || compactValue === compactQuery) {
    return 100;
  }

  if (normalizedValue.startsWith(normalizedQuery) || compactValue.startsWith(compactQuery)) {
    return 70;
  }

  if (normalizedValue.includes(normalizedQuery) || compactValue.includes(compactQuery)) {
    return 50;
  }

  const consonantQuery = stripVowels(compactQuery);
  if (consonantQuery.length >= 3 && stripVowels(compactValue).includes(consonantQuery)) {
    return 35;
  }

  return 0;
}

function scoreCreator(query: string, creator: CreatorSearchRow): number {
  const nameScore = scoreTextMatch(query, creator.name);
  const handleScore = scoreTextMatch(query, creator.handle);
  const subscriptionBoost = creator.isSubscribed ? 20 : 0;
  const libraryBoost = creator.libraryItemCount > 0 ? Math.min(10, creator.libraryItemCount) : 0;

  return Math.max(nameScore, handleScore) + subscriptionBoost + libraryBoost;
}

function scoreItem(query: string, item: SearchItemView): number {
  const titleScore = scoreTextMatch(query, item.title);
  const creatorScore = Math.max(0, scoreTextMatch(query, item.creator) - 10);

  return Math.max(titleScore, creatorScore);
}

function scorePerson(query: string, person: PersonSearchRow): number {
  const nameScore = scoreTextMatch(query, person.displayName);
  const libraryBoost = person.itemCount > 0 ? Math.min(10, person.itemCount) : 0;
  return nameScore + libraryBoost;
}

function mergeCreatorRows(query: string, rows: CreatorSearchRow[]): CreatorSearchResult[] {
  const merged = new Map<string, CreatorSearchRow>();

  for (const row of rows) {
    const existing = merged.get(row.id);
    if (!existing) {
      merged.set(row.id, row);
      continue;
    }

    merged.set(row.id, {
      ...existing,
      isSubscribed: existing.isSubscribed || row.isSubscribed,
      subscriptionId: existing.subscriptionId ?? row.subscriptionId,
      libraryItemCount: Math.max(existing.libraryItemCount, row.libraryItemCount),
      latestPublishedAt:
        !existing.latestPublishedAt ||
        (row.latestPublishedAt && row.latestPublishedAt > existing.latestPublishedAt)
          ? row.latestPublishedAt
          : existing.latestPublishedAt,
    });
  }

  return Array.from(merged.values())
    .map((row) => ({
      type: 'creator' as const,
      id: row.id,
      creatorId: row.id,
      name: row.name,
      handle: row.handle,
      imageUrl: row.imageUrl,
      provider: row.provider,
      description: row.description,
      externalUrl: row.externalUrl,
      isSubscribed: row.isSubscribed,
      subscriptionId: row.subscriptionId,
      libraryItemCount: row.libraryItemCount,
      latestPublishedAt: row.latestPublishedAt,
      score: scoreCreator(query, row),
    }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

export function buildSearchResponse(input: {
  query: string;
  creatorRows: CreatorSearchRow[];
  personRows?: PersonSearchRow[];
  items: SearchItemView[];
  nextCursor: string | null;
  creatorsLimit?: number;
  peopleLimit?: number;
}): SearchResponse {
  const creatorsSection = mergeCreatorRows(input.query, input.creatorRows).slice(
    0,
    input.creatorsLimit ?? DEFAULT_CREATORS_LIMIT
  );
  const peopleSection = (input.personRows ?? [])
    .map((row) => ({
      type: 'person' as const,
      id: row.id,
      personId: row.id,
      displayName: row.displayName,
      profileImageUrl: row.profileImageUrl,
      profileImageSource: row.profileImageSource,
      xHandle: row.xHandle,
      itemCount: row.itemCount,
      latestSeenAt: row.latestSeenAt,
      latestItemTitle: row.latestItemTitle,
      score: scorePerson(input.query, row),
    }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName))
    .slice(0, input.peopleLimit ?? DEFAULT_CREATORS_LIMIT);
  const itemsSection = input.items.map((item) => ({
    ...item,
    type: 'item' as const,
    score: scoreItem(input.query, item),
  }));

  return {
    results: [...creatorsSection, ...peopleSection, ...itemsSection],
    sections: {
      creators: creatorsSection,
      people: peopleSection,
      items: itemsSection,
    },
    nextCursor: input.nextCursor,
  };
}

function normalizeCreatorRow(row: {
  id: string;
  name: string;
  normalizedName: string;
  handle: string | null;
  imageUrl: string | null;
  provider: string;
  description: string | null;
  externalUrl: string | null;
  isSubscribed: boolean | number | null;
  subscriptionId: string | null;
  libraryItemCount: number | string | null;
  latestPublishedAt: string | number | null;
}): CreatorSearchRow {
  const latestPublishedAt =
    typeof row.latestPublishedAt === 'number'
      ? new Date(row.latestPublishedAt).toISOString()
      : row.latestPublishedAt;

  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalizedName,
    handle: row.handle,
    imageUrl: row.imageUrl,
    provider: row.provider as Provider,
    description: row.description,
    externalUrl: row.externalUrl,
    isSubscribed: Boolean(row.isSubscribed),
    subscriptionId: row.subscriptionId,
    libraryItemCount: Number(row.libraryItemCount ?? 0),
    latestPublishedAt,
  };
}

export const searchRouter = router({
  query: protectedProcedure.input(SearchInputSchema).query(async ({ ctx, input }) => {
    const search = input.query.trim();
    const itemLimit = input.itemsLimit;
    const cursor = input.cursor ? decodeCursor(input.cursor) : null;
    const searchConditions = buildSearchConditions(search, [items.title, creators.name]);
    const creatorSearchConditions = buildSearchConditions(search, [creators.name, creators.handle]);
    const peopleSearchConditions = buildSearchConditions(search, [
      userPeople.displayName,
      userPeople.normalizedName,
    ]);
    const creatorRows: CreatorSearchRow[] = [];
    const personRows: PersonSearchRow[] = [];

    if (!cursor && input.creatorsLimit > 0) {
      const subscribedCreatorRows = await ctx.db
        .select({
          id: creators.id,
          name: creators.name,
          normalizedName: creators.normalizedName,
          handle: creators.handle,
          imageUrl: creators.imageUrl,
          provider: creators.provider,
          description: creators.description,
          externalUrl: creators.externalUrl,
          isSubscribed: sql<boolean>`${subscriptions.status} = 'ACTIVE'`,
          subscriptionId: subscriptions.id,
          libraryItemCount: sql<number>`0`,
          latestPublishedAt: subscriptions.lastPublishedAt,
        })
        .from(subscriptions)
        .innerJoin(creators, eq(subscriptions.creatorId, creators.id))
        .where(
          and(
            eq(subscriptions.userId, ctx.userId),
            ne(subscriptions.status, 'UNSUBSCRIBED'),
            or(...creatorSearchConditions)!
          )
        )
        .limit(input.creatorsLimit * 3);

      const libraryCreatorRows = await ctx.db
        .select({
          id: creators.id,
          name: creators.name,
          normalizedName: creators.normalizedName,
          handle: creators.handle,
          imageUrl: creators.imageUrl,
          provider: creators.provider,
          description: creators.description,
          externalUrl: creators.externalUrl,
          isSubscribed: sql<boolean>`max(case when ${subscriptions.status} = 'ACTIVE' then 1 else 0 end)`,
          subscriptionId: sql<string | null>`max(${subscriptions.id})`,
          libraryItemCount: sql<number>`count(${userItems.id})`,
          latestPublishedAt: sql<string | null>`max(${items.publishedAt})`,
        })
        .from(userItems)
        .innerJoin(items, eq(userItems.itemId, items.id))
        .innerJoin(creators, eq(items.creatorId, creators.id))
        .leftJoin(
          subscriptions,
          and(
            eq(subscriptions.userId, ctx.userId),
            eq(subscriptions.creatorId, creators.id),
            ne(subscriptions.status, 'UNSUBSCRIBED')
          )
        )
        .where(
          and(
            eq(userItems.userId, ctx.userId),
            eq(userItems.state, UserItemState.BOOKMARKED),
            or(...creatorSearchConditions)!
          )
        )
        .groupBy(
          creators.id,
          creators.name,
          creators.normalizedName,
          creators.handle,
          creators.imageUrl,
          creators.provider,
          creators.description,
          creators.externalUrl
        )
        .limit(input.creatorsLimit * 3);

      creatorRows.push(
        ...subscribedCreatorRows.map(normalizeCreatorRow),
        ...libraryCreatorRows.map(normalizeCreatorRow)
      );
    }

    if (!cursor && input.peopleLimit > 0) {
      const matchedPeopleRows = await ctx.db
        .select({
          id: userPeople.id,
          displayName: userPeople.displayName,
          profileImageUrl: userPeople.profileImageUrl,
          profileImageSource: userPeople.profileImageSource,
          xHandle: userPeople.xHandle,
          itemCount: userPeople.itemCount,
          latestSeenAt: userPeople.latestSeenAt,
          latestItemTitle: sql<string | null>`null`,
        })
        .from(userPeople)
        .where(
          and(
            eq(userPeople.userId, ctx.userId),
            gt(userPeople.itemCount, 0),
            or(...peopleSearchConditions)!
          )
        )
        .orderBy(desc(userPeople.itemCount), desc(userPeople.latestSeenAt), userPeople.displayName)
        .limit(input.peopleLimit * 3);

      personRows.push(
        ...matchedPeopleRows.map((row) => ({
          id: row.id,
          displayName: row.displayName,
          profileImageUrl: row.profileImageUrl,
          profileImageSource: row.profileImageSource,
          xHandle: row.xHandle,
          itemCount: Number(row.itemCount ?? 0),
          latestSeenAt: row.latestSeenAt,
          latestItemTitle: row.latestItemTitle,
        }))
      );
    }

    const itemConditions = [
      eq(userItems.userId, ctx.userId),
      eq(userItems.state, UserItemState.BOOKMARKED),
      eq(userItems.isFinished, false),
      or(...searchConditions)!,
    ];

    const sortField = sql`COALESCE(${userItems.bookmarkedAt}, ${userItems.ingestedAt})`;
    if (cursor) {
      itemConditions.push(
        or(
          sql`${sortField} < ${cursor.sortValue}`,
          and(sql`${sortField} = ${cursor.sortValue}`, lt(userItems.id, cursor.id))
        )!
      );
    }

    const itemRows = await ctx.db
      .select()
      .from(userItems)
      .innerJoin(items, eq(userItems.itemId, items.id))
      .leftJoin(creators, eq(items.creatorId, creators.id))
      .where(and(...itemConditions))
      .orderBy(desc(sql`${sortField}`), desc(userItems.id))
      .limit(itemLimit + 1);

    const hasMore = itemRows.length > itemLimit;
    const pageRows = hasMore ? itemRows.slice(0, itemLimit) : itemRows;
    const itemViews = await toItemViewsWithTags(ctx, pageRows);

    const nextCursor =
      hasMore && pageRows.length > 0
        ? encodeCursor({
            sortValue:
              pageRows[pageRows.length - 1].user_items.bookmarkedAt ??
              pageRows[pageRows.length - 1].user_items.ingestedAt,
            id: pageRows[pageRows.length - 1].user_items.id,
          })
        : null;

    return buildSearchResponse({
      query: search,
      creatorRows,
      personRows,
      items: itemViews,
      nextCursor,
      creatorsLimit: input.creatorsLimit,
      peopleLimit: input.peopleLimit,
    });
  }),
});
