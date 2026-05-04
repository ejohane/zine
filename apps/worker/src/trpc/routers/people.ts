import { and, desc, eq, gt, lt, or, sql, type SQL } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { UserItemState } from '@zine/shared';

import type { Database } from '../../db';
import { creators, items, userItems, userPeople, userPersonMentions } from '../../db/schema';
import { decodeCursor, encodeCursor, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../lib/pagination';
import { router, protectedProcedure } from '../trpc';
import { toItemViewsWithTags } from './items';

const PeopleListInputSchema = z.object({
  query: z.string().trim().max(100).optional(),
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  cursor: z.string().optional(),
  sort: z.enum(['count', 'recent']).default('count'),
});

const PersonIdInputSchema = z.object({
  personId: z.string().min(1),
});

const PersonItemsInputSchema = PersonIdInputSchema.extend({
  limit: z.number().int().min(1).max(50).default(DEFAULT_PAGE_SIZE),
  cursor: z.string().optional(),
});

type PeopleOffsetCursor = {
  offset: number;
};

function encodeOffsetCursor(offset: number): string {
  return btoa(JSON.stringify({ offset }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function decodeOffsetCursor(value: string | undefined): PeopleOffsetCursor | null {
  if (!value) return null;
  try {
    let base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    const parsed = JSON.parse(atob(base64));
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.offset === 'number' &&
      Number.isInteger(parsed.offset) &&
      parsed.offset >= 0
    ) {
      return { offset: parsed.offset };
    }
  } catch {
    return null;
  }
  return null;
}

function buildPeopleSearchConditions(query: string): SQL[] {
  const lowered = query.trim().toLowerCase();
  if (!lowered) return [];
  return [
    sql`lower(${userPeople.displayName}) LIKE ${`%${lowered}%`}`,
    sql`${userPeople.normalizedName} LIKE ${`%${lowered}%`}`,
  ];
}

async function loadLatestItemTitles(
  ctx: { db: Database },
  people: Array<{ id: string }>
): Promise<Map<string, string | null>> {
  const titles = new Map<string, string | null>();

  for (const person of people) {
    const rows = await ctx.db
      .select({ title: items.title })
      .from(userPersonMentions)
      .innerJoin(userItems, eq(userPersonMentions.userItemId, userItems.id))
      .innerJoin(items, eq(userPersonMentions.itemId, items.id))
      .where(
        and(
          eq(userPersonMentions.userPersonId, person.id),
          eq(userPersonMentions.isActive, true),
          eq(userItems.state, UserItemState.BOOKMARKED)
        )
      )
      .orderBy(desc(userPersonMentions.seenAt), desc(userPersonMentions.updatedAt))
      .limit(1);

    titles.set(person.id, rows[0]?.title ?? null);
  }

  return titles;
}

export const peopleRouter = router({
  list: protectedProcedure.input(PeopleListInputSchema).query(async ({ ctx, input }) => {
    const limit = input.limit;
    const cursor = decodeOffsetCursor(input.cursor);
    const offset = cursor?.offset ?? 0;
    const conditions = [eq(userPeople.userId, ctx.userId), gt(userPeople.itemCount, 0)];
    const searchConditions = input.query ? buildPeopleSearchConditions(input.query) : [];
    if (searchConditions.length > 0) {
      conditions.push(or(...searchConditions)!);
    }

    const orderBy =
      input.sort === 'recent'
        ? [desc(userPeople.latestSeenAt), desc(userPeople.itemCount), userPeople.displayName]
        : [desc(userPeople.itemCount), desc(userPeople.latestSeenAt), userPeople.displayName];

    const rows = await ctx.db
      .select({
        id: userPeople.id,
        displayName: userPeople.displayName,
        itemCount: userPeople.itemCount,
        latestSeenAt: userPeople.latestSeenAt,
      })
      .from(userPeople)
      .where(and(...conditions))
      .orderBy(...orderBy)
      .limit(limit + 1)
      .offset(offset);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const latestTitles = await loadLatestItemTitles(ctx, pageRows);

    return {
      people: pageRows.map((row) => ({
        id: row.id,
        displayName: row.displayName,
        itemCount: row.itemCount,
        latestSeenAt: row.latestSeenAt,
        latestItemTitle: latestTitles.get(row.id) ?? null,
      })),
      nextCursor: hasMore ? encodeOffsetCursor(offset + limit) : null,
    };
  }),

  get: protectedProcedure.input(PersonIdInputSchema).query(async ({ ctx, input }) => {
    const rows = await ctx.db
      .select({
        id: userPeople.id,
        displayName: userPeople.displayName,
        itemCount: userPeople.itemCount,
        latestSeenAt: userPeople.latestSeenAt,
        createdAt: userPeople.createdAt,
        updatedAt: userPeople.updatedAt,
      })
      .from(userPeople)
      .where(
        and(
          eq(userPeople.id, input.personId),
          eq(userPeople.userId, ctx.userId),
          gt(userPeople.itemCount, 0)
        )
      )
      .limit(1);

    const person = rows[0];
    if (!person) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Person not found' });
    }

    return person;
  }),

  listItems: protectedProcedure.input(PersonItemsInputSchema).query(async ({ ctx, input }) => {
    const person = await ctx.db
      .select({ id: userPeople.id })
      .from(userPeople)
      .where(
        and(
          eq(userPeople.id, input.personId),
          eq(userPeople.userId, ctx.userId),
          gt(userPeople.itemCount, 0)
        )
      )
      .limit(1);

    if (person.length === 0) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Person not found' });
    }

    const limit = input.limit;
    const cursor = input.cursor ? decodeCursor(input.cursor) : null;
    const sortField = sql`COALESCE(${userItems.bookmarkedAt}, ${userItems.ingestedAt})`;
    const conditions = [
      eq(userPersonMentions.userPersonId, input.personId),
      eq(userPersonMentions.userId, ctx.userId),
      eq(userPersonMentions.isActive, true),
      eq(userItems.userId, ctx.userId),
      eq(userItems.state, UserItemState.BOOKMARKED),
    ];

    if (cursor) {
      conditions.push(
        or(
          sql`${sortField} < ${cursor.sortValue}`,
          and(sql`${sortField} = ${cursor.sortValue}`, lt(userItems.id, cursor.id))
        )!
      );
    }

    const rows = await ctx.db
      .select()
      .from(userPersonMentions)
      .innerJoin(userItems, eq(userPersonMentions.userItemId, userItems.id))
      .innerJoin(items, eq(userItems.itemId, items.id))
      .leftJoin(creators, eq(items.creatorId, creators.id))
      .where(and(...conditions))
      .orderBy(desc(sql`${sortField}`), desc(userItems.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const itemViews = await toItemViewsWithTags(
      ctx,
      pageRows.map((row) => ({
        user_items: row.user_items,
        items: row.items,
        creators: row.creators,
      }))
    );

    const mentionByUserItemId = new Map(
      pageRows.map((row) => [
        row.user_items.id,
        {
          relationship: row.user_person_mentions.relationship,
          confidence: row.user_person_mentions.confidence,
        },
      ])
    );

    const nextCursor =
      hasMore && pageRows.length > 0
        ? encodeCursor({
            sortValue:
              pageRows[pageRows.length - 1].user_items.bookmarkedAt ??
              pageRows[pageRows.length - 1].user_items.ingestedAt,
            id: pageRows[pageRows.length - 1].user_items.id,
          })
        : null;

    return {
      items: itemViews.map((item) => ({
        ...item,
        personMention: mentionByUserItemId.get(item.id) ?? null,
      })),
      nextCursor,
    };
  }),
});

export type PeopleRouter = typeof peopleRouter;
