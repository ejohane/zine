/**
 * Creators tRPC Router
 *
 * Handles creator-related operations for the Creator View feature.
 * Provides endpoints for:
 * 1. get - Get a single creator by ID
 * 2. listBookmarks - List bookmarked items for a creator
 * 3. fetchLatestContent - Fetch latest content from a creator
 * 4. ensureLatestContentItem - Resolve latest-content item to a user item
 * 5. checkSubscription - Check if user is subscribed to a creator
 * 6. subscribe - Subscribe to a creator
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, desc, lt, or, sql, inArray } from 'drizzle-orm';
import { ulid } from 'ulid';
import pLimit from 'p-limit';
import { router, protectedProcedure } from '../trpc';
import {
  creators,
  items,
  userItems,
  subscriptions,
  providerConnections,
  newsletterFeeds,
  newsletterFeedMessages,
} from '../../db/schema';
import { ContentType, UserItemState, YOUTUBE_SHORTS_MAX_DURATION_SECONDS } from '@zine/shared';
import { decodeCursor, encodeCursor } from '../../lib/pagination';
import { toItemView, type ItemView } from './items';
import {
  getYouTubeClientForConnection,
  getUploadsPlaylistId,
  fetchRecentVideos,
  fetchVideoDetails,
  extractVideoInfo,
  getChannelDetails,
} from '../../providers/youtube';
import { getSpotifyClientForConnection, getShowEpisodes, getShow } from '../../providers/spotify';
import {
  backfillNewsletterItemsForFeed,
  seedLatestNewsletterItemForFeed,
} from '../../newsletters/gmail';
import { fetchLinkPreview } from '../../lib/link-preview';
import { discoverFeedsForUrl } from '../../rss/discovery';
import { parseRssFeedXml } from '../../rss/parser';
import { hashString } from '../../rss/url';
import type { ProviderConnection, TokenRefreshEnv } from '../../lib/token-refresh';
import { TokenRefreshError } from '../../lib/token-refresh';
import type { Database } from '../../db';

// ============================================================================
// Types
// ============================================================================

/**
 * Response shape for checkSubscription
 */
export interface CheckSubscriptionResponse {
  isSubscribed: boolean;
  subscriptionId?: string;
  canSubscribe: boolean;
  reason?: 'PROVIDER_NOT_SUPPORTED' | 'NOT_CONNECTED' | 'SOURCE_NOT_FOUND';
}

/**
 * Response shape for subscribe
 */
export interface SubscribeResponse {
  id: string;
  provider: string;
  name: string;
  imageUrl: string | null;
  enabled: boolean;
}

/**
 * Reason why content couldn't be fetched
 */
export type FetchLatestContentReason =
  | 'PROVIDER_NOT_SUPPORTED'
  | 'NOT_CONNECTED'
  | 'TOKEN_EXPIRED'
  | 'RATE_LIMITED';

export type LatestContentCacheStatus = 'HIT' | 'MISS';

/**
 * Individual content item from latest content fetch
 */
export interface LatestContentItem {
  id: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  publishedAt: number; // Unix ms
  externalUrl: string;
  duration: number | null; // seconds for videos/podcasts
  itemId?: string | null;
  isBookmarked: boolean;
}

/**
 * Response shape for fetchLatestContent
 */
export interface FetchLatestContentResponse {
  items: LatestContentItem[];
  provider: string;
  cacheStatus?: LatestContentCacheStatus;
  reason?: FetchLatestContentReason;
  connectUrl?: string;
}

// ============================================================================
// Cache Configuration
// ============================================================================

const LATEST_CONTENT_CACHE_CONFIG = {
  /** TTL for cached latest content (10 minutes in seconds) */
  TTL_SECONDS: 600,
  /** Key prefix for latest content in KV */
  KEY_PREFIX: 'creator-content:',
  /** Number of items to fetch from OAuth providers */
  MAX_OAUTH_ITEMS: 10,
  /** Number of items to fetch from source RSS previews */
  MAX_RSS_ITEMS: 20,
} as const;

const OAUTH_LATEST_CONTENT_PROVIDERS = new Set(['YOUTUBE', 'SPOTIFY']);
const RSS_LATEST_CONTENT_PROVIDERS = new Set(['RSS', 'WEB', 'SUBSTACK']);
const RSS_PREVIEW_ACCEPT_HEADER =
  'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8';
const RSS_PREVIEW_FETCH_TIMEOUT_MS = 10_000;
const RSS_PREVIEW_MAX_FEED_BYTES = 1_500_000;
const THUMBNAIL_ENRICHMENT_CACHE_PREFIX = 'creator-thumbnail:';
const THUMBNAIL_ENRICHMENT_CACHE_TTL_SECONDS = 24 * 60 * 60;
const THUMBNAIL_ENRICHMENT_CONCURRENCY = 3;
const THUMBNAIL_ENRICHMENT_MAX_URLS = 8;

// ============================================================================
// Zod Schemas
// ============================================================================

const GetInputSchema = z.object({
  creatorId: z.string().min(1, 'Creator ID is required'),
});

const ListBookmarksInputSchema = z.object({
  creatorId: z.string().min(1, 'Creator ID is required'),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

const ListPublicationsInputSchema = z.object({
  creatorId: z.string().min(1, 'Creator ID is required'),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

const FetchLatestContentInputSchema = z.object({
  creatorId: z.string().min(1, 'Creator ID is required'),
});

const ResolveLatestContentThumbnailsInputSchema = z.object({
  creatorId: z.string().min(1, 'Creator ID is required'),
  urls: z.array(z.string().url('Invalid URL format')).min(1).max(THUMBNAIL_ENRICHMENT_MAX_URLS),
});

const EnsureLatestContentItemInputSchema = z.object({
  creatorId: z.string().min(1, 'Creator ID is required'),
  providerId: z.string().min(1, 'Provider item ID is required'),
  title: z.string().min(1, 'Title is required'),
  externalUrl: z.string().url('External URL must be valid'),
  thumbnailUrl: z.string().url('Thumbnail URL must be valid').nullable(),
  duration: z.number().int().positive().nullable(),
  publishedAt: z.number().int().nonnegative().nullable(),
  description: z.string().nullable().optional(),
});

const CheckSubscriptionInputSchema = z.object({
  creatorId: z.string().min(1, 'Creator ID is required'),
});

const SubscribeInputSchema = z.object({
  creatorId: z.string().min(1, 'Creator ID is required'),
});

// ============================================================================
// Router
// ============================================================================

export const creatorsRouter = router({
  /**
   * Get a single creator by ID
   *
   * Returns the creator profile including name, image, and stats.
   * If the creator is missing metadata (description/handle), attempts to
   * enrich it from the provider API (requires user to be connected).
   *
   * @param creatorId - The unique identifier of the creator
   * @returns Creator profile
   * @throws NOT_FOUND if creator doesn't exist
   */
  get: protectedProcedure.input(GetInputSchema).query(async ({ ctx, input }) => {
    const creatorResult = await ctx.db
      .select()
      .from(creators)
      .where(eq(creators.id, input.creatorId))
      .limit(1);

    if (creatorResult.length === 0) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Creator not found',
      });
    }

    const creator = creatorResult[0];

    // Enrich Spotify creator metadata if missing
    if (creator.provider === 'SPOTIFY' && (!creator.description || !creator.handle)) {
      try {
        // Check if user is connected to Spotify
        const connection = await ctx.db.query.providerConnections.findFirst({
          where: and(
            eq(providerConnections.userId, ctx.userId),
            eq(providerConnections.provider, 'SPOTIFY'),
            eq(providerConnections.status, 'ACTIVE')
          ),
        });

        if (connection) {
          const spotifyClient = await getSpotifyClientForConnection(
            connection as ProviderConnection,
            ctx.env as Parameters<typeof getSpotifyClientForConnection>[1]
          );
          const showDetails = await getShow(spotifyClient, creator.providerCreatorId);
          if (showDetails) {
            const updates: Partial<typeof creator> = {};
            if (!creator.description && showDetails.description) {
              updates.description = showDetails.description;
            }
            if (!creator.handle && showDetails.publisher) {
              updates.handle = showDetails.publisher;
            }
            if (!creator.imageUrl && showDetails.images?.[0]?.url) {
              updates.imageUrl = showDetails.images[0].url;
            }
            if (!creator.externalUrl && showDetails.externalUrl) {
              updates.externalUrl = showDetails.externalUrl;
            }

            if (Object.keys(updates).length > 0) {
              // Update DB and return enriched creator
              await ctx.db
                .update(creators)
                .set({ ...updates, updatedAt: Date.now() })
                .where(eq(creators.id, creator.id));

              return { ...creator, ...updates, updatedAt: Date.now() };
            }
          }
        }
      } catch {
        // Silently ignore enrichment errors - return original creator
      }
    }

    // Enrich YouTube creator metadata if missing
    if (creator.provider === 'YOUTUBE' && (!creator.description || !creator.handle)) {
      try {
        // Check if user is connected to YouTube
        const connection = await ctx.db.query.providerConnections.findFirst({
          where: and(
            eq(providerConnections.userId, ctx.userId),
            eq(providerConnections.provider, 'YOUTUBE'),
            eq(providerConnections.status, 'ACTIVE')
          ),
        });

        if (connection) {
          const youtubeClient = await getYouTubeClientForConnection(
            connection as ProviderConnection,
            ctx.env as Parameters<typeof getYouTubeClientForConnection>[1]
          );
          const channelDetails = await getChannelDetails(youtubeClient, creator.providerCreatorId);
          if (channelDetails?.snippet) {
            const updates: Partial<typeof creator> = {};
            if (!creator.description && channelDetails.snippet.description) {
              updates.description = channelDetails.snippet.description;
            }
            if (!creator.handle && channelDetails.snippet.customUrl) {
              updates.handle = channelDetails.snippet.customUrl;
            }
            if (!creator.imageUrl) {
              const newImageUrl =
                channelDetails.snippet.thumbnails?.high?.url ||
                channelDetails.snippet.thumbnails?.medium?.url;
              if (newImageUrl) updates.imageUrl = newImageUrl;
            }
            if (!creator.externalUrl) {
              updates.externalUrl = `https://www.youtube.com/channel/${creator.providerCreatorId}`;
            }

            if (Object.keys(updates).length > 0) {
              // Update DB and return enriched creator
              await ctx.db
                .update(creators)
                .set({ ...updates, updatedAt: Date.now() })
                .where(eq(creators.id, creator.id));

              return { ...creator, ...updates, updatedAt: Date.now() };
            }
          }
        }
      } catch {
        // Silently ignore enrichment errors - return original creator
      }
    }

    return creator;
  }),

  /**
   * List bookmarked items for a creator
   *
   * Returns a paginated list of items the user has bookmarked
   * from this creator, sorted by bookmarked date descending.
   *
   * @param creatorId - The unique identifier of the creator
   * @param cursor - Optional cursor for pagination
   * @param limit - Number of items to return (default 20, max 50)
   * @returns Paginated list of bookmarked items
   */
  listBookmarks: protectedProcedure
    .input(ListBookmarksInputSchema)
    .query(
      async ({
        ctx,
        input,
      }): Promise<{ items: ItemView[]; nextCursor: string | null; hasMore: boolean }> => {
        const { creatorId, limit } = input;
        const cursor = input.cursor ? decodeCursor(input.cursor) : null;

        // Verify creator exists
        const creator = await ctx.db
          .select({
            id: creators.id,
            provider: creators.provider,
            providerCreatorId: creators.providerCreatorId,
          })
          .from(creators)
          .where(eq(creators.id, creatorId))
          .limit(1);

        if (creator.length === 0) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Creator not found',
          });
        }

        // Build WHERE conditions
        const conditions = [
          eq(items.creatorId, creatorId),
          eq(userItems.userId, ctx.userId),
          eq(userItems.state, UserItemState.BOOKMARKED),
        ];

        // Use COALESCE to handle NULL bookmarkedAt - falls back to ingestedAt
        const sortField = sql`COALESCE(${userItems.bookmarkedAt}, ${userItems.ingestedAt})`;

        // Apply cursor-based pagination (fetch items bookmarked before cursor)
        if (cursor) {
          conditions.push(
            or(
              sql`${sortField} < ${cursor.sortValue}`,
              and(sql`${sortField} = ${cursor.sortValue}`, lt(userItems.id, cursor.id))
            )!
          );
        }

        // Execute query with joins (items + creators)
        const results = await ctx.db
          .select()
          .from(userItems)
          .innerJoin(items, eq(userItems.itemId, items.id))
          .leftJoin(creators, eq(items.creatorId, creators.id))
          .where(and(...conditions))
          .orderBy(sql`${sortField} DESC`, desc(userItems.id))
          .limit(limit + 1); // Fetch one extra to check for more

        // Check if there are more results
        const hasMore = results.length > limit;
        const pageResults = hasMore ? results.slice(0, limit) : results;

        // Transform to ItemView
        const itemViews = pageResults.map((row) => toItemView(row));

        // Generate next cursor
        let nextCursor: string | null = null;
        if (hasMore && pageResults.length > 0) {
          const lastResult = pageResults[pageResults.length - 1];
          nextCursor = encodeCursor({
            sortValue: lastResult.user_items.bookmarkedAt ?? lastResult.user_items.ingestedAt,
            id: lastResult.user_items.id,
          });
        }

        return {
          items: itemViews,
          nextCursor,
          hasMore,
        };
      }
    ),

  /**
   * List publications for a creator
   *
   * Returns a paginated list of all items for this creator that exist in the
   * current user's collection (INBOX, BOOKMARKED, and ARCHIVED).
   * This powers full publication history views (e.g., newsletter author pages).
   *
   * @param creatorId - The unique identifier of the creator
   * @param cursor - Optional cursor for pagination
   * @param limit - Number of items to return (default 20, max 50)
   * @returns Paginated list of creator publications
   */
  listPublications: protectedProcedure
    .input(ListPublicationsInputSchema)
    .query(
      async ({
        ctx,
        input,
      }): Promise<{ items: ItemView[]; nextCursor: string | null; hasMore: boolean }> => {
        const { creatorId, limit } = input;
        const cursor = input.cursor ? decodeCursor(input.cursor) : null;

        // Verify creator exists
        const creator = await ctx.db
          .select({
            id: creators.id,
            provider: creators.provider,
            providerCreatorId: creators.providerCreatorId,
          })
          .from(creators)
          .where(eq(creators.id, creatorId))
          .limit(1);

        if (creator.length === 0) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Creator not found',
          });
        }

        const creatorRecord = creator[0];

        // Opportunistic backfill for Gmail creators so author pages can show
        // historical newsletter issues (not just the most recent seeded item).
        if (!cursor && creatorRecord.provider === 'GMAIL') {
          const feed = await ctx.db.query.newsletterFeeds.findFirst({
            where: and(
              eq(newsletterFeeds.userId, ctx.userId),
              eq(newsletterFeeds.canonicalKey, creatorRecord.providerCreatorId)
            ),
            columns: {
              id: true,
              status: true,
            },
          });

          if (feed?.status === 'ACTIVE') {
            const [feedMessageCountRow] = await ctx.db
              .select({ count: sql<number>`count(*)` })
              .from(newsletterFeedMessages)
              .where(
                and(
                  eq(newsletterFeedMessages.userId, ctx.userId),
                  eq(newsletterFeedMessages.newsletterFeedId, feed.id)
                )
              );

            const feedMessageCount = Number(feedMessageCountRow?.count ?? 0);

            if (feedMessageCount < limit) {
              try {
                await backfillNewsletterItemsForFeed({
                  db: ctx.db,
                  userId: ctx.userId,
                  feedId: feed.id,
                  env: ctx.env as TokenRefreshEnv,
                  maxItems: limit,
                  maxResultsPerQuery: Math.max(30, Math.min(100, limit * 3)),
                });
              } catch {
                // Backfill is best-effort and should not block creator page rendering.
              }
            }
          }
        }

        // Build WHERE conditions
        const conditions = [eq(items.creatorId, creatorId), eq(userItems.userId, ctx.userId)];

        // Use publishedAt when available, otherwise fall back to ingestedAt.
        const sortField = sql`COALESCE(${items.publishedAt}, ${userItems.ingestedAt})`;

        // Apply cursor-based pagination (fetch items before cursor)
        if (cursor) {
          conditions.push(
            or(
              sql`${sortField} < ${cursor.sortValue}`,
              and(sql`${sortField} = ${cursor.sortValue}`, lt(userItems.id, cursor.id))
            )!
          );
        }

        // Execute query with joins (items + creators)
        const results = await ctx.db
          .select()
          .from(userItems)
          .innerJoin(items, eq(userItems.itemId, items.id))
          .leftJoin(creators, eq(items.creatorId, creators.id))
          .where(and(...conditions))
          .orderBy(sql`${sortField} DESC`, desc(userItems.id))
          .limit(limit + 1); // Fetch one extra to check for more

        // Check if there are more results
        const hasMore = results.length > limit;
        const pageResults = hasMore ? results.slice(0, limit) : results;

        // Transform to ItemView
        const itemViews = pageResults.map((row) => toItemView(row));

        // Generate next cursor
        let nextCursor: string | null = null;
        if (hasMore && pageResults.length > 0) {
          const lastResult = pageResults[pageResults.length - 1];
          nextCursor = encodeCursor({
            sortValue: lastResult.items.publishedAt ?? lastResult.user_items.ingestedAt,
            id: lastResult.user_items.id,
          });
        }

        return {
          items: itemViews,
          nextCursor,
          hasMore,
        };
      }
    ),

  /**
   * Fetch latest content from a creator
   *
   * Queries the provider API to get the creator's most recent
   * published content. Used for discovery and suggestions.
   *
   * Caching strategy:
   * - Results are cached in KV with 10-minute TTL
   * - Cache key: `creator-content:{creatorId}`
   * - Cache includes items array (without isBookmarked - computed at read time)
   *
   * Token handling:
   * - If token is expired, attempts refresh automatically
   * - If refresh fails permanently, returns TOKEN_EXPIRED reason
   *
   * @param creatorId - The unique identifier of the creator
   * @returns List of latest content items from the creator with isBookmarked populated
   */
  fetchLatestContent: protectedProcedure
    .input(FetchLatestContentInputSchema)
    .query(async ({ ctx, input }): Promise<FetchLatestContentResponse> => {
      const { creatorId } = input;

      // 1. Get the creator
      const creator = await ctx.db.query.creators.findFirst({
        where: eq(creators.id, creatorId),
      });

      if (!creator) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Creator not found',
        });
      }

      const isOAuthProvider = OAUTH_LATEST_CONTENT_PROVIDERS.has(creator.provider);
      const isRssProvider = RSS_LATEST_CONTENT_PROVIDERS.has(creator.provider);

      // 2. Only connected providers and RSS-like creators are supported.
      if (!isOAuthProvider && !isRssProvider) {
        return {
          items: [],
          provider: creator.provider,
          reason: 'PROVIDER_NOT_SUPPORTED',
        };
      }

      // 3. OAuth providers require an active connection.
      let connection: ProviderConnection | undefined;
      if (isOAuthProvider) {
        connection =
          (await ctx.db.query.providerConnections.findFirst({
            where: and(
              eq(providerConnections.userId, ctx.userId),
              eq(providerConnections.provider, creator.provider),
              eq(providerConnections.status, 'ACTIVE')
            ),
          })) ?? undefined;

        if (!connection) {
          return {
            items: [],
            provider: creator.provider,
            reason: 'NOT_CONNECTED',
            connectUrl: getConnectUrl(creator.provider),
          };
        }
      }

      // 4. Enrich OAuth creator metadata if missing (background, non-blocking).
      // This runs regardless of cache status to ensure existing creators get updated.
      if (
        isOAuthProvider &&
        creator.provider === 'YOUTUBE' &&
        (!creator.description || !creator.handle)
      ) {
        // Fire-and-forget: don't block the response
        (async () => {
          try {
            const youtubeClient = await getYouTubeClientForConnection(
              connection!,
              ctx.env as Parameters<typeof getYouTubeClientForConnection>[1]
            );
            const channelDetails = await getChannelDetails(
              youtubeClient,
              creator.providerCreatorId
            );
            if (channelDetails?.snippet) {
              const updates: Record<string, unknown> = { updatedAt: Date.now() };
              if (!creator.description && channelDetails.snippet.description) {
                updates.description = channelDetails.snippet.description;
              }
              if (!creator.handle && channelDetails.snippet.customUrl) {
                updates.handle = channelDetails.snippet.customUrl;
              }
              if (!creator.imageUrl) {
                const newImageUrl =
                  channelDetails.snippet.thumbnails?.high?.url ||
                  channelDetails.snippet.thumbnails?.medium?.url;
                if (newImageUrl) updates.imageUrl = newImageUrl;
              }
              if (!creator.externalUrl) {
                updates.externalUrl = `https://www.youtube.com/channel/${creator.providerCreatorId}`;
              }
              if (Object.keys(updates).length > 1) {
                await ctx.db.update(creators).set(updates).where(eq(creators.id, creator.id));
              }
            }
          } catch {
            // Silently ignore enrichment errors - non-critical
          }
        })();
      }

      if (
        isOAuthProvider &&
        creator.provider === 'SPOTIFY' &&
        (!creator.description || !creator.handle)
      ) {
        // Fire-and-forget: don't block the response
        (async () => {
          try {
            const spotifyClient = await getSpotifyClientForConnection(
              connection!,
              ctx.env as Parameters<typeof getSpotifyClientForConnection>[1]
            );
            const showDetails = await getShow(spotifyClient, creator.providerCreatorId);
            if (showDetails) {
              const updates: Record<string, unknown> = { updatedAt: Date.now() };
              if (!creator.description && showDetails.description) {
                updates.description = showDetails.description;
              }
              if (!creator.handle && showDetails.publisher) {
                updates.handle = showDetails.publisher;
              }
              if (!creator.imageUrl && showDetails.images?.[0]?.url) {
                updates.imageUrl = showDetails.images[0].url;
              }
              if (!creator.externalUrl && showDetails.externalUrl) {
                updates.externalUrl = showDetails.externalUrl;
              }
              if (Object.keys(updates).length > 1) {
                await ctx.db.update(creators).set(updates).where(eq(creators.id, creator.id));
              }
            }
          } catch {
            // Silently ignore enrichment errors - non-critical
          }
        })();
      }

      // 5. Check cache first
      const cacheKey = `${LATEST_CONTENT_CACHE_CONFIG.KEY_PREFIX}${creatorId}`;
      const cached = await ctx.env.CREATOR_CONTENT_CACHE.get<CachedLatestContent>(cacheKey, 'json');

      let contentItems: Omit<LatestContentItem, 'isBookmarked' | 'itemId'>[];
      let cacheStatus: LatestContentCacheStatus | undefined;

      if (cached) {
        // Use cached items
        contentItems = cached.items;
        cacheStatus = 'HIT';
      } else {
        // 6. Fetch from provider/source.
        try {
          if (isOAuthProvider) {
            contentItems = await fetchFromProvider(
              creator.provider,
              creator.providerCreatorId,
              connection!,
              ctx.env
            );
          } else {
            contentItems = await fetchRssPreviewContent({
              db: ctx.db,
              userId: ctx.userId,
              creator,
            });
          }
          cacheStatus = 'MISS';

          // 7. Cache the result
          await ctx.env.CREATOR_CONTENT_CACHE.put(
            cacheKey,
            JSON.stringify({
              items: contentItems,
              fetchedAt: Date.now(),
            } satisfies CachedLatestContent),
            { expirationTtl: LATEST_CONTENT_CACHE_CONFIG.TTL_SECONDS }
          );
        } catch (error) {
          if (isOAuthProvider) {
            // Handle token refresh failures
            if (error instanceof TokenRefreshError && error.code === 'REFRESH_FAILED_PERMANENT') {
              return {
                items: [],
                provider: creator.provider,
                reason: 'TOKEN_EXPIRED',
                connectUrl: getConnectUrl(creator.provider),
              };
            }

            // Handle rate limiting (usually 429 status)
            if (error instanceof Error && error.message.includes('429')) {
              return {
                items: [],
                provider: creator.provider,
                reason: 'RATE_LIMITED',
              };
            }

            // Re-throw other OAuth provider errors
            throw error;
          }

          // RSS/source previews fail gracefully to empty list.
          contentItems = [];
          cacheStatus = 'MISS';
        }
      }

      // 8. Look up which items are bookmarked by this user
      const itemsWithBookmarkStatus = await populateIsBookmarked(
        contentItems,
        creator.provider,
        ctx.userId,
        ctx.db
      );

      return {
        items: itemsWithBookmarkStatus,
        provider: creator.provider,
        cacheStatus,
      };
    }),

  /**
   * Resolve missing thumbnails for creator latest content entries.
   *
   * Intended for progressive/lazy image enhancement on the creator page:
   * the UI can render fast with existing feed/provider metadata, then request
   * thumbnails for visible entries in follow-up batches.
   *
   * @param creatorId - Creator context (for authorization and analytics scope)
   * @param urls - Canonical content URLs missing thumbnails
   * @returns URL -> thumbnail mappings (nullable when not found)
   */
  resolveLatestContentThumbnails: protectedProcedure
    .input(ResolveLatestContentThumbnailsInputSchema)
    .mutation(async ({ ctx, input }) => {
      const creator = await ctx.db.query.creators.findFirst({
        where: eq(creators.id, input.creatorId),
      });

      if (!creator) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Creator not found',
        });
      }

      const urls = Array.from(new Set(input.urls.filter((url) => isHttpUrl(url))));
      if (urls.length === 0) {
        return {
          items: [] as Array<{ url: string; thumbnailUrl: string | null }>,
        };
      }

      const limit = pLimit(THUMBNAIL_ENRICHMENT_CONCURRENCY);
      const items = await Promise.all(
        urls.map((url) => limit(() => resolveLatestContentThumbnail(ctx.env, url)))
      );

      return {
        items,
      };
    }),

  /**
   * Ensure a latest-content item has a corresponding user item.
   *
   * Creator latest-content rows can include provider items the user has not
   * interacted with yet. This mutation materializes the canonical item and the
   * user item in INBOX state when needed, then returns a user item ID that can
   * be used to open the in-app item detail screen.
   */
  ensureLatestContentItem: protectedProcedure
    .input(EnsureLatestContentItemInputSchema)
    .mutation(async ({ ctx, input }) => {
      const creator = await ctx.db.query.creators.findFirst({
        where: eq(creators.id, input.creatorId),
      });

      if (!creator) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Creator not found',
        });
      }

      if (!['YOUTUBE', 'SPOTIFY'].includes(creator.provider)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Provider not supported for latest content',
        });
      }

      const now = new Date().toISOString();
      const contentType = creator.provider === 'YOUTUBE' ? ContentType.VIDEO : ContentType.PODCAST;
      const publishedAtIso = input.publishedAt ? new Date(input.publishedAt).toISOString() : null;

      const existingItem = await ctx.db
        .select({
          id: items.id,
          summary: items.summary,
        })
        .from(items)
        .where(and(eq(items.provider, creator.provider), eq(items.providerId, input.providerId)))
        .limit(1);

      const itemId = existingItem[0]?.id ?? ulid();

      if (existingItem.length === 0) {
        await ctx.db.insert(items).values({
          id: itemId,
          contentType,
          provider: creator.provider,
          providerId: input.providerId,
          canonicalUrl: input.externalUrl,
          title: input.title,
          thumbnailUrl: input.thumbnailUrl,
          creatorId: creator.id,
          publisher: null,
          summary: input.description ?? null,
          duration: input.duration,
          publishedAt: publishedAtIso,
          rawMetadata: null,
          wordCount: null,
          readingTimeMinutes: null,
          articleContentKey: null,
          createdAt: now,
          updatedAt: now,
        });
      } else if (!existingItem[0].summary && input.description) {
        await ctx.db
          .update(items)
          .set({
            summary: input.description,
            updatedAt: now,
          })
          .where(eq(items.id, itemId));
      }

      const existingUserItem = await ctx.db
        .select({ id: userItems.id, state: userItems.state })
        .from(userItems)
        .where(and(eq(userItems.userId, ctx.userId), eq(userItems.itemId, itemId)))
        .limit(1);

      const userItemId = existingUserItem[0]?.id ?? ulid();

      if (existingUserItem.length === 0) {
        await ctx.db.insert(userItems).values({
          id: userItemId,
          userId: ctx.userId,
          itemId,
          state: UserItemState.INBOX,
          ingestedAt: now,
          bookmarkedAt: null,
          archivedAt: null,
          lastOpenedAt: null,
          progressPosition: null,
          progressDuration: null,
          progressUpdatedAt: null,
          isFinished: false,
          finishedAt: null,
          createdAt: now,
          updatedAt: now,
        });
      }

      return {
        userItemId,
        state: (existingUserItem[0]?.state as UserItemState | undefined) ?? UserItemState.INBOX,
      };
    }),

  /**
   * Check if user is subscribed to a creator
   *
   * Returns the subscription status for a creator. This checks
   * both provider-level subscriptions (e.g., YouTube channel subscription)
   * and app-level following.
   *
   * Use cases:
   * 1. Subscribed + Connected: User can view and manage subscription
   * 2. Not Subscribed + Connected: User can subscribe
   * 3. Not Subscribed + Not Connected: Prompt to connect provider
   * 4. Unsupported Provider: No subscription functionality
   *
   * @param creatorId - The unique identifier of the creator
   * @returns Subscription status information
   */
  checkSubscription: protectedProcedure
    .input(CheckSubscriptionInputSchema)
    .query(async ({ ctx, input }): Promise<CheckSubscriptionResponse> => {
      // 1. Get the creator
      const creator = await ctx.db.query.creators.findFirst({
        where: eq(creators.id, input.creatorId),
      });

      if (!creator) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Creator not found',
        });
      }

      // 2. Only supported providers expose creator-level subscriptions
      if (!['YOUTUBE', 'SPOTIFY', 'GMAIL'].includes(creator.provider)) {
        return {
          isSubscribed: false,
          canSubscribe: false,
          reason: 'PROVIDER_NOT_SUPPORTED',
        };
      }

      // 3. Check if user is connected to the provider
      const connection = await ctx.db.query.providerConnections.findFirst({
        where: and(
          eq(providerConnections.userId, ctx.userId),
          eq(providerConnections.provider, creator.provider),
          eq(providerConnections.status, 'ACTIVE')
        ),
      });

      if (!connection) {
        return {
          isSubscribed: false,
          canSubscribe: false,
          reason: 'NOT_CONNECTED',
        };
      }

      // 4. GMAIL subscriptions map to newsletter feed status by canonical key.
      if (creator.provider === 'GMAIL') {
        const newsletterFeed = await ctx.db.query.newsletterFeeds.findFirst({
          where: and(
            eq(newsletterFeeds.userId, ctx.userId),
            eq(newsletterFeeds.canonicalKey, creator.providerCreatorId)
          ),
        });

        if (!newsletterFeed) {
          return {
            isSubscribed: false,
            canSubscribe: false,
            reason: 'SOURCE_NOT_FOUND',
          };
        }

        return {
          isSubscribed: newsletterFeed.status === 'ACTIVE',
          subscriptionId: newsletterFeed.id,
          canSubscribe: true,
        };
      }

      // 5. YOUTUBE / SPOTIFY subscriptions use subscriptions table.
      const subscription = await ctx.db.query.subscriptions.findFirst({
        where: and(
          eq(subscriptions.userId, ctx.userId),
          eq(subscriptions.provider, creator.provider),
          eq(subscriptions.providerChannelId, creator.providerCreatorId)
        ),
      });

      return {
        isSubscribed: !!subscription && subscription.status === 'ACTIVE',
        subscriptionId: subscription?.id,
        canSubscribe: true,
      };
    }),

  /**
   * Subscribe to a creator
   *
   * Creates a subscription to a creator's content. This is idempotent -
   * if a subscription already exists, it returns the existing subscription.
   *
   * Requirements:
   * - Creator must exist
   * - Provider must support subscriptions (YOUTUBE or SPOTIFY)
   * - User must have an active connection to the provider
   *
   * @param creatorId - The unique identifier of the creator
   * @returns Subscription object
   * @throws NOT_FOUND if creator doesn't exist
   * @throws BAD_REQUEST if provider doesn't support subscriptions
   * @throws PRECONDITION_FAILED if user isn't connected to the provider
   */
  subscribe: protectedProcedure
    .input(SubscribeInputSchema)
    .mutation(async ({ ctx, input }): Promise<SubscribeResponse> => {
      // 1. Get the creator
      const creator = await ctx.db.query.creators.findFirst({
        where: eq(creators.id, input.creatorId),
      });

      if (!creator) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Creator not found',
        });
      }

      // 2. Only supported providers expose creator-level subscriptions.
      if (!['YOUTUBE', 'SPOTIFY', 'GMAIL'].includes(creator.provider)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Subscriptions not supported for this provider',
        });
      }

      // 3. Check if user is connected to the provider
      const connection = await ctx.db.query.providerConnections.findFirst({
        where: and(
          eq(providerConnections.userId, ctx.userId),
          eq(providerConnections.provider, creator.provider),
          eq(providerConnections.status, 'ACTIVE')
        ),
      });

      if (!connection) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Please connect your account first',
        });
      }

      // 4. GMAIL subscriptions map to newsletter feed status by canonical key.
      if (creator.provider === 'GMAIL') {
        const feed = await ctx.db.query.newsletterFeeds.findFirst({
          where: and(
            eq(newsletterFeeds.userId, ctx.userId),
            eq(newsletterFeeds.canonicalKey, creator.providerCreatorId)
          ),
        });

        if (!feed) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Newsletter source not found for this creator',
          });
        }

        if (feed.status !== 'ACTIVE') {
          await ctx.db
            .update(newsletterFeeds)
            .set({
              status: 'ACTIVE',
              updatedAt: Date.now(),
            })
            .where(eq(newsletterFeeds.id, feed.id));

          // Best-effort: seed latest issue when enabling a previously inactive feed.
          try {
            await seedLatestNewsletterItemForFeed({
              db: ctx.db,
              userId: ctx.userId,
              feedId: feed.id,
              env: ctx.env as TokenRefreshEnv,
            });
          } catch {
            // Do not fail subscription activation when seed fails.
          }
        }

        return {
          id: feed.id,
          provider: creator.provider,
          name: creator.name,
          imageUrl: creator.imageUrl ?? null,
          enabled: true,
        };
      }

      // 5. Check if subscription already exists (idempotent)
      const existing = await ctx.db.query.subscriptions.findFirst({
        where: and(
          eq(subscriptions.userId, ctx.userId),
          eq(subscriptions.provider, creator.provider),
          eq(subscriptions.providerChannelId, creator.providerCreatorId)
        ),
      });

      if (existing) {
        // Return creator data from normalized table
        return {
          id: existing.id,
          provider: existing.provider,
          name: creator.name,
          imageUrl: creator.imageUrl ?? null,
          enabled: existing.status === 'ACTIVE',
        };
      }

      // 6. Create new subscription with creatorId (normalized)
      const now = Date.now();
      const subscriptionId = ulid();

      await ctx.db.insert(subscriptions).values({
        id: subscriptionId,
        userId: ctx.userId,
        provider: creator.provider,
        providerChannelId: creator.providerCreatorId,
        creatorId: creator.id,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      });

      return {
        id: subscriptionId,
        provider: creator.provider,
        name: creator.name,
        imageUrl: creator.imageUrl ?? null,
        enabled: true,
      };
    }),
});

export type CreatorsRouter = typeof creatorsRouter;

// ============================================================================
// Helper Types
// ============================================================================

/**
 * Cached latest content structure
 */
interface CachedLatestContent {
  items: Omit<LatestContentItem, 'isBookmarked' | 'itemId'>[];
  fetchedAt: number;
}

/**
 * Environment type for provider fetch operations
 * Uses Bindings from types.ts - env vars are validated at runtime
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
type ProviderFetchEnv = import('../../types').Bindings;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the OAuth connect URL for a provider
 */
function getConnectUrl(provider: string): string {
  // These URLs should match the app's OAuth flow
  // For now, return relative paths that the mobile app can handle
  switch (provider) {
    case 'YOUTUBE':
      return '/connect/youtube';
    case 'SPOTIFY':
      return '/connect/spotify';
    default:
      return '/connect';
  }
}

/**
 * Fetch latest content from a provider
 *
 * @param provider - Provider type (YOUTUBE or SPOTIFY)
 * @param providerCreatorId - Provider-specific creator ID
 * @param connection - OAuth connection with tokens
 * @param env - Environment bindings
 * @returns Array of content items without isBookmarked flag
 */
async function fetchFromProvider(
  provider: string,
  providerCreatorId: string,
  connection: ProviderConnection,
  env: ProviderFetchEnv
): Promise<Omit<LatestContentItem, 'isBookmarked' | 'itemId'>[]> {
  if (provider === 'YOUTUBE') {
    return fetchYouTubeContent(providerCreatorId, connection, env);
  } else if (provider === 'SPOTIFY') {
    return fetchSpotifyContent(providerCreatorId, connection, env);
  }

  return [];
}

/**
 * Fetch latest YouTube videos for a channel
 *
 * @param channelId - YouTube channel ID (starts with UC)
 * @param connection - OAuth connection
 * @param env - Environment bindings
 * @returns Array of video content items
 */
async function fetchYouTubeContent(
  channelId: string,
  connection: ProviderConnection,
  env: ProviderFetchEnv
): Promise<Omit<LatestContentItem, 'isBookmarked' | 'itemId'>[]> {
  const client = await getYouTubeClientForConnection(
    connection,
    env as Parameters<typeof getYouTubeClientForConnection>[1]
  );

  // Get the uploads playlist ID (deterministic, no API call)
  const uploadsPlaylistId = getUploadsPlaylistId(channelId);

  // Fetch recent videos
  const videos = await fetchRecentVideos(
    client,
    uploadsPlaylistId,
    LATEST_CONTENT_CACHE_CONFIG.MAX_OAUTH_ITEMS + 5 // Fetch extra to account for Shorts filtering
  );

  if (videos.length === 0) {
    return [];
  }

  // Fetch video details (duration + full description)
  const videoIds = videos.map((v) => v.contentDetails?.videoId).filter((id): id is string => !!id);

  const videoDetails = await fetchVideoDetails(client, videoIds);

  // Transform and filter (exclude Shorts)
  const now = Date.now();
  const contentItems: Omit<LatestContentItem, 'isBookmarked' | 'itemId'>[] = [];

  for (const video of videos) {
    if (contentItems.length >= LATEST_CONTENT_CACHE_CONFIG.MAX_OAUTH_ITEMS) {
      break;
    }

    const info = extractVideoInfo(video);
    if (!info.videoId) continue;

    // Check if it's a Short based on duration
    const details = videoDetails.get(info.videoId);
    const duration = details?.durationSeconds;

    // Skip Shorts (duration is defined and <= threshold)
    if (duration !== undefined && duration <= YOUTUBE_SHORTS_MAX_DURATION_SECONDS) {
      continue;
    }

    // Check publish date - skip scheduled content
    const publishedAt = info.publishedAt ? new Date(info.publishedAt).getTime() : 0;
    if (publishedAt > now) {
      continue;
    }

    contentItems.push({
      id: info.videoId,
      title: info.title,
      description: details?.description ?? info.description,
      thumbnailUrl: info.thumbnailUrl,
      publishedAt: publishedAt,
      externalUrl: `https://www.youtube.com/watch?v=${info.videoId}`,
      duration: duration ?? null,
    });
  }

  return contentItems;
}

/**
 * Fetch latest Spotify episodes for a show
 *
 * @param showId - Spotify show ID
 * @param connection - OAuth connection
 * @param env - Environment bindings
 * @returns Array of episode content items
 */
async function fetchSpotifyContent(
  showId: string,
  connection: ProviderConnection,
  env: ProviderFetchEnv
): Promise<Omit<LatestContentItem, 'isBookmarked' | 'itemId'>[]> {
  const client = await getSpotifyClientForConnection(
    connection,
    env as Parameters<typeof getSpotifyClientForConnection>[1]
  );

  // Fetch recent episodes
  const episodes = await getShowEpisodes(
    client,
    showId,
    LATEST_CONTENT_CACHE_CONFIG.MAX_OAUTH_ITEMS
  );

  // Transform to content items
  const now = Date.now();

  return episodes
    .filter((episode) => {
      // Filter out scheduled episodes
      const releaseDate = parseSpotifyDate(episode.releaseDate);
      return releaseDate <= now;
    })
    .map((episode) => ({
      id: episode.id,
      title: episode.name,
      description: episode.description,
      thumbnailUrl: episode.images[0]?.url ?? null,
      publishedAt: parseSpotifyDate(episode.releaseDate),
      externalUrl: episode.externalUrl,
      duration: Math.round(episode.durationMs / 1000),
    }));
}

/**
 * Parse Spotify date string to Unix milliseconds
 *
 * Spotify dates can be in various formats:
 * - YYYY-MM-DD (full date)
 * - YYYY-MM (month precision)
 * - YYYY (year precision)
 */
function parseSpotifyDate(dateStr: string): number {
  // Handle YYYY-MM-DD, YYYY-MM, or YYYY formats
  if (dateStr.length === 4) {
    // YYYY -> January 1st
    return new Date(`${dateStr}-01-01`).getTime();
  } else if (dateStr.length === 7) {
    // YYYY-MM -> 1st of month
    return new Date(`${dateStr}-01`).getTime();
  }
  // YYYY-MM-DD
  return new Date(dateStr).getTime();
}

/**
 * Populate bookmark status and user item id for content items.
 *
 * We resolve the user's associated user item whenever it exists, regardless of
 * current state, so creator pages can route taps into the in-app content view.
 * The isBookmarked flag specifically tracks whether the saved state is BOOKMARKED.
 *
 * @param contentItems - Array of content items without isBookmarked
 * @param provider - Provider type
 * @param userId - User ID to check bookmarks for
 * @param db - Database instance
 * @returns Array of content items with isBookmarked populated
 */
async function populateIsBookmarked(
  contentItems: Omit<LatestContentItem, 'isBookmarked' | 'itemId'>[],
  provider: string,
  userId: string,
  db: Database
): Promise<LatestContentItem[]> {
  if (contentItems.length === 0) {
    return [];
  }

  // Get provider IDs from content items
  const providerIds = contentItems.map((item) => item.id);

  // Query items table to find which provider IDs exist as items
  // Then check if user has bookmarked them via userItems
  const itemMetadata = await db
    .select({
      providerId: items.providerId,
      itemId: items.id,
      userItemState: userItems.state,
    })
    .from(items)
    .leftJoin(userItems, and(eq(userItems.itemId, items.id), eq(userItems.userId, userId)))
    .where(and(eq(items.provider, provider), inArray(items.providerId, providerIds)));

  const metadataByProviderId = new Map(
    itemMetadata.map((item) => [
      item.providerId,
      {
        itemId: item.itemId,
        isBookmarked: item.userItemState === UserItemState.BOOKMARKED,
      },
    ])
  );

  // Fallback matching by canonical URL helps cross-provider previews
  // (e.g. WEB/SUBSTACK creator pages using RSS feed entries).
  const unresolvedCanonicalUrls = Array.from(
    new Set(
      contentItems
        .filter((item) => !metadataByProviderId.has(item.id))
        .map((item) => item.externalUrl)
        .filter((url): url is string => url.length > 0)
    )
  );

  const canonicalMetadataByUrl = new Map<
    string,
    {
      itemId: string;
      isBookmarked: boolean;
    }
  >();

  if (unresolvedCanonicalUrls.length > 0) {
    const metadataByCanonicalUrl = await db
      .select({
        canonicalUrl: items.canonicalUrl,
        itemId: items.id,
        userItemState: userItems.state,
      })
      .from(items)
      .leftJoin(userItems, and(eq(userItems.itemId, items.id), eq(userItems.userId, userId)))
      .where(inArray(items.canonicalUrl, unresolvedCanonicalUrls));

    for (const row of metadataByCanonicalUrl) {
      const existing = canonicalMetadataByUrl.get(row.canonicalUrl);
      const candidate = {
        itemId: row.itemId,
        isBookmarked: row.userItemState === UserItemState.BOOKMARKED,
      };

      // Prefer bookmarked rows when multiple canonical matches exist.
      if (!existing || (!existing.isBookmarked && candidate.isBookmarked)) {
        canonicalMetadataByUrl.set(row.canonicalUrl, candidate);
      }
    }
  }

  // Add isBookmarked + itemId to each content item
  return contentItems.map((item) => {
    const metadata =
      metadataByProviderId.get(item.id) ?? canonicalMetadataByUrl.get(item.externalUrl);
    return {
      ...item,
      itemId: metadata?.itemId ?? null,
      isBookmarked: metadata?.isBookmarked ?? false,
    };
  });
}

type CreatorRecord = typeof creators.$inferSelect;

function isHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

async function resolveCreatorSourceUrl(
  db: Database,
  userId: string,
  creator: CreatorRecord
): Promise<string | null> {
  if (isHttpUrl(creator.externalUrl)) {
    return creator.externalUrl;
  }

  if (isHttpUrl(creator.providerCreatorId)) {
    return creator.providerCreatorId;
  }

  const latestCreatorItem = await db
    .select({
      canonicalUrl: items.canonicalUrl,
    })
    .from(items)
    .innerJoin(userItems, and(eq(userItems.itemId, items.id), eq(userItems.userId, userId)))
    .where(eq(items.creatorId, creator.id))
    .orderBy(desc(userItems.ingestedAt))
    .limit(1);

  const canonicalUrl = latestCreatorItem[0]?.canonicalUrl;
  if (isHttpUrl(canonicalUrl)) {
    return canonicalUrl;
  }

  return null;
}

async function fetchAndParseRssFeed(feedUrl: string) {
  const response = await fetch(feedUrl, {
    method: 'GET',
    headers: {
      Accept: RSS_PREVIEW_ACCEPT_HEADER,
      'User-Agent': 'ZineCreatorPreviewBot/1.0 (+https://myzine.app)',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(RSS_PREVIEW_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Feed request failed (${response.status})`);
  }

  const payload = await response.arrayBuffer();
  if (payload.byteLength > RSS_PREVIEW_MAX_FEED_BYTES) {
    throw new Error(`Feed payload too large (${payload.byteLength} bytes)`);
  }

  const xml = new TextDecoder().decode(payload);
  return parseRssFeedXml(xml, feedUrl);
}

async function fetchRssPreviewContent(params: {
  db: Database;
  userId: string;
  creator: CreatorRecord;
}): Promise<Omit<LatestContentItem, 'isBookmarked' | 'itemId'>[]> {
  const sourceUrl = await resolveCreatorSourceUrl(params.db, params.userId, params.creator);
  if (!sourceUrl) {
    return [];
  }

  const discovery = await discoverFeedsForUrl(params.db, sourceUrl);
  const candidateFeed = discovery.candidates[0]?.feedUrl;
  if (!candidateFeed) {
    return [];
  }

  const parsedFeed = await fetchAndParseRssFeed(candidateFeed);
  const sortedEntries = [...parsedFeed.entries]
    .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
    .slice(0, LATEST_CONTENT_CACHE_CONFIG.MAX_RSS_ITEMS);

  return sortedEntries.map((entry) => ({
    id: entry.providerId,
    title: entry.title,
    description: entry.summary ?? null,
    thumbnailUrl: entry.imageUrl ?? null,
    publishedAt: entry.publishedAt ?? 0,
    externalUrl: entry.canonicalUrl,
    duration: null,
  }));
}

interface CachedResolvedThumbnail {
  thumbnailUrl: string | null;
  checkedAt: number;
}

function getThumbnailCacheKey(url: string): string {
  return `${THUMBNAIL_ENRICHMENT_CACHE_PREFIX}${hashString(url)}`;
}

async function resolveLatestContentThumbnail(
  env: ProviderFetchEnv,
  url: string
): Promise<{ url: string; thumbnailUrl: string | null }> {
  const cacheKey = getThumbnailCacheKey(url);
  const cached = await env.CREATOR_CONTENT_CACHE.get<CachedResolvedThumbnail>(cacheKey, 'json');

  if (cached) {
    return {
      url,
      thumbnailUrl: cached.thumbnailUrl ?? null,
    };
  }

  let thumbnailUrl: string | null = null;

  try {
    const preview = await fetchLinkPreview(url);
    thumbnailUrl = preview?.thumbnailUrl ?? null;
  } catch {
    thumbnailUrl = null;
  }

  const cacheValue: CachedResolvedThumbnail = {
    thumbnailUrl,
    checkedAt: Date.now(),
  };

  await env.CREATOR_CONTENT_CACHE.put(cacheKey, JSON.stringify(cacheValue), {
    expirationTtl: THUMBNAIL_ENRICHMENT_CACHE_TTL_SECONDS,
  });

  return {
    url,
    thumbnailUrl,
  };
}
