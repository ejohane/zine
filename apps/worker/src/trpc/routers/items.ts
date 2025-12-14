// apps/worker/src/trpc/routers/items.ts
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { ContentType, Provider, UserItemState } from '@zine/shared';

// ============================================================================
// Types
// ============================================================================

/**
 * Combined view of Item + UserItem for API responses.
 * This flattens the joined data for easier consumption by the mobile client.
 */
type ItemView = {
  // Identifiers
  id: string; // UserItem ID (for mutations)
  itemId: string; // Canonical Item ID

  // Display
  title: string;
  thumbnailUrl: string | null;
  canonicalUrl: string;

  // Classification
  contentType: ContentType;
  provider: Provider;

  // Attribution
  creator: string;
  publisher: string | null;

  // Metadata
  summary: string | null;
  duration: number | null; // seconds
  publishedAt: string | null;

  // User state
  state: UserItemState;
  ingestedAt: string;
  bookmarkedAt: string | null;

  // Progress (for "Jump Back In")
  progress: {
    position: number;
    duration: number;
    percent: number;
  } | null;
};

// ============================================================================
// Mock Data
// ============================================================================

/**
 * Mock items for development.
 * TODO: Replace with D1 queries when database is ready.
 */
const MOCK_ITEMS: ItemView[] = [
  {
    id: 'ui-001',
    itemId: 'item-001',
    title: 'How to Build a Second Brain',
    thumbnailUrl: 'https://picsum.photos/seed/item1/400/225',
    canonicalUrl: 'https://youtube.com/watch?v=abc123',
    contentType: ContentType.VIDEO,
    provider: Provider.YOUTUBE,
    creator: 'Tiago Forte',
    publisher: null,
    summary: 'A comprehensive guide to building a personal knowledge management system.',
    duration: 3720, // 1h 2m
    publishedAt: '2024-01-15T10:00:00Z',
    state: UserItemState.INBOX,
    ingestedAt: '2024-12-10T08:30:00Z',
    bookmarkedAt: null,
    progress: null,
  },
  {
    id: 'ui-002',
    itemId: 'item-002',
    title: 'The Tim Ferriss Show: Naval Ravikant',
    thumbnailUrl: 'https://picsum.photos/seed/item2/400/225',
    canonicalUrl: 'https://open.spotify.com/episode/xyz789',
    contentType: ContentType.PODCAST,
    provider: Provider.SPOTIFY,
    creator: 'Tim Ferriss',
    publisher: 'The Tim Ferriss Show',
    summary: 'Naval shares his mental models for wealth and happiness.',
    duration: 7200, // 2h
    publishedAt: '2024-01-10T06:00:00Z',
    state: UserItemState.BOOKMARKED,
    ingestedAt: '2024-12-08T14:00:00Z',
    bookmarkedAt: '2024-12-09T09:15:00Z',
    progress: {
      position: 2400,
      duration: 7200,
      percent: 33,
    },
  },
  {
    id: 'ui-003',
    itemId: 'item-003',
    title: 'Local-First Software: You Own Your Data',
    thumbnailUrl: 'https://picsum.photos/seed/item3/400/225',
    canonicalUrl: 'https://inkandswitch.com/local-first',
    contentType: ContentType.ARTICLE,
    provider: Provider.RSS,
    creator: 'Martin Kleppmann',
    publisher: 'Ink & Switch',
    summary: 'An exploration of the local-first software movement and data ownership.',
    duration: null,
    publishedAt: '2024-01-05T12:00:00Z',
    state: UserItemState.BOOKMARKED,
    ingestedAt: '2024-12-05T10:00:00Z',
    bookmarkedAt: '2024-12-06T11:30:00Z',
    progress: null,
  },
  {
    id: 'ui-004',
    itemId: 'item-004',
    title: 'Building Offline-First Apps with Replicache',
    thumbnailUrl: 'https://picsum.photos/seed/item4/400/225',
    canonicalUrl: 'https://youtube.com/watch?v=def456',
    contentType: ContentType.VIDEO,
    provider: Provider.YOUTUBE,
    creator: 'Aaron Boodman',
    publisher: 'Rocicorp',
    summary: 'Deep dive into building responsive offline-first applications.',
    duration: 2700, // 45m
    publishedAt: '2024-01-08T14:00:00Z',
    state: UserItemState.INBOX,
    ingestedAt: '2024-12-09T16:00:00Z',
    bookmarkedAt: null,
    progress: null,
  },
  {
    id: 'ui-005',
    itemId: 'item-005',
    title: 'The Knowledge Project: James Clear',
    thumbnailUrl: 'https://picsum.photos/seed/item5/400/225',
    canonicalUrl: 'https://open.spotify.com/episode/ghi789',
    contentType: ContentType.PODCAST,
    provider: Provider.SPOTIFY,
    creator: 'Shane Parrish',
    publisher: 'Farnam Street',
    summary: 'James Clear discusses atomic habits and building better systems.',
    duration: 5400, // 1h 30m
    publishedAt: '2024-01-12T08:00:00Z',
    state: UserItemState.BOOKMARKED,
    ingestedAt: '2024-12-07T09:00:00Z',
    bookmarkedAt: '2024-12-08T10:00:00Z',
    progress: {
      position: 1800,
      duration: 5400,
      percent: 33,
    },
  },
  {
    id: 'ui-006',
    itemId: 'item-006',
    title: 'Why SQLite Is Perfect for the Edge',
    thumbnailUrl: 'https://picsum.photos/seed/item6/400/225',
    canonicalUrl: 'https://blog.cloudflare.com/sqlite-edge',
    contentType: ContentType.ARTICLE,
    provider: Provider.RSS,
    creator: 'Cloudflare Team',
    publisher: 'Cloudflare Blog',
    summary: 'How SQLite became the database of choice for edge computing.',
    duration: null,
    publishedAt: '2024-01-03T16:00:00Z',
    state: UserItemState.INBOX,
    ingestedAt: '2024-12-04T08:00:00Z',
    bookmarkedAt: null,
    progress: null,
  },
  {
    id: 'ui-007',
    itemId: 'item-007',
    title: 'React Native Performance Tips',
    thumbnailUrl: 'https://picsum.photos/seed/item7/400/225',
    canonicalUrl: 'https://youtube.com/watch?v=jkl012',
    contentType: ContentType.VIDEO,
    provider: Provider.YOUTUBE,
    creator: 'William Candillon',
    publisher: 'Can It Be Done in React Native',
    summary: 'Advanced optimization techniques for React Native apps.',
    duration: 1800, // 30m
    publishedAt: '2024-01-14T10:00:00Z',
    state: UserItemState.BOOKMARKED,
    ingestedAt: '2024-12-11T12:00:00Z',
    bookmarkedAt: '2024-12-12T09:00:00Z',
    progress: {
      position: 600,
      duration: 1800,
      percent: 33,
    },
  },
  {
    id: 'ui-008',
    itemId: 'item-008',
    title: 'The Art of Doing Science and Engineering',
    thumbnailUrl: 'https://picsum.photos/seed/item8/400/225',
    canonicalUrl: 'https://example.substack.com/p/hamming-notes',
    contentType: ContentType.ARTICLE,
    provider: Provider.SUBSTACK,
    creator: 'Richard Hamming',
    publisher: 'Tech Classics',
    summary: "Notes and reflections on Hamming's famous lecture series.",
    duration: null,
    publishedAt: '2024-01-02T09:00:00Z',
    state: UserItemState.ARCHIVED,
    ingestedAt: '2024-12-01T10:00:00Z',
    bookmarkedAt: '2024-12-02T11:00:00Z',
    progress: null,
  },
];

// ============================================================================
// Mock Data Helpers
// ============================================================================

function getMockInboxItems(): ItemView[] {
  return MOCK_ITEMS.filter((item) => item.state === UserItemState.INBOX).sort((a, b) =>
    b.ingestedAt.localeCompare(a.ingestedAt)
  );
}

function getMockLibraryItems(): ItemView[] {
  return MOCK_ITEMS.filter((item) => item.state === UserItemState.BOOKMARKED).sort((a, b) =>
    (b.bookmarkedAt ?? '').localeCompare(a.bookmarkedAt ?? '')
  );
}

function getMockHomeData() {
  const bookmarked = getMockLibraryItems();
  return {
    recentBookmarks: bookmarked.slice(0, 5),
    jumpBackIn: bookmarked.filter((item) => item.progress !== null).slice(0, 5),
    byContentType: {
      videos: bookmarked.filter((item) => item.contentType === ContentType.VIDEO).slice(0, 5),
      podcasts: bookmarked.filter((item) => item.contentType === ContentType.PODCAST).slice(0, 5),
      articles: bookmarked.filter((item) => item.contentType === ContentType.ARTICLE).slice(0, 5),
    },
  };
}

// ============================================================================
// Zod Schemas
// ============================================================================

// Use UPPERCASE enum values to match @zine/shared enums
const ProviderSchema = z.enum(['YOUTUBE', 'SPOTIFY', 'SUBSTACK', 'RSS']);
const ContentTypeSchema = z.enum(['VIDEO', 'PODCAST', 'ARTICLE', 'POST']);

const FilterSchema = z
  .object({
    provider: ProviderSchema.optional(),
    contentType: ContentTypeSchema.optional(),
  })
  .optional();

const PaginationSchema = z.object({
  filter: FilterSchema,
  cursor: z.string().optional(),
  limit: z.number().min(1).max(50).default(20),
});

// ============================================================================
// Router
// ============================================================================

export const itemsRouter = router({
  /**
   * Get items in the triage queue (INBOX state).
   * Supports filtering by provider and content type.
   */
  inbox: protectedProcedure.input(PaginationSchema.optional()).query(({ input }) => {
    // TODO: Replace with D1 query
    let items = getMockInboxItems();

    if (input?.filter?.provider) {
      items = items.filter((item) => item.provider === input.filter!.provider);
    }
    if (input?.filter?.contentType) {
      items = items.filter((item) => item.contentType === input.filter!.contentType);
    }

    // TODO: Implement cursor-based pagination
    const limit = input?.limit ?? 20;
    const paginatedItems = items.slice(0, limit);

    return {
      items: paginatedItems,
      nextCursor: paginatedItems.length === limit ? 'mock-cursor' : undefined,
    };
  }),

  /**
   * Get bookmarked items (BOOKMARKED state).
   * Supports filtering by provider and content type.
   */
  library: protectedProcedure.input(PaginationSchema.optional()).query(({ input }) => {
    // TODO: Replace with D1 query
    let items = getMockLibraryItems();

    if (input?.filter?.provider) {
      items = items.filter((item) => item.provider === input.filter!.provider);
    }
    if (input?.filter?.contentType) {
      items = items.filter((item) => item.contentType === input.filter!.contentType);
    }

    // TODO: Implement cursor-based pagination
    const limit = input?.limit ?? 20;
    const paginatedItems = items.slice(0, limit);

    return {
      items: paginatedItems,
      nextCursor: paginatedItems.length === limit ? 'mock-cursor' : undefined,
    };
  }),

  /**
   * Get curated home sections.
   * Returns recent bookmarks, items with progress, and items by content type.
   */
  home: protectedProcedure.query(() => {
    // TODO: Replace with D1 query
    return getMockHomeData();
  }),

  /**
   * Get a single item by UserItem ID.
   */
  get: protectedProcedure.input(z.object({ id: z.string().min(1) })).query(({ input }) => {
    // TODO: Replace with D1 query
    const item = MOCK_ITEMS.find((item) => item.id === input.id);
    if (!item) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Item ${input.id} not found`,
      });
    }
    return item;
  }),

  /**
   * Move an item to BOOKMARKED state.
   */
  bookmark: protectedProcedure.input(z.object({ id: z.string().min(1) })).mutation(({ input }) => {
    // TODO: Implement with D1
    console.log(`[MOCK] Bookmarking item ${input.id}`);
    return { success: true as const };
  }),

  /**
   * Move an item to ARCHIVED state.
   */
  archive: protectedProcedure.input(z.object({ id: z.string().min(1) })).mutation(({ input }) => {
    // TODO: Implement with D1
    console.log(`[MOCK] Archiving item ${input.id}`);
    return { success: true as const };
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
    .mutation(({ input }) => {
      // TODO: Implement with D1
      console.log(`[MOCK] Updating progress for ${input.id}: ${input.position}/${input.duration}`);
      return { success: true as const };
    }),
});

export type ItemsRouter = typeof itemsRouter;
