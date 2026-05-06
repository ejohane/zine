import { z } from 'zod';
import { ulid } from 'ulid';
import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq, lt, inArray, ne, or, sql, type SQL } from 'drizzle-orm';
import {
  CollectionOverrideAction,
  CollectionOverrideActionSchema,
  CollectionItemMembership,
  CollectionRulesSchema,
  CollectionSort,
  CollectionSortSchema,
  HomeCollectionLayout,
  HomeCollectionLayoutSchema,
  UserItemState,
  type CollectionRules,
} from '@zine/shared';
import { normalizeTagKey, normalizeTagName } from '@zine/shared/tags';
import { router, protectedProcedure } from '../trpc';
import {
  collectionItemOverrides,
  collections,
  creators,
  homeCollectionSections,
  items,
  tags,
  userItems,
  userItemTags,
} from '../../db/schema';
import { decodeCursor, encodeCursor, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../lib/pagination';
import { toItemViewsWithTags } from './items';
import type { Database } from '../../db';

function parseRules(rulesJson: string): CollectionRules {
  try {
    return CollectionRulesSchema.parse(JSON.parse(rulesJson));
  } catch {
    return {};
  }
}

function normalizeCollectionName(value: string): string {
  return normalizeTagName(value);
}

function normalizeCollectionKey(value: string): string {
  return normalizeTagKey(value);
}

function estimatedLengthSecondsSql(): SQL {
  return sql`COALESCE(${items.duration}, ${items.readingTimeMinutes} * 60, 0)`;
}

function collectionSortSql(sort: z.infer<typeof CollectionSortSchema>): SQL {
  switch (sort) {
    case CollectionSort.OLDEST_SAVED:
    case CollectionSort.NEWEST_SAVED:
      return sql`COALESCE(${userItems.bookmarkedAt}, ${userItems.ingestedAt})`;
    case CollectionSort.SHORTEST:
    case CollectionSort.LONGEST:
      return estimatedLengthSecondsSql();
    case CollectionSort.RECENTLY_OPENED:
      return sql`COALESCE(${userItems.lastOpenedAt}, '')`;
  }
}

function isAscendingSort(sort: z.infer<typeof CollectionSortSchema>): boolean {
  return sort === CollectionSort.OLDEST_SAVED || sort === CollectionSort.SHORTEST;
}

function buildCursorCondition(
  sort: z.infer<typeof CollectionSortSchema>,
  sortField: SQL,
  cursor: ReturnType<typeof decodeCursor> | null
): SQL | undefined {
  if (!cursor) return undefined;
  if (sort !== CollectionSort.NEWEST_SAVED && sort !== CollectionSort.OLDEST_SAVED) {
    return undefined;
  }

  const compare = isAscendingSort(sort)
    ? sql`${sortField} > ${cursor.sortValue}`
    : sql`${sortField} < ${cursor.sortValue}`;

  return or(compare, and(sql`${sortField} = ${cursor.sortValue}`, lt(userItems.id, cursor.id)))!;
}

function buildSearchCondition(search: string): SQL {
  const query = `%${search.trim().toLowerCase()}%`;
  return or(
    sql`lower(${items.title}) LIKE ${query}`,
    sql`lower(coalesce(${creators.name}, '')) LIKE ${query}`,
    sql`lower(coalesce(${items.publisher}, '')) LIKE ${query}`
  )!;
}

function buildRuleConditions(rules: CollectionRules): SQL[] {
  const conditions: SQL[] = [];

  if (rules.contentTypes && rules.contentTypes.length > 0) {
    conditions.push(inArray(items.contentType, rules.contentTypes));
  }

  if (rules.providers && rules.providers.length > 0) {
    conditions.push(inArray(items.provider, rules.providers));
  }

  if (rules.isFinished !== undefined) {
    conditions.push(eq(userItems.isFinished, rules.isFinished));
  }

  if (rules.minLengthMinutes !== undefined) {
    conditions.push(sql`${estimatedLengthSecondsSql()} >= ${rules.minLengthMinutes * 60}`);
  }

  if (rules.maxLengthMinutes !== undefined) {
    conditions.push(sql`${estimatedLengthSecondsSql()} <= ${rules.maxLengthMinutes * 60}`);
  }

  if (rules.search) {
    conditions.push(buildSearchCondition(rules.search));
  }

  if (rules.tagIds && rules.tagIds.length > 0) {
    conditions.push(
      sql`EXISTS (
        SELECT 1
          FROM ${userItemTags}
          INNER JOIN ${tags} ON ${userItemTags.tagId} = ${tags.id}
        WHERE ${userItemTags.userItemId} = ${userItems.id}
          AND ${tags.userId} = ${userItems.userId}
          AND ${inArray(tags.id, rules.tagIds)}
      )`
    );
  }

  return conditions;
}

function hasAutomaticRules(rules: CollectionRules): boolean {
  return (
    Boolean(rules.contentTypes?.length) ||
    Boolean(rules.providers?.length) ||
    Boolean(rules.tagIds?.length) ||
    rules.isFinished !== undefined ||
    rules.minLengthMinutes !== undefined ||
    rules.maxLengthMinutes !== undefined ||
    Boolean(rules.search)
  );
}

function itemMatchesRules(
  item: {
    contentType: string;
    provider: string;
    duration: number | null;
    readingTimeMinutes: number | null;
    title: string;
    creator: string | null;
    publisher: string | null;
    isFinished: boolean;
    tagIds: string[];
  },
  rules: CollectionRules
): boolean {
  if (!hasAutomaticRules(rules)) {
    return false;
  }

  if (rules.contentTypes?.length && !rules.contentTypes.includes(item.contentType as never)) {
    return false;
  }

  if (rules.providers?.length && !rules.providers.includes(item.provider as never)) {
    return false;
  }

  if (rules.isFinished !== undefined && item.isFinished !== rules.isFinished) {
    return false;
  }

  const estimatedLengthSeconds = item.duration ?? (item.readingTimeMinutes ?? 0) * 60;
  if (
    rules.minLengthMinutes !== undefined &&
    estimatedLengthSeconds < rules.minLengthMinutes * 60
  ) {
    return false;
  }

  if (
    rules.maxLengthMinutes !== undefined &&
    estimatedLengthSeconds > rules.maxLengthMinutes * 60
  ) {
    return false;
  }

  if (rules.search) {
    const query = rules.search.toLowerCase();
    const searchable = [item.title, item.creator, item.publisher].filter(Boolean).join(' ');
    if (!searchable.toLowerCase().includes(query)) {
      return false;
    }
  }

  if (rules.tagIds?.length && !rules.tagIds.some((tagId) => item.tagIds.includes(tagId))) {
    return false;
  }

  return true;
}

async function requireCollection(ctx: { db: Database; userId: string }, id: string) {
  const rows = await ctx.db
    .select()
    .from(collections)
    .where(and(eq(collections.id, id), eq(collections.userId, ctx.userId)))
    .limit(1);

  const collection = rows[0];
  if (!collection) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `Collection ${id} not found`,
    });
  }

  return collection;
}

const CollectionMutationInput = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(240).optional().nullable(),
  rules: CollectionRulesSchema,
  sort: CollectionSortSchema.default(CollectionSort.NEWEST_SAVED),
});

export const collectionsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: collections.id,
        name: collections.name,
        description: collections.description,
        rulesJson: collections.rulesJson,
        sort: collections.sort,
        createdAt: collections.createdAt,
        updatedAt: collections.updatedAt,
        homeLayout: homeCollectionSections.layout,
        homePosition: homeCollectionSections.position,
      })
      .from(collections)
      .leftJoin(homeCollectionSections, eq(homeCollectionSections.collectionId, collections.id))
      .where(eq(collections.userId, ctx.userId))
      .orderBy(desc(collections.updatedAt), desc(collections.createdAt));

    return {
      collections: rows.map((collection) => ({
        id: collection.id,
        name: collection.name,
        description: collection.description,
        rules: parseRules(collection.rulesJson),
        sort: collection.sort,
        homeSection:
          collection.homeLayout === null || collection.homePosition === null
            ? null
            : {
                layout: HomeCollectionLayoutSchema.parse(collection.homeLayout),
                position: collection.homePosition,
              },
        createdAt: collection.createdAt,
        updatedAt: collection.updatedAt,
      })),
    };
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const collection = await requireCollection(ctx, input.id);

      return {
        id: collection.id,
        name: collection.name,
        description: collection.description,
        rules: parseRules(collection.rulesJson),
        sort: collection.sort,
        homeSection: null,
        createdAt: collection.createdAt,
        updatedAt: collection.updatedAt,
      };
    }),

  create: protectedProcedure.input(CollectionMutationInput).mutation(async ({ input, ctx }) => {
    const now = Date.now();
    const name = normalizeCollectionName(input.name);
    const normalizedName = normalizeCollectionKey(name);

    const id = ulid();
    try {
      await ctx.db.insert(collections).values({
        id,
        userId: ctx.userId,
        name,
        normalizedName,
        description: input.description?.trim() || null,
        rulesJson: JSON.stringify(input.rules),
        sort: input.sort,
        createdAt: now,
        updatedAt: now,
      });
    } catch (error) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: `A collection named "${name}" already exists`,
        cause: error,
      });
    }

    return {
      id,
      name,
      description: input.description?.trim() || null,
      rules: input.rules,
      sort: input.sort,
    };
  }),

  update: protectedProcedure
    .input(CollectionMutationInput.extend({ id: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      await requireCollection(ctx, input.id);

      const name = normalizeCollectionName(input.name);
      const normalizedName = normalizeCollectionKey(name);

      try {
        await ctx.db
          .update(collections)
          .set({
            name,
            normalizedName,
            description: input.description?.trim() || null,
            rulesJson: JSON.stringify(input.rules),
            sort: input.sort,
            updatedAt: Date.now(),
          })
          .where(and(eq(collections.id, input.id), eq(collections.userId, ctx.userId)));
      } catch (error) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `A collection named "${name}" already exists`,
          cause: error,
        });
      }

      return { success: true as const };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      await requireCollection(ctx, input.id);
      await ctx.db
        .delete(collectionItemOverrides)
        .where(eq(collectionItemOverrides.collectionId, input.id));
      await ctx.db
        .delete(homeCollectionSections)
        .where(eq(homeCollectionSections.collectionId, input.id));
      await ctx.db
        .delete(collections)
        .where(and(eq(collections.id, input.id), eq(collections.userId, ctx.userId)));

      return { success: true as const };
    }),

  setHomeSection: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        enabled: z.boolean(),
        layout: HomeCollectionLayoutSchema.default(HomeCollectionLayout.STACK_RAIL),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireCollection(ctx, input.id);

      if (!input.enabled) {
        await ctx.db
          .delete(homeCollectionSections)
          .where(eq(homeCollectionSections.collectionId, input.id));
        return { success: true as const };
      }

      const now = Date.now();
      const existingRows = await ctx.db
        .select({ id: homeCollectionSections.id })
        .from(homeCollectionSections)
        .where(eq(homeCollectionSections.collectionId, input.id))
        .limit(1);

      if (existingRows[0]) {
        await ctx.db
          .update(homeCollectionSections)
          .set({ layout: input.layout, updatedAt: now })
          .where(eq(homeCollectionSections.id, existingRows[0].id));
        return { success: true as const };
      }

      const nextPositionRows = await ctx.db
        .select({
          nextPosition: sql<number>`COALESCE(MAX(${homeCollectionSections.position}), 0) + 1`,
        })
        .from(homeCollectionSections)
        .where(eq(homeCollectionSections.userId, ctx.userId));
      const position = nextPositionRows[0]?.nextPosition ?? 1;

      await ctx.db.insert(homeCollectionSections).values({
        id: ulid(),
        userId: ctx.userId,
        collectionId: input.id,
        position,
        layout: input.layout,
        createdAt: now,
        updatedAt: now,
      });

      return { success: true as const };
    }),

  items: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
      })
    )
    .query(async ({ input, ctx }) => {
      const collection = await requireCollection(ctx, input.id);
      const rules = parseRules(collection.rulesJson);
      const sort = CollectionSortSchema.parse(collection.sort);
      const sortField = collectionSortSql(sort);
      const cursor = input.cursor ? decodeCursor(input.cursor) : null;

      const ruleConditions = buildRuleConditions(rules);
      const matchesRules = ruleConditions.length > 0 ? and(...ruleConditions)! : sql`0 = 1`;
      const cursorCondition = buildCursorCondition(sort, sortField, cursor);

      const membershipCondition = or(
        and(
          matchesRules,
          or(
            sql`${collectionItemOverrides.action} IS NULL`,
            ne(collectionItemOverrides.action, CollectionOverrideAction.HIDE)
          )!
        ),
        eq(collectionItemOverrides.action, CollectionOverrideAction.PIN)
      )!;

      const conditions = [
        eq(userItems.userId, ctx.userId),
        eq(userItems.state, UserItemState.BOOKMARKED),
        membershipCondition,
      ];
      if (cursorCondition) {
        conditions.push(cursorCondition);
      }

      const orderDirection = isAscendingSort(sort) ? asc(sortField) : desc(sortField);
      const results = await ctx.db
        .select()
        .from(userItems)
        .innerJoin(items, eq(userItems.itemId, items.id))
        .leftJoin(creators, eq(items.creatorId, creators.id))
        .leftJoin(
          collectionItemOverrides,
          and(
            eq(collectionItemOverrides.userItemId, userItems.id),
            eq(collectionItemOverrides.collectionId, collection.id)
          )
        )
        .where(and(...conditions))
        .orderBy(
          desc(
            sql`CASE WHEN ${collectionItemOverrides.action} = ${CollectionOverrideAction.PIN} THEN 1 ELSE 0 END`
          ),
          orderDirection,
          desc(userItems.id)
        )
        .limit(input.limit + 1);

      const hasMore = results.length > input.limit;
      const pageResults = hasMore ? results.slice(0, input.limit) : results;
      const itemViews = await toItemViewsWithTags(ctx, pageResults);

      const lastResult = pageResults[pageResults.length - 1];
      const canCursor =
        sort === CollectionSort.NEWEST_SAVED || sort === CollectionSort.OLDEST_SAVED;
      const nextCursor =
        canCursor && hasMore && lastResult
          ? encodeCursor({
              sortValue: lastResult.user_items.bookmarkedAt ?? lastResult.user_items.ingestedAt,
              id: lastResult.user_items.id,
            })
          : null;

      return { items: itemViews, nextCursor };
    }),

  forItem: protectedProcedure
    .input(z.object({ userItemId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const itemRows = await ctx.db
        .select({
          userItemId: userItems.id,
          contentType: items.contentType,
          provider: items.provider,
          duration: items.duration,
          readingTimeMinutes: items.readingTimeMinutes,
          title: items.title,
          creator: creators.name,
          publisher: items.publisher,
          isFinished: userItems.isFinished,
        })
        .from(userItems)
        .innerJoin(items, eq(userItems.itemId, items.id))
        .leftJoin(creators, eq(items.creatorId, creators.id))
        .where(
          and(
            eq(userItems.id, input.userItemId),
            eq(userItems.userId, ctx.userId),
            eq(userItems.state, UserItemState.BOOKMARKED)
          )
        )
        .limit(1);

      const item = itemRows[0];
      if (!item) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Item ${input.userItemId} not found`,
        });
      }

      const [collectionRows, overrideRows, tagRows] = await Promise.all([
        ctx.db
          .select()
          .from(collections)
          .where(eq(collections.userId, ctx.userId))
          .orderBy(desc(collections.updatedAt), desc(collections.createdAt)),
        ctx.db
          .select({
            collectionId: collectionItemOverrides.collectionId,
            action: collectionItemOverrides.action,
          })
          .from(collectionItemOverrides)
          .innerJoin(collections, eq(collectionItemOverrides.collectionId, collections.id))
          .where(
            and(
              eq(collectionItemOverrides.userItemId, input.userItemId),
              eq(collections.userId, ctx.userId)
            )
          ),
        ctx.db
          .select({ tagId: tags.id })
          .from(userItemTags)
          .innerJoin(tags, eq(userItemTags.tagId, tags.id))
          .where(and(eq(userItemTags.userItemId, input.userItemId), eq(tags.userId, ctx.userId))),
      ]);

      const overrideByCollectionId = new Map(
        overrideRows.map((override) => [override.collectionId, override.action])
      );
      const tagIds = tagRows.map((tag) => tag.tagId);

      return {
        collections: collectionRows.map((collection) => {
          const rules = parseRules(collection.rulesJson);
          const override = overrideByCollectionId.get(collection.id);
          const matches = itemMatchesRules({ ...item, tagIds }, rules);
          const membership =
            override === CollectionOverrideAction.PIN
              ? CollectionItemMembership.PINNED
              : override === CollectionOverrideAction.HIDE
                ? CollectionItemMembership.HIDDEN
                : matches
                  ? CollectionItemMembership.INCLUDED_BY_RULES
                  : CollectionItemMembership.NONE;

          return {
            id: collection.id,
            name: collection.name,
            description: collection.description,
            rules,
            sort: collection.sort,
            membership,
            createdAt: collection.createdAt,
            updatedAt: collection.updatedAt,
          };
        }),
      };
    }),

  setItemOverride: protectedProcedure
    .input(
      z.object({
        collectionId: z.string().min(1),
        userItemId: z.string().min(1),
        action: CollectionOverrideActionSchema.nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireCollection(ctx, input.collectionId);

      const ownedItem = await ctx.db
        .select({ id: userItems.id })
        .from(userItems)
        .where(
          and(
            eq(userItems.id, input.userItemId),
            eq(userItems.userId, ctx.userId),
            eq(userItems.state, UserItemState.BOOKMARKED)
          )
        )
        .limit(1);

      if (ownedItem.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Item ${input.userItemId} not found`,
        });
      }

      await ctx.db
        .delete(collectionItemOverrides)
        .where(
          and(
            eq(collectionItemOverrides.collectionId, input.collectionId),
            eq(collectionItemOverrides.userItemId, input.userItemId)
          )
        );

      if (input.action) {
        const now = Date.now();
        await ctx.db.insert(collectionItemOverrides).values({
          id: ulid(),
          collectionId: input.collectionId,
          userItemId: input.userItemId,
          action: input.action,
          position: input.action === CollectionOverrideAction.PIN ? now : null,
          createdAt: now,
          updatedAt: now,
        });
      }

      await ctx.db
        .update(collections)
        .set({ updatedAt: Date.now() })
        .where(eq(collections.id, input.collectionId));

      return { success: true as const };
    }),
});

export type CollectionsRouter = typeof collectionsRouter;
