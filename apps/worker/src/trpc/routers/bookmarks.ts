/**
 * Bookmarks tRPC Router
 *
 * Handles manual link saving (bookmarking) functionality.
 * Provides two main operations:
 * 1. preview - Fetches link preview metadata for a URL
 * 2. save - Saves a bookmark to the user's library
 *
 * This router supports the Manual Link Saving feature, allowing users
 * to save content from YouTube, Spotify, RSS feeds, and Substack.
 */

import { z } from 'zod';
import { ulid } from 'ulid';
import { eq, and } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc';
import { ContentTypeSchema, ProviderSchema, UserItemState } from '@zine/shared';
import { items, userItems, users, providerConnections } from '../../db/schema';
import { fetchLinkPreview } from '../../lib/link-preview';
import { getValidAccessToken, type TokenRefreshEnv } from '../../lib/token-refresh';
import { extractArticle } from '../../lib/article-extractor';
import { storeArticleContent } from '../../lib/article-storage';
import { logger } from '../../lib/logger';
import {
  findOrCreateCreator,
  extractCreatorFromMetadata,
  generateSyntheticCreatorId,
} from '../../db/helpers/creators';
import type { createDb } from '../../db';
import type { Bindings } from '../../types';

const bookmarksLogger = logger.child('bookmarks');

// ============================================================================
// Types
// ============================================================================

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

// ============================================================================
// Zod Schemas
// ============================================================================

const PreviewInputSchema = z.object({
  url: z.string().url('Invalid URL format'),
});

const SaveInputSchema = z.object({
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
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get user's OAuth access tokens for enhanced metadata fetching
 */
async function getUserAccessTokens(
  userId: string,
  ctx: { db: ReturnType<typeof createDb>; env: Bindings }
): Promise<{ youtube?: string; spotify?: string }> {
  const tokens: { youtube?: string; spotify?: string } = {};

  // Skip token fetching if encryption key is not configured
  if (!ctx.env.ENCRYPTION_KEY) {
    return tokens;
  }

  try {
    // Fetch all active connections for the user
    const connections = await ctx.db.query.providerConnections.findMany({
      where: and(eq(providerConnections.userId, userId), eq(providerConnections.status, 'ACTIVE')),
    });

    // Get valid tokens for each connected provider
    // Cast env to TokenRefreshEnv since we verified ENCRYPTION_KEY exists
    const tokenRefreshEnv = ctx.env as TokenRefreshEnv;

    for (const connection of connections) {
      try {
        if (connection.provider === 'YOUTUBE') {
          const token = await getValidAccessToken(connection, tokenRefreshEnv);
          tokens.youtube = token;
        } else if (connection.provider === 'SPOTIFY') {
          const token = await getValidAccessToken(connection, tokenRefreshEnv);
          tokens.spotify = token;
        }
      } catch {
        // If token refresh fails, continue without that token
        // The preview will fall back to oEmbed/OG scraping
      }
    }
  } catch {
    // If database query fails, continue without tokens
  }

  return tokens;
}

// ============================================================================
// Router
// ============================================================================

export const bookmarksRouter = router({
  /**
   * Fetch link preview metadata for a URL
   *
   * Uses a priority-based fallback system:
   * 1. Provider API (if user has OAuth token)
   * 2. oEmbed API
   * 3. Open Graph scraping
   *
   * @param url - The URL to fetch preview for
   * @returns LinkPreviewResult with metadata, or null if URL is invalid/unsupported
   */
  preview: protectedProcedure.input(PreviewInputSchema).query(async ({ input, ctx }) => {
    // Get user's access tokens for enhanced metadata
    const accessTokens = await getUserAccessTokens(ctx.userId, ctx);

    // Fetch preview with optional OAuth tokens
    const preview = await fetchLinkPreview(input.url, { accessTokens });

    return preview;
  }),

  /**
   * Save a bookmark to the user's library
   *
   * This mutation:
   * 1. Finds or creates the canonical item by providerId + provider
   * 2. Checks if user already has a user_item for this item
   * 3. Returns appropriate status based on existing state
   *
   * @returns Object with itemId, userItemId, and status
   */
  save: protectedProcedure.input(SaveInputSchema).mutation(async ({ input, ctx }) => {
    const now = new Date().toISOString();

    // 1. Find or create the canonical item
    const existingItem = await ctx.db.query.items.findFirst({
      where: and(eq(items.provider, input.provider), eq(items.providerId, input.providerId)),
    });

    let itemId: string;

    // Extract creator info (used for both new items and backfilling existing)
    let creatorId: string | null = null;

    // Try to extract from rawMetadata first (preferred - has real provider IDs)
    if (input.rawMetadata) {
      try {
        const parsedMetadata = JSON.parse(input.rawMetadata);
        const creatorParams = extractCreatorFromMetadata(input.provider, parsedMetadata);

        if (creatorParams) {
          const creator = await findOrCreateCreator(ctx, creatorParams);
          creatorId = creator.id;
          bookmarksLogger.debug('Creator extracted from metadata', {
            creatorId,
            provider: input.provider,
            name: creatorParams.name,
          });
        }
      } catch (error) {
        bookmarksLogger.warn('Failed to parse rawMetadata for creator extraction', { error });
      }
    }

    // Fallback: use creator name with synthetic ID
    if (!creatorId && input.creator) {
      const syntheticId = generateSyntheticCreatorId(input.provider, input.creator);
      const creator = await findOrCreateCreator(ctx, {
        provider: input.provider,
        providerCreatorId: syntheticId,
        name: input.creator,
        imageUrl: input.creatorImageUrl ?? undefined,
      });
      creatorId = creator.id;
      bookmarksLogger.debug('Creator created with synthetic ID', {
        creatorId,
        provider: input.provider,
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
      if (input.provider === 'WEB' && input.hasArticleContent === true) {
        try {
          bookmarksLogger.debug('Extracting article content', {
            url: input.canonicalUrl,
            itemId,
          });

          const articleData = await extractArticle(input.canonicalUrl);

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
            url: input.canonicalUrl,
            itemId,
          });
        }
      }

      // Note: creator and creatorImageUrl are now sourced from creators table via creatorId join.
      // These deprecated fields are no longer written.
      await ctx.db.insert(items).values({
        id: itemId,
        contentType: input.contentType,
        provider: input.provider,
        providerId: input.providerId,
        canonicalUrl: input.canonicalUrl,
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
        // Already bookmarked - no change needed
        return {
          itemId,
          userItemId: existingUserItem.id,
          status: 'already_bookmarked' as const,
        };
      }

      // 3b. Exists with different status (INBOX or ARCHIVED) - rebookmark it
      await ctx.db
        .update(userItems)
        .set({
          state: UserItemState.BOOKMARKED,
          bookmarkedAt: now,
          updatedAt: now,
        })
        .where(eq(userItems.id, existingUserItem.id));

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
    await ctx.db.insert(userItems).values({
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
    });

    return {
      itemId,
      userItemId,
      status: 'created' as const,
    };
  }),
});

export type BookmarksRouter = typeof bookmarksRouter;
