import { z } from 'zod';
import { ulid } from 'ulid';
import { eq, and } from 'drizzle-orm';
import {
  ContentType,
  ContentTypeSchema,
  getSubstackArticleProviderId,
  normalizeSubstackArticleUrl,
  Provider,
  ProviderSchema,
  UserItemState,
} from '@zine/shared';
import { items, userItems, users } from '../db/schema';
import type { Database } from '../db';
import type { Bindings } from '../types';
import { extractArticle } from '../lib/article-extractor';
import { storeArticleContent } from '../lib/article-storage';
import { logger } from '../lib/logger';
import { bookmarkEnrichmentIntent, dispatchBookmarkEnrichment } from '../enrichment/outbox';
import { syncPeopleForUserItemBestEffort } from '../people/service';
import {
  findOrCreateCreator,
  extractCreatorFromMetadata,
  generateSyntheticCreatorId,
} from '../db/helpers/creators';
import { mergeTagsForUserItem } from '../trpc/tagging';

const bookmarksLogger = logger.child('bookmarks');

/**
 * Status returned after saving a bookmark
 */
export type BookmarkSaveStatus = 'created' | 'already_bookmarked' | 'rebookmarked';

/**
 * Result of the save mutation
 */
export interface BookmarkSaveResult {
  itemId: string;
  userItemId: string;
  status: BookmarkSaveStatus;
}

export const BookmarkSaveInputSchema = z.object({
  url: z.string().url('Invalid URL format'),
  provider: ProviderSchema,
  contentType: ContentTypeSchema,
  providerId: z.string().min(1, 'Provider ID is required'),
  title: z.string().min(1, 'Title is required'),
  creator: z.string().min(1, 'Creator is required'),
  creatorImageUrl: z.string().url().nullable().optional(), // Channel/show/podcast image
  thumbnailUrl: z.string().url().nullable(),
  duration: z.number().int().min(0).nullable(),
  canonicalUrl: z.string().url('Invalid canonical URL'),
  description: z.string().optional(),
  // Article-specific fields
  siteName: z.string().optional(),
  wordCount: z.number().int().min(0).optional(),
  readingTimeMinutes: z.number().int().min(0).optional(),
  hasArticleContent: z.boolean().optional(),
  // X/Twitter-specific fields
  publishedAt: z.string().optional(), // ISO8601 timestamp
  rawMetadata: z.string().optional(), // JSON string of provider API response
  tags: z.array(z.string().min(1).max(64)).max(20).optional(),
});

export type BookmarkSaveInput = z.infer<typeof BookmarkSaveInputSchema>;

type BookmarkSaveContext = {
  db: Database;
  userId: string;
  env: Bindings;
  requestId: string;
  traceId: string;
};

/** Save validated bookmark metadata, preserving existing creation and retry semantics. */
export async function saveBookmark(
  ctx: BookmarkSaveContext,
  input: BookmarkSaveInput
): Promise<BookmarkSaveResult> {
  const now = new Date().toISOString();
  const substackCanonicalUrl =
    normalizeSubstackArticleUrl(input.canonicalUrl) ?? normalizeSubstackArticleUrl(input.url);
  const substackProviderId = getSubstackArticleProviderId(substackCanonicalUrl);
  const provider = substackProviderId ? Provider.SUBSTACK : input.provider;
  const contentType = substackProviderId ? ContentType.ARTICLE : input.contentType;
  const providerId = substackProviderId ?? input.providerId;
  const canonicalUrl = substackCanonicalUrl ?? input.canonicalUrl;

  // 1. Find or create the canonical item
  const existingItem = await ctx.db.query.items.findFirst({
    where: and(eq(items.provider, provider), eq(items.providerId, providerId)),
  });

  let itemId: string;

  // Extract creator info (used for both new items and backfilling existing)
  let creatorId: string | null = null;

  // Try to extract from rawMetadata first (preferred - has real provider IDs)
  if (input.rawMetadata) {
    try {
      const parsedMetadata = JSON.parse(input.rawMetadata);
      const creatorParams = extractCreatorFromMetadata(provider, parsedMetadata);

      if (creatorParams) {
        const creator = await findOrCreateCreator(ctx, creatorParams);
        creatorId = creator.id;
        bookmarksLogger.debug('Creator extracted from metadata', {
          creatorId,
          provider,
          name: creatorParams.name,
        });
      }
    } catch (error) {
      bookmarksLogger.warn('Failed to parse rawMetadata for creator extraction', { error });
    }
  }

  // Fallback: use creator name with synthetic ID
  if (!creatorId && input.creator) {
    const syntheticId = generateSyntheticCreatorId(provider, input.creator);
    const creator = await findOrCreateCreator(ctx, {
      provider,
      providerCreatorId: syntheticId,
      name: input.creator,
      imageUrl: input.creatorImageUrl ?? undefined,
    });
    creatorId = creator.id;
    bookmarksLogger.debug('Creator created with synthetic ID', {
      creatorId,
      provider,
      name: input.creator,
      syntheticId,
    });
  }

  if (existingItem) {
    itemId = existingItem.id;

    // Backfill: update existing item with creatorId if missing
    if (!existingItem.creatorId && creatorId) {
      await ctx.db
        .update(items)
        .set({
          creatorId,
          updatedAt: now,
        })
        .where(eq(items.id, existingItem.id));
      bookmarksLogger.info('Backfilled creatorId on existing item', {
        itemId: existingItem.id,
        creatorId,
      });
    }
  } else {
    // Create new item
    itemId = ulid();

    // Initialize article metadata fields
    let wordCount: number | null = input.wordCount ?? null;
    let readingTimeMinutes: number | null = input.readingTimeMinutes ?? null;
    let articleContentKey: string | null = null;

    // For WEB provider items with article content, extract and store the article
    if (provider === Provider.WEB && input.hasArticleContent === true) {
      try {
        bookmarksLogger.debug('Extracting article content', {
          url: canonicalUrl,
          itemId,
        });

        const articleData = await extractArticle(canonicalUrl);

        if (articleData?.content && ctx.env.ARTICLE_CONTENT) {
          // Store article content in R2
          articleContentKey = await storeArticleContent(
            ctx.env.ARTICLE_CONTENT,
            itemId,
            articleData.content
          );

          // Use extracted metadata if not provided in input
          wordCount = wordCount ?? articleData.wordCount;
          readingTimeMinutes = readingTimeMinutes ?? articleData.readingTimeMinutes;

          bookmarksLogger.info('Article content stored', {
            itemId,
            articleContentKey,
            wordCount,
            readingTimeMinutes,
          });
        } else if (!articleData?.content) {
          bookmarksLogger.debug('No article content to store', {
            url: input.canonicalUrl,
            itemId,
            isArticle: articleData?.isArticle,
          });
        }
      } catch (error) {
        // Article storage is best-effort - log error but don't fail the save
        bookmarksLogger.error('Failed to extract/store article content', {
          error,
          url: canonicalUrl,
          itemId,
        });
      }
    }

    // Note: creator and creatorImageUrl are now sourced from creators table via creatorId join.
    // These deprecated fields are no longer written.
    await ctx.db.insert(items).values({
      id: itemId,
      contentType,
      provider,
      providerId,
      canonicalUrl,
      title: input.title,
      thumbnailUrl: input.thumbnailUrl,
      creatorId,
      publisher: input.siteName ?? null,
      summary: input.description ?? null,
      duration: input.duration,
      publishedAt: input.publishedAt ?? null,
      wordCount,
      readingTimeMinutes,
      articleContentKey,
      rawMetadata: input.rawMetadata ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  // 2. Check if user already has a user_item for this item
  const existingUserItem = await ctx.db.query.userItems.findFirst({
    where: and(eq(userItems.userId, ctx.userId), eq(userItems.itemId, itemId)),
  });

  if (existingUserItem) {
    // 3a. User already has this item
    if (existingUserItem.state === UserItemState.BOOKMARKED) {
      if (input.tags && input.tags.length > 0) {
        await mergeTagsForUserItem(ctx, existingUserItem.id, input.tags);
      }

      await dispatchBookmarkEnrichment(ctx, {
        userId: ctx.userId,
        userItemId: existingUserItem.id,
      });
      // Already bookmarked - no change needed
      return {
        itemId,
        userItemId: existingUserItem.id,
        status: 'already_bookmarked' as const,
      };
    }

    // 3b. Exists with different status (INBOX or ARCHIVED) - rebookmark it
    await ctx.db.batch([
      ctx.db
        .update(userItems)
        .set({
          state: UserItemState.BOOKMARKED,
          bookmarkedAt: now,
          updatedAt: now,
        })
        .where(eq(userItems.id, existingUserItem.id)),
      bookmarkEnrichmentIntent(ctx.db, {
        userId: ctx.userId,
        itemId,
        userItemId: existingUserItem.id,
        trigger: 'manual_save',
      }),
    ]);
    await dispatchBookmarkEnrichment(ctx, {
      userId: ctx.userId,
      userItemId: existingUserItem.id,
    });

    await syncPeopleForUserItemBestEffort(ctx.db, {
      userId: ctx.userId,
      userItemId: existingUserItem.id,
      operation: 'bookmarks.save.rebookmark',
    });

    if (input.tags && input.tags.length > 0) {
      await mergeTagsForUserItem(ctx, existingUserItem.id, input.tags);
    }

    return {
      itemId,
      userItemId: existingUserItem.id,
      status: 'rebookmarked' as const,
    };
  }

  // 3c. No existing user_item - create new one with BOOKMARKED status
  // First ensure user exists in the users table (handles race condition if webhook hasn't fired yet)
  await ctx.db
    .insert(users)
    .values({
      id: ctx.userId,
      email: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

  const userItemId = ulid();
  await ctx.db.batch([
    ctx.db.insert(userItems).values({
      id: userItemId,
      userId: ctx.userId,
      itemId,
      state: UserItemState.BOOKMARKED,
      ingestedAt: now,
      bookmarkedAt: now,
      archivedAt: null,
      progressPosition: null,
      progressDuration: null,
      progressUpdatedAt: null,
      isFinished: false,
      finishedAt: null,
      createdAt: now,
      updatedAt: now,
    }),
    bookmarkEnrichmentIntent(ctx.db, {
      userId: ctx.userId,
      itemId,
      userItemId,
      trigger: 'manual_save',
    }),
  ]);
  await dispatchBookmarkEnrichment(ctx, { userId: ctx.userId, userItemId });

  await syncPeopleForUserItemBestEffort(ctx.db, {
    userId: ctx.userId,
    userItemId,
    operation: 'bookmarks.save.create',
  });

  if (input.tags && input.tags.length > 0) {
    await mergeTagsForUserItem(ctx, userItemId, input.tags);
  }

  return {
    itemId,
    userItemId,
    status: 'created' as const,
  };
}
