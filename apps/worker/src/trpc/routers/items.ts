// apps/worker/src/trpc/routers/items.ts
import { TRPCError } from '@trpc/server';
import {
  CollectionOverrideAction,
  type CollectionRules,
  CollectionRulesSchema,
  CollectionSort,
  CollectionSortSchema,
  ContentType,
  ContentTypeSchema,
  HomeCollectionLayoutSchema,
  HomeScreenSectionKind,
  isJsonObject,
  type JsonObject,
  Provider,
  UserItemState,
} from '@zine/shared';
import { and, asc, desc, eq, inArray, isNotNull, lte, ne, or, sql, type SQL } from 'drizzle-orm';
import { ulid } from 'ulid';
import { z } from 'zod';
import type { Database } from '../../db';
import {
  collectionItemOverrides,
  collections,
  creators,
  homeCollectionSections,
  itemEnrichments,
  items,
  newsletterFeedMessages,
  newsletterFeeds,
  rssFeedItems,
  rssFeeds,
  subscriptionItems,
  subscriptions,
  tags,
  userItemConsumptionEvents,
  userItemEnrichments,
  userItems,
  userItemTags,
  userPeople,
  userPersonMentions,
} from '../../db/schema';
import { ENRICHMENT_SCHEMA_VERSION, type SuggestedTag } from '../../enrichment/types';
import { getHomeScreenLayoutSections } from '../../home-screen/layout';
import { changeItemFinishedState } from '../../items/finished-state';
import {
  archiveItem,
  bookmarkItem,
  ItemStateError,
  unbookmarkItem,
} from '../../items/library-state';
import {
  ContentTypePaginationSchema,
  listInboxItems,
  listLibraryItems,
  listQuickWinItems,
  listRecentlyOpenedItems,
  PaginationSchema,
} from '../../items/queries';
import { toHomeItemViews, toItemViewsWithTags } from '../../items/views';
import { getArticleContent } from '../../lib/article-storage';
import { normalizePersonDisplayName, normalizePersonName } from '../../people/service';
import { replaceTagsForUserItem } from '../tagging';
import { protectedProcedure, router } from '../trpc';

export { normalizeNullString, toItemView, toItemViewsWithTags } from '../../items/views';
export type { ItemTag, ItemView } from '../../items/views';

export type ItemSubscriptionSettings = {
  sourceId: string;
  provider: Provider;
  autoBookmark: boolean;
};

function parseJsonArray<T>(value: string | null): T[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function parseJsonObjectValue(value: string | null): JsonObject | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);
    return isJsonObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function getItemSubscriptionSettings(
  ctx: { db: Database; userId: string },
  userItemId: string
): Promise<ItemSubscriptionSettings | null> {
  const ownedItems = await ctx.db
    .select({ itemId: userItems.itemId, provider: items.provider })
    .from(userItems)
    .innerJoin(items, eq(userItems.itemId, items.id))
    .where(and(eq(userItems.id, userItemId), eq(userItems.userId, ctx.userId)))
    .limit(1);

  if (ownedItems.length === 0) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `Item ${userItemId} not found` });
  }

  const ownedItem = ownedItems[0];

  if (ownedItem.provider === Provider.YOUTUBE || ownedItem.provider === Provider.SPOTIFY) {
    const rows = await ctx.db
      .select({
        sourceId: subscriptions.id,
        provider: subscriptions.provider,
        autoBookmark: subscriptions.autoBookmark,
      })
      .from(subscriptionItems)
      .innerJoin(subscriptions, eq(subscriptionItems.subscriptionId, subscriptions.id))
      .where(
        and(eq(subscriptionItems.itemId, ownedItem.itemId), eq(subscriptions.userId, ctx.userId))
      )
      .limit(1);

    const row = rows[0];
    return row
      ? {
          sourceId: row.sourceId,
          provider: row.provider as Provider,
          autoBookmark: row.autoBookmark,
        }
      : null;
  }

  if (ownedItem.provider === Provider.GMAIL) {
    const rows = await ctx.db
      .select({
        sourceId: newsletterFeeds.id,
        autoBookmark: newsletterFeeds.autoBookmark,
      })
      .from(newsletterFeedMessages)
      .innerJoin(newsletterFeeds, eq(newsletterFeedMessages.newsletterFeedId, newsletterFeeds.id))
      .where(
        and(
          eq(newsletterFeedMessages.itemId, ownedItem.itemId),
          eq(newsletterFeedMessages.userId, ctx.userId),
          eq(newsletterFeeds.userId, ctx.userId)
        )
      )
      .limit(1);

    const row = rows[0];
    return row
      ? {
          sourceId: row.sourceId,
          provider: Provider.GMAIL,
          autoBookmark: row.autoBookmark,
        }
      : null;
  }

  if (ownedItem.provider === Provider.RSS) {
    const rows = await ctx.db
      .select({
        sourceId: rssFeeds.id,
        autoBookmark: rssFeeds.autoBookmark,
      })
      .from(rssFeedItems)
      .innerJoin(rssFeeds, eq(rssFeedItems.rssFeedId, rssFeeds.id))
      .where(and(eq(rssFeedItems.itemId, ownedItem.itemId), eq(rssFeeds.userId, ctx.userId)))
      .limit(1);

    const row = rows[0];
    return row
      ? {
          sourceId: row.sourceId,
          provider: Provider.RSS,
          autoBookmark: row.autoBookmark,
        }
      : null;
  }

  return null;
}

function parseCollectionRules(rulesJson: string): CollectionRules {
  try {
    return CollectionRulesSchema.parse(JSON.parse(rulesJson));
  } catch {
    return {};
  }
}

function estimatedCollectionLengthSecondsSql(): SQL {
  return sql`COALESCE(${items.duration}, ${items.readingTimeMinutes} * 60, 0)`;
}

function collectionSortSql(sort: z.infer<typeof CollectionSortSchema>): SQL {
  switch (sort) {
    case CollectionSort.OLDEST_SAVED:
    case CollectionSort.NEWEST_SAVED:
      return sql`COALESCE(${userItems.bookmarkedAt}, ${userItems.ingestedAt})`;
    case CollectionSort.SHORTEST:
    case CollectionSort.LONGEST:
      return estimatedCollectionLengthSecondsSql();
    case CollectionSort.RECENTLY_OPENED:
      return sql`COALESCE(${userItems.lastOpenedAt}, '')`;
  }
}

function isAscendingCollectionSort(sort: z.infer<typeof CollectionSortSchema>): boolean {
  return sort === CollectionSort.OLDEST_SAVED || sort === CollectionSort.SHORTEST;
}

function buildCollectionSearchCondition(search: string): SQL {
  const query = `%${search.trim().toLowerCase()}%`;
  return or(
    sql`lower(${items.title}) LIKE ${query}`,
    sql`lower(coalesce(${creators.name}, '')) LIKE ${query}`,
    sql`lower(coalesce(${items.publisher}, '')) LIKE ${query}`
  )!;
}

function buildCollectionRuleConditions(rules: CollectionRules): SQL[] {
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
    conditions.push(
      sql`${estimatedCollectionLengthSecondsSql()} >= ${rules.minLengthMinutes * 60}`
    );
  }

  if (rules.maxLengthMinutes !== undefined) {
    conditions.push(
      sql`${estimatedCollectionLengthSecondsSql()} <= ${rules.maxLengthMinutes * 60}`
    );
  }

  if (rules.search) {
    conditions.push(buildCollectionSearchCondition(rules.search));
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

type ConsumptionEventType = 'OPENED' | 'FINISHED' | 'UNFINISHED' | 'PROGRESS_DELTA';
type ConsumptionEventSource = 'ITEM_DETAIL_OPEN' | 'MANUAL_FINISH_TOGGLE' | 'PLAYER' | 'READER';

async function insertConsumptionEvent(
  ctx: { db: Database; userId: string },
  event: {
    userItemId: string;
    itemId: string;
    eventType: ConsumptionEventType;
    occurredAt: number;
    positionSeconds?: number | null;
    durationSeconds?: number | null;
    deltaSeconds?: number | null;
    source: ConsumptionEventSource;
    metadata?: JsonObject | null;
  }
) {
  await ctx.db.insert(userItemConsumptionEvents).values({
    id: ulid(),
    userId: ctx.userId,
    userItemId: event.userItemId,
    itemId: event.itemId,
    eventType: event.eventType,
    occurredAt: event.occurredAt,
    positionSeconds: event.positionSeconds ?? null,
    durationSeconds: event.durationSeconds ?? null,
    deltaSeconds: event.deltaSeconds ?? null,
    source: event.source,
    metadata: event.metadata ? JSON.stringify(event.metadata) : null,
  });
}

// Zod Schemas

const HomeInputSchema = z
  .object({
    filter: z
      .object({
        contentType: ContentTypeSchema.nullish(),
      })
      .optional(),
  })
  .optional();

// Router

export const itemsRouter = router({
  /**
   * Get items in the triage queue (INBOX state).
   * Supports filtering by provider and content type.
   * Uses cursor-based pagination sorted by ingestedAt DESC (most recently added first).
   */
  inbox: protectedProcedure
    .input(PaginationSchema.optional())
    .query(async ({ input, ctx }) => listInboxItems(ctx, input)),

  /**
   * Get bookmarked items (BOOKMARKED state).
   * Supports filtering by provider/content type and search by title/creator.
   * Uses cursor-based pagination sorted by bookmarkedAt DESC.
   */
  library: protectedProcedure
    .input(PaginationSchema.optional())
    .query(async ({ input, ctx }) => listLibraryItems(ctx, input)),

  /**
   * Get unfinished bookmarks that the user has opened, newest open first.
   * Uses cursor-based pagination sorted by lastOpenedAt DESC.
   */
  recentlyOpened: protectedProcedure
    .input(ContentTypePaginationSchema.optional())
    .query(async ({ input, ctx }) => listRecentlyOpenedItems(ctx, input)),

  /**
   * Get unfinished bookmarks that take ten minutes or less, newest save first.
   */
  quickWins: protectedProcedure
    .input(ContentTypePaginationSchema.optional())
    .query(async ({ input, ctx }) => listQuickWinItems(ctx, input)),

  /**
   * Get curated home sections.
   * Returns recent bookmarks, recently opened bookmarks ("Jump Back In"), and items by content type.
   */
  home: protectedProcedure.input(HomeInputSchema).query(async ({ input, ctx }) => {
    const SECTION_LIMIT = 20;
    const RECENTLY_OPENED_LIMIT = 20;
    const contentTypeFilter = input?.filter?.contentType;

    // Base query for bookmarked items
    const baseConditions = [
      eq(userItems.userId, ctx.userId),
      eq(userItems.state, UserItemState.BOOKMARKED),
      eq(userItems.isFinished, false),
    ];
    const filteredConditions = contentTypeFilter
      ? [...baseConditions, eq(items.contentType, contentTypeFilter)]
      : baseConditions;

    // Fetch recent bookmarks
    const recentBookmarksQuery = ctx.db
      .select()
      .from(userItems)
      .innerJoin(items, eq(userItems.itemId, items.id))
      .leftJoin(creators, eq(items.creatorId, creators.id))
      .where(and(...filteredConditions))
      .orderBy(desc(userItems.bookmarkedAt))
      .limit(SECTION_LIMIT);

    // Fetch recently opened bookmarks ("Jump Back In")
    const jumpBackInQuery = ctx.db
      .select()
      .from(userItems)
      .innerJoin(items, eq(userItems.itemId, items.id))
      .leftJoin(creators, eq(items.creatorId, creators.id))
      .where(and(...filteredConditions, isNotNull(userItems.lastOpenedAt)))
      .orderBy(desc(userItems.lastOpenedAt))
      .limit(RECENTLY_OPENED_LIMIT);

    // Fetch videos
    const videosQuery = ctx.db
      .select()
      .from(userItems)
      .innerJoin(items, eq(userItems.itemId, items.id))
      .leftJoin(creators, eq(items.creatorId, creators.id))
      .where(and(...filteredConditions, eq(items.contentType, ContentType.VIDEO)))
      .orderBy(desc(userItems.bookmarkedAt))
      .limit(SECTION_LIMIT);

    // Fetch podcasts
    const podcastsQuery = ctx.db
      .select()
      .from(userItems)
      .innerJoin(items, eq(userItems.itemId, items.id))
      .leftJoin(creators, eq(items.creatorId, creators.id))
      .where(and(...filteredConditions, eq(items.contentType, ContentType.PODCAST)))
      .orderBy(desc(userItems.bookmarkedAt))
      .limit(SECTION_LIMIT);

    // Fetch articles
    const articlesQuery = ctx.db
      .select()
      .from(userItems)
      .innerJoin(items, eq(userItems.itemId, items.id))
      .leftJoin(creators, eq(items.creatorId, creators.id))
      .where(and(...filteredConditions, eq(items.contentType, ContentType.ARTICLE)))
      .orderBy(desc(userItems.bookmarkedAt))
      .limit(SECTION_LIMIT);

    const homeSectionsQuery = ctx.db
      .select({
        collectionId: collections.id,
        title: collections.name,
        rulesJson: collections.rulesJson,
        sort: collections.sort,
        layout: homeCollectionSections.layout,
        position: homeCollectionSections.position,
      })
      .from(homeCollectionSections)
      .innerJoin(collections, eq(homeCollectionSections.collectionId, collections.id))
      .where(and(eq(homeCollectionSections.userId, ctx.userId), eq(collections.userId, ctx.userId)))
      .orderBy(asc(homeCollectionSections.position), asc(homeCollectionSections.createdAt));
    const homeLayoutSectionsQuery = getHomeScreenLayoutSections(ctx.db, ctx.userId);

    // Execute all queries in parallel
    const [recentBookmarks, jumpBackIn, videos, podcasts, articles, homeSections, sectionOrder] =
      await Promise.all([
        recentBookmarksQuery,
        jumpBackInQuery,
        videosQuery,
        podcastsQuery,
        articlesQuery,
        homeSectionsQuery,
        homeLayoutSectionsQuery,
      ]);

    const customCollections = await Promise.all(
      homeSections.map(async (section) => {
        const rules = parseCollectionRules(section.rulesJson);
        const sort = CollectionSortSchema.parse(section.sort);
        const sortField = collectionSortSql(sort);
        const orderDirection = isAscendingCollectionSort(sort) ? asc(sortField) : desc(sortField);
        const ruleConditions = buildCollectionRuleConditions(rules);
        const matchesRules = ruleConditions.length > 0 ? and(...ruleConditions)! : sql`0 = 1`;
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
        const collectionConditions = [
          eq(userItems.userId, ctx.userId),
          eq(userItems.state, UserItemState.BOOKMARKED),
          membershipCondition,
        ];
        if (contentTypeFilter) {
          collectionConditions.push(eq(items.contentType, contentTypeFilter));
        }

        const sectionItems = await ctx.db
          .select()
          .from(userItems)
          .innerJoin(items, eq(userItems.itemId, items.id))
          .leftJoin(creators, eq(items.creatorId, creators.id))
          .leftJoin(
            collectionItemOverrides,
            and(
              eq(collectionItemOverrides.userItemId, userItems.id),
              eq(collectionItemOverrides.collectionId, section.collectionId)
            )
          )
          .where(and(...collectionConditions))
          .orderBy(
            desc(
              sql`CASE WHEN ${collectionItemOverrides.action} = ${CollectionOverrideAction.PIN} THEN 1 ELSE 0 END`
            ),
            orderDirection,
            desc(userItems.id)
          )
          .limit(SECTION_LIMIT);

        return {
          collectionId: section.collectionId,
          title: section.title,
          layout: HomeCollectionLayoutSchema.parse(section.layout),
          position: section.position,
          count: sectionItems.length,
          items: toHomeItemViews(sectionItems),
        };
      })
    );

    const recentBookmarksViews = toHomeItemViews(recentBookmarks);
    const jumpBackInViews = toHomeItemViews(jumpBackIn);
    const videosViews = toHomeItemViews(videos);
    const podcastsViews = toHomeItemViews(podcasts);
    const articlesViews = toHomeItemViews(articles);

    return {
      recentBookmarks: recentBookmarksViews,
      jumpBackIn: jumpBackInViews,
      byContentType: {
        videos: videosViews,
        podcasts: podcastsViews,
        articles: articlesViews,
      },
      customCollections,
      sectionOrder: sectionOrder.filter(
        (section) =>
          section.kind === HomeScreenSectionKind.BUILT_IN ||
          customCollections.some(
            (collection) =>
              section.kind === HomeScreenSectionKind.COLLECTION &&
              collection.collectionId === section.collectionId
          )
      ),
    };
  }),

  /**
   * Get other unfinished bookmarked items from the same creator as a detail item.
   */
  otherUnfinishedBookmarksByCreator: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        limit: z.number().min(1).max(10).default(5),
      })
    )
    .query(async ({ input, ctx }) => {
      const current = await ctx.db
        .select({
          creatorId: items.creatorId,
        })
        .from(userItems)
        .innerJoin(items, eq(userItems.itemId, items.id))
        .where(and(eq(userItems.id, input.id), eq(userItems.userId, ctx.userId)))
        .limit(1);

      if (current.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Item ${input.id} not found`,
        });
      }

      const creatorId = current[0].creatorId;
      if (!creatorId) {
        return { items: [] };
      }

      const results = await ctx.db
        .select()
        .from(userItems)
        .innerJoin(items, eq(userItems.itemId, items.id))
        .leftJoin(creators, eq(items.creatorId, creators.id))
        .where(
          and(
            eq(userItems.userId, ctx.userId),
            eq(userItems.state, UserItemState.BOOKMARKED),
            eq(userItems.isFinished, false),
            eq(items.creatorId, creatorId),
            ne(userItems.id, input.id)
          )
        )
        .orderBy(desc(userItems.bookmarkedAt), desc(userItems.ingestedAt), desc(userItems.id))
        .limit(input.limit);

      const itemViews = await toItemViewsWithTags(ctx, results);

      return { items: itemViews };
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
   * Resolve the subscription or feed that produced a user item, when one exists.
   */
  subscriptionSettings: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input, ctx }) => ({
      subscription: await getItemSubscriptionSettings(ctx, input.id),
    })),

  /**
   * Get AI enrichment and advisory tag suggestions for a user item.
   */
  getEnrichment: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const owned = await ctx.db
        .select({ userItemId: userItems.id, itemId: userItems.itemId })
        .from(userItems)
        .where(and(eq(userItems.id, input.id), eq(userItems.userId, ctx.userId)))
        .limit(1);

      if (owned.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Item ${input.id} not found`,
        });
      }

      const [canonicalRows, userRows] = await Promise.all([
        ctx.db
          .select()
          .from(itemEnrichments)
          .where(
            and(
              eq(itemEnrichments.itemId, owned[0].itemId),
              lte(itemEnrichments.schemaVersion, ENRICHMENT_SCHEMA_VERSION)
            )
          )
          .orderBy(desc(itemEnrichments.schemaVersion), desc(itemEnrichments.updatedAt))
          .limit(1),
        ctx.db
          .select()
          .from(userItemEnrichments)
          .where(
            and(
              eq(userItemEnrichments.userItemId, input.id),
              eq(userItemEnrichments.userId, ctx.userId),
              lte(userItemEnrichments.schemaVersion, ENRICHMENT_SCHEMA_VERSION)
            )
          )
          .orderBy(desc(userItemEnrichments.schemaVersion), desc(userItemEnrichments.updatedAt))
          .limit(1),
      ]);

      const canonical = canonicalRows[0] ?? null;
      const userEnrichment = userRows[0] ?? null;
      const parsedEntities = parseJsonArray<{
        name: string;
        type: string;
        relationship?: string;
        confidence: number;
        evidenceText?: string | null;
      }>(canonical?.entitiesJson ?? null);
      const activePersonRows =
        parsedEntities.length > 0
          ? await ctx.db
              .select({
                personId: userPeople.id,
                normalizedName: userPeople.normalizedName,
                profileImageUrl: userPeople.profileImageUrl,
                profileImageSource: userPeople.profileImageSource,
                xHandle: userPeople.xHandle,
              })
              .from(userPersonMentions)
              .innerJoin(userPeople, eq(userPersonMentions.userPersonId, userPeople.id))
              .where(
                and(
                  eq(userPersonMentions.userItemId, owned[0].userItemId),
                  eq(userPersonMentions.userId, ctx.userId),
                  eq(userPersonMentions.isActive, true)
                )
              )
          : [];
      const personByNormalizedName = new Map(
        activePersonRows.map((row) => [row.normalizedName, row])
      );

      return {
        item: {
          status: canonical?.status ?? 'MISSING',
          schemaVersion: canonical?.schemaVersion ?? null,
          modelProvider: canonical?.modelProvider ?? null,
          modelName: canonical?.modelName ?? null,
          summaryShort: canonical?.summaryShort ?? null,
          summaryDetail: canonical?.summaryDetail ?? null,
          primaryCategory: canonical?.primaryCategory ?? null,
          secondaryCategories: parseJsonArray<string>(canonical?.secondaryCategoriesJson ?? null),
          topics: parseJsonArray<{ name: string; confidence: number }>(
            canonical?.topicsJson ?? null
          ),
          entities: parsedEntities.map((entity) => {
            const isPerson = entity.type.trim().toLowerCase() === 'person';
            const normalizedPersonName = isPerson ? normalizePersonName(entity.name) : '';

            return {
              ...entity,
              name: isPerson ? normalizePersonDisplayName(entity.name) : entity.name,
              personId: normalizedPersonName
                ? (personByNormalizedName.get(normalizedPersonName)?.personId ?? null)
                : null,
              profileImageUrl: normalizedPersonName
                ? (personByNormalizedName.get(normalizedPersonName)?.profileImageUrl ?? null)
                : null,
              profileImageSource: normalizedPersonName
                ? (personByNormalizedName.get(normalizedPersonName)?.profileImageSource ?? null)
                : null,
              xHandle: normalizedPersonName
                ? (personByNormalizedName.get(normalizedPersonName)?.xHandle ?? null)
                : null,
            };
          }),
          intent: canonical?.intent ?? null,
          difficulty: canonical?.difficulty ?? null,
          evergreenScore: canonical?.evergreenScore ?? null,
          timeSensitivity: canonical?.timeSensitivity ?? null,
          confidence: parseJsonObjectValue(canonical?.confidenceJson ?? null),
          source: {
            coverage: canonical?.sourceCoverage ?? null,
            kind: canonical?.sourceKind ?? null,
            contentHash: canonical?.sourceContentHash ?? null,
            wordCount: canonical?.sourceWordCount ?? null,
            qualityScore: canonical?.sourceQualityScore ?? null,
            qualityWarnings: parseJsonArray<string>(canonical?.sourceQualityWarningsJson ?? null),
          },
          understanding: parseJsonObjectValue(canonical?.understandingJson ?? null),
          enrichedAt: canonical?.enrichedAt ?? null,
        },
        userItem: {
          status: userEnrichment?.status ?? 'MISSING',
          schemaVersion: userEnrichment?.schemaVersion ?? null,
          suggestedTags: parseJsonArray<SuggestedTag>(userEnrichment?.suggestedTagsJson ?? null),
          inferredSaveIntent: userEnrichment?.inferredSaveIntent ?? null,
          reasonToRevisit: userEnrichment?.reasonToRevisit ?? null,
          enrichedAt: userEnrichment?.enrichedAt ?? null,
        },
      };
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

      const finalTags = await replaceTagsForUserItem(ctx, input.id, input.tags);

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
      try {
        return await bookmarkItem(ctx, input);
      } catch (error) {
        if (error instanceof ItemStateError) {
          throw new TRPCError({ code: error.code, message: error.message });
        }
        throw error;
      }
    }),

  archive: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await archiveItem(ctx, input);
      } catch (error) {
        if (error instanceof ItemStateError) {
          throw new TRPCError({ code: error.code, message: error.message });
        }
        throw error;
      }
    }),

  unbookmark: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await unbookmarkItem(ctx, input);
      } catch (error) {
        if (error instanceof ItemStateError) {
          throw new TRPCError({ code: error.code, message: error.message });
        }
        throw error;
      }
    }),

  /**
   * Toggle the isFinished state of an item.
   * Works in any state (INBOX, BOOKMARKED, ARCHIVED).
   */
  toggleFinished: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const result = await changeItemFinishedState(ctx, {
        userItemId: input.id,
        change: { type: 'toggle' },
      });
      if (!result) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Item not found' });
      }
      return {
        success: true as const,
        isFinished: result.isFinished,
        finishedAt: result.finishedAt,
      };
    }),

  /**
   * Record that an item was opened from detail.
   */
  markOpened: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const now = new Date().toISOString();
      const nowMs = Date.now();

      const existing = await ctx.db
        .select({ id: userItems.id, itemId: userItems.itemId, state: userItems.state })
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

      await insertConsumptionEvent(ctx, {
        userItemId: existing[0].id,
        itemId: existing[0].itemId,
        eventType: 'OPENED',
        occurredAt: nowMs,
        source: 'ITEM_DETAIL_OPEN',
        metadata: {
          state: existing[0].state,
        },
      });

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
      const nowMs = Date.now();

      // Verify the item exists and belongs to the user
      const existing = await ctx.db
        .select({
          id: userItems.id,
          itemId: userItems.itemId,
          progressPosition: userItems.progressPosition,
          progressDuration: userItems.progressDuration,
        })
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

      const previousPosition = existing[0].progressPosition ?? 0;
      const deltaSeconds = Math.max(0, Math.round(input.position - previousPosition));

      if (deltaSeconds > 0) {
        await insertConsumptionEvent(ctx, {
          userItemId: existing[0].id,
          itemId: existing[0].itemId,
          eventType: 'PROGRESS_DELTA',
          occurredAt: nowMs,
          positionSeconds: Math.round(input.position),
          durationSeconds: Math.round(input.duration),
          deltaSeconds,
          source: 'PLAYER',
          metadata: existing[0].progressDuration
            ? {
                previousDurationSeconds: existing[0].progressDuration,
              }
            : null,
        });
      }

      return { success: true as const };
    }),
});

export type ItemsRouter = typeof itemsRouter;

// Export helpers for testing and reuse
export { getItemSubscriptionSettings };
