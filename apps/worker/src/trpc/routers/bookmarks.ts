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
import { items, userItems, providerConnections } from '../../db/schema';
import { fetchLinkPreview } from '../../lib/link-preview';
import { getValidAccessToken, type TokenRefreshEnv } from '../../lib/token-refresh';
import type { createDb } from '../../db';
import type { Bindings } from '../../types';

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
  thumbnailUrl: z.string().url().nullable(),
  duration: z.number().int().min(0).nullable(),
  canonicalUrl: z.string().url('Invalid canonical URL'),
  description: z.string().optional(),
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

    if (existingItem) {
      itemId = existingItem.id;
    } else {
      // Create new item
      itemId = ulid();
      await ctx.db.insert(items).values({
        id: itemId,
        contentType: input.contentType,
        provider: input.provider,
        providerId: input.providerId,
        canonicalUrl: input.canonicalUrl,
        title: input.title,
        thumbnailUrl: input.thumbnailUrl,
        creator: input.creator,
        publisher: null,
        summary: input.description ?? null,
        duration: input.duration,
        publishedAt: null,
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
