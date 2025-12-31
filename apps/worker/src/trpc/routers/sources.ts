/**
 * Sources tRPC Router
 *
 * Handles content source subscription management (YouTube, Spotify, RSS, Substack).
 * Implements D1 queries via Drizzle ORM.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc';
import { Provider, ProviderSchema } from '@zine/shared';
import { sources } from '../../db/schema';

// ============================================================================
// Types
// ============================================================================

/**
 * Source response type for API
 */
export type SourceView = {
  id: string;
  provider: Provider;
  providerId: string;
  feedUrl: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

// ============================================================================
// Zod Schemas
// ============================================================================

// Input schema for adding a source
const AddSourceInputSchema = z.object({
  provider: ProviderSchema,
  feedUrl: z.string().url('Invalid URL format'),
  name: z.string().min(1).max(100).optional(),
});

// Input schema for removing a source
const RemoveSourceInputSchema = z.object({
  id: z.string().min(1),
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Derive a name from the feedUrl if not provided
 */
function deriveNameFromUrl(feedUrl: string, provider: Provider): string {
  try {
    const url = new URL(feedUrl);

    switch (provider) {
      case Provider.YOUTUBE:
        // Extract channel name from YouTube URL
        if (url.pathname.startsWith('/@')) {
          return url.pathname.slice(2); // Remove '/@'
        }
        if (url.pathname.startsWith('/channel/')) {
          return `YouTube Channel`;
        }
        return url.hostname;

      case Provider.SPOTIFY:
        // Extract show name from Spotify URL
        return `Spotify Show`;

      case Provider.SUBSTACK:
        // Extract subdomain or path
        if (url.hostname.endsWith('.substack.com')) {
          return url.hostname.replace('.substack.com', '');
        }
        return url.hostname;

      case Provider.RSS:
        // Use hostname as name
        return url.hostname;

      default:
        return url.hostname;
    }
  } catch {
    return 'Unknown Source';
  }
}

/**
 * Extract provider ID from URL based on provider type
 */
function extractProviderId(feedUrl: string, provider: Provider): string {
  try {
    const url = new URL(feedUrl);

    switch (provider) {
      case Provider.YOUTUBE:
        // Try to extract channel ID from various YouTube URL formats
        if (url.pathname.startsWith('/@')) {
          return url.pathname.slice(2);
        }
        if (url.pathname.startsWith('/channel/')) {
          return url.pathname.slice(9).split('/')[0];
        }
        // For playlist or other URLs, use the full path
        return url.pathname.slice(1);

      case Provider.SPOTIFY: {
        // Extract show ID from Spotify URL (e.g., /show/{id})
        const spotifyMatch = url.pathname.match(/\/show\/([a-zA-Z0-9]+)/);
        return spotifyMatch ? spotifyMatch[1] : url.pathname;
      }

      case Provider.SUBSTACK:
        // Use subdomain or path as ID
        if (url.hostname.endsWith('.substack.com')) {
          return url.hostname.replace('.substack.com', '');
        }
        return url.hostname;

      case Provider.RSS:
        // Use hostname + path as unique ID
        return `${url.hostname}${url.pathname}`;

      default:
        return feedUrl;
    }
  } catch {
    return feedUrl;
  }
}

/**
 * Transform a DB row to SourceView
 */
function toSourceView(row: typeof sources.$inferSelect): SourceView {
  return {
    id: row.id,
    provider: row.provider as Provider,
    providerId: row.providerId,
    feedUrl: row.feedUrl,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ============================================================================
// Router
// ============================================================================

export const sourcesRouter = router({
  /**
   * List user's subscribed sources
   *
   * Returns all active sources (excludes soft-deleted)
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const results = await ctx.db
      .select()
      .from(sources)
      .where(and(eq(sources.userId, ctx.userId), isNull(sources.deletedAt)))
      .orderBy(desc(sources.createdAt));

    return results.map(toSourceView);
  }),

  /**
   * Subscribe to a new content source
   *
   * Input: provider, feedUrl, optional name (auto-derived if not provided)
   * Returns the created source
   */
  add: protectedProcedure.input(AddSourceInputSchema).mutation(async ({ ctx, input }) => {
    // Check for duplicate subscription
    const existing = await ctx.db
      .select({ id: sources.id })
      .from(sources)
      .where(
        and(
          eq(sources.userId, ctx.userId),
          eq(sources.provider, input.provider),
          eq(sources.feedUrl, input.feedUrl),
          isNull(sources.deletedAt)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'Already subscribed to this source',
      });
    }

    // Derive name if not provided
    const name = input.name || deriveNameFromUrl(input.feedUrl, input.provider as Provider);

    // Extract provider ID from URL
    const providerId = extractProviderId(input.feedUrl, input.provider as Provider);

    // Create new source
    const now = new Date().toISOString();
    const newSource = {
      id: crypto.randomUUID(),
      userId: ctx.userId,
      provider: input.provider,
      providerId,
      feedUrl: input.feedUrl,
      name,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    await ctx.db.insert(sources).values(newSource);

    return toSourceView(newSource);
  }),

  /**
   * Unsubscribe from a source (soft delete)
   *
   * Input: source ID
   * Returns success status
   */
  remove: protectedProcedure.input(RemoveSourceInputSchema).mutation(async ({ ctx, input }) => {
    // Check that the source exists and belongs to the user
    const existing = await ctx.db
      .select({ id: sources.id })
      .from(sources)
      .where(
        and(eq(sources.id, input.id), eq(sources.userId, ctx.userId), isNull(sources.deletedAt))
      )
      .limit(1);

    if (existing.length === 0) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Source ${input.id} not found`,
      });
    }

    // Soft delete the source
    const now = new Date().toISOString();
    await ctx.db
      .update(sources)
      .set({
        deletedAt: now,
        updatedAt: now,
      })
      .where(eq(sources.id, input.id));

    return { success: true as const };
  }),
});

// Export type for client usage
export type SourcesRouter = typeof sourcesRouter;
