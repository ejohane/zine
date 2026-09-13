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
import { eq, and } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc';
import { providerConnections } from '../../db/schema';
import { BookmarkSaveInputSchema, saveBookmark } from '../../bookmarks/save';
import { fetchLinkPreview } from '../../lib/link-preview';
import { getValidAccessToken, type TokenRefreshEnv } from '../../lib/token-refresh';
import { logger } from '../../lib/logger';
import type { createDb } from '../../db';
import type { Bindings } from '../../types';

const bookmarksLogger = logger.child('bookmarks');

export type { BookmarkSaveResult, BookmarkSaveStatus } from '../../bookmarks/save';

const PreviewInputSchema = z.object({ url: z.string().url('Invalid URL format') });

// Helper Functions

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
  } catch (error) {
    bookmarksLogger.warn('Failed to fetch user provider connections for token retrieval', {
      userId,
      error,
    });
  }

  return tokens;
}

// Router

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
  save: protectedProcedure
    .input(BookmarkSaveInputSchema)
    .mutation(({ input, ctx }) => saveBookmark(ctx, input)),
});

export type BookmarksRouter = typeof bookmarksRouter;
