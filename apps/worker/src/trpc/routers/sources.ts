/**
 * Sources tRPC Router
 *
 * Handles content source subscription management (YouTube, Spotify, RSS, Substack).
 * Currently uses mock data - will be replaced with D1 queries.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { Provider } from '@zine/shared';

// ============================================================================
// Mock Data
// ============================================================================

interface MockSource {
  id: string;
  userId: string;
  provider: Provider;
  providerId: string;
  feedUrl: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

const MOCK_SOURCES: MockSource[] = [
  {
    id: 'src-1',
    userId: 'user-1',
    provider: Provider.YOUTUBE,
    providerId: 'UC2KfmYEM4KCuA1ZurravgYw',
    feedUrl: 'https://www.youtube.com/@Fireship',
    name: 'Fireship',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    deletedAt: null,
  },
  {
    id: 'src-2',
    userId: 'user-1',
    provider: Provider.SPOTIFY,
    providerId: '2MAi0BvDc6GTFvKFPXnkCL',
    feedUrl: 'https://open.spotify.com/show/2MAi0BvDc6GTFvKFPXnkCL',
    name: 'Lex Fridman Podcast',
    createdAt: '2024-01-02T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
    deletedAt: null,
  },
  {
    id: 'src-3',
    userId: 'user-1',
    provider: Provider.SUBSTACK,
    providerId: 'stratechery',
    feedUrl: 'https://stratechery.com/feed/',
    name: 'Stratechery',
    createdAt: '2024-01-03T00:00:00Z',
    updatedAt: '2024-01-03T00:00:00Z',
    deletedAt: null,
  },
  {
    id: 'src-4',
    userId: 'user-1',
    provider: Provider.RSS,
    providerId: 'hacker-news',
    feedUrl: 'https://news.ycombinator.com/rss',
    name: 'Hacker News',
    createdAt: '2024-01-04T00:00:00Z',
    updatedAt: '2024-01-04T00:00:00Z',
    deletedAt: null,
  },
  {
    id: 'src-5',
    userId: 'user-1',
    provider: Provider.YOUTUBE,
    providerId: 'UCsBjURrPoezykLs9EqgamOA',
    feedUrl: 'https://www.youtube.com/@Fireship-deleted',
    name: 'Deleted Channel',
    createdAt: '2024-01-05T00:00:00Z',
    updatedAt: '2024-01-05T00:00:00Z',
    deletedAt: '2024-06-01T00:00:00Z', // Soft-deleted
  },
];

// ============================================================================
// Zod Schemas
// ============================================================================

// Provider enum schema (UPPERCASE values as per domain types)
const ProviderSchema = z.enum(['YOUTUBE', 'SPOTIFY', 'SUBSTACK', 'RSS']);

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
 * Generate a simple unique ID for mock data
 */
function generateId(): string {
  return `src-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
  list: protectedProcedure.query(({ ctx }) => {
    // TODO: Replace with D1 query
    // const sources = await ctx.db.query.sources.findMany({
    //   where: and(
    //     eq(sources.userId, ctx.userId),
    //     isNull(sources.deletedAt)
    //   ),
    //   orderBy: desc(sources.createdAt)
    // });

    // Filter to active sources (not soft-deleted) for the current user
    const activeSources = MOCK_SOURCES.filter(
      (source) => source.deletedAt === null
      // In real implementation: && source.userId === ctx.userId
    );

    // Return sources without internal fields
    return activeSources.map((source) => ({
      id: source.id,
      provider: source.provider,
      providerId: source.providerId,
      feedUrl: source.feedUrl,
      name: source.name,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
    }));
  }),

  /**
   * Subscribe to a new content source
   *
   * Input: provider, feedUrl, optional name (auto-derived if not provided)
   * Returns the created source
   */
  add: protectedProcedure.input(AddSourceInputSchema).mutation(({ ctx, input }) => {
    // TODO: Replace with D1 query
    // Check for duplicate subscription
    // const existing = await ctx.db.query.sources.findFirst({
    //   where: and(
    //     eq(sources.userId, ctx.userId),
    //     eq(sources.provider, input.provider),
    //     eq(sources.feedUrl, input.feedUrl),
    //     isNull(sources.deletedAt)
    //   )
    // });
    // if (existing) {
    //   throw new TRPCError({ code: 'CONFLICT', message: 'Already subscribed to this source' });
    // }

    // Check for duplicate in mock data
    const existingSource = MOCK_SOURCES.find(
      (source) =>
        source.feedUrl === input.feedUrl &&
        source.provider === input.provider &&
        source.deletedAt === null
    );

    if (existingSource) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'Already subscribed to this source',
      });
    }

    // Derive name if not provided
    const name = input.name || deriveNameFromUrl(input.feedUrl, input.provider as Provider);

    // Create new source
    const now = new Date().toISOString();
    const newSource: MockSource = {
      id: generateId(),
      userId: ctx.userId,
      provider: input.provider as Provider,
      providerId: generateId(), // In real impl, extract from URL or API
      feedUrl: input.feedUrl,
      name,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    // TODO: In real implementation, insert into D1
    // await ctx.db.insert(sources).values(newSource);

    console.log(`[MOCK] Adding source: ${newSource.name} (${newSource.provider})`);

    // Return the created source
    return {
      id: newSource.id,
      provider: newSource.provider,
      providerId: newSource.providerId,
      feedUrl: newSource.feedUrl,
      name: newSource.name,
      createdAt: newSource.createdAt,
      updatedAt: newSource.updatedAt,
    };
  }),

  /**
   * Unsubscribe from a source (soft delete)
   *
   * Input: source ID
   * Returns success status
   */
  remove: protectedProcedure.input(RemoveSourceInputSchema).mutation(({ ctx, input }) => {
    // TODO: Replace with D1 query
    // const source = await ctx.db.query.sources.findFirst({
    //   where: and(
    //     eq(sources.id, input.id),
    //     eq(sources.userId, ctx.userId),
    //     isNull(sources.deletedAt)
    //   )
    // });
    // if (!source) {
    //   throw new TRPCError({ code: 'NOT_FOUND', message: 'Source not found' });
    // }
    // await ctx.db.update(sources)
    //   .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    //   .where(eq(sources.id, input.id));

    // Find source in mock data
    const source = MOCK_SOURCES.find(
      (s) => s.id === input.id && s.deletedAt === null
      // In real impl: && s.userId === ctx.userId
    );

    if (!source) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Source ${input.id} not found`,
      });
    }

    console.log(`[MOCK] Removing source: ${source.name} (${source.id})`);

    // TODO: In real implementation, soft delete in D1
    // For mock, we just log the action

    return { success: true as const };
  }),
});

// Export type for client usage
export type SourcesRouter = typeof sourcesRouter;
