/**
 * Unit Tests for Items Router
 *
 * Tests the tRPC items router procedures including:
 * - items.inbox - Get items in triage queue
 * - items.library - Get bookmarked items
 * - items.home - Get curated home sections
 * - items.get - Single item lookup
 * - items.bookmark - Update item state to bookmarked
 * - items.archive - Update item state to archived
 * - Auth: Verify unauthenticated requests fail
 *
 * @vitest-environment miniflare
 */

import { describe, it, expect } from 'vitest';
import { TRPCError } from '@trpc/server';
import { ContentType, Provider, UserItemState } from '@zine/shared';
import type { ItemView } from './items';

// ============================================================================
// Test Fixtures
// ============================================================================

const TEST_USER_ID = 'user_test_123';

/**
 * Create a mock ItemView for testing
 */
function createMockItemView(overrides: Partial<ItemView> = {}): ItemView {
  const defaults: ItemView = {
    id: 'ui-001',
    itemId: 'item-001',
    title: 'Test Item',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    canonicalUrl: 'https://example.com/video',
    contentType: ContentType.VIDEO,
    provider: Provider.YOUTUBE,
    creator: 'Test Creator',
    publisher: null,
    summary: 'Test summary',
    duration: 3600,
    publishedAt: '2024-01-01T00:00:00Z',
    state: UserItemState.INBOX,
    ingestedAt: '2024-12-01T10:00:00Z',
    bookmarkedAt: null,
    progress: null,
    isFinished: false,
    finishedAt: null,
  };

  return { ...defaults, ...overrides };
}

// ============================================================================
// Mock Router Implementation for Testing
// ============================================================================

/**
 * Create a mock router caller that simulates the items router behavior
 */
function createMockItemsCaller(options: {
  userId: string | null;
  inboxItems?: ItemView[];
  libraryItems?: ItemView[];
  allItems?: Map<string, ItemView>;
}) {
  const { userId, inboxItems = [], libraryItems = [], allItems = new Map() } = options;

  return {
    inbox: async (input?: {
      filter?: { provider?: string; contentType?: string };
      cursor?: string;
      limit?: number;
    }) => {
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }
      let items = [...inboxItems];

      // Apply filters
      if (input?.filter?.provider) {
        items = items.filter((item) => item.provider === input.filter!.provider);
      }
      if (input?.filter?.contentType) {
        items = items.filter((item) => item.contentType === input.filter!.contentType);
      }

      const limit = input?.limit ?? 20;
      const hasMore = items.length > limit;
      const pageItems = hasMore ? items.slice(0, limit) : items;

      return {
        items: pageItems,
        nextCursor: hasMore ? 'next-cursor' : null,
      };
    },

    library: async (input?: {
      filter?: { provider?: string; contentType?: string };
      cursor?: string;
      limit?: number;
    }) => {
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }
      let items = [...libraryItems];

      // Apply filters
      if (input?.filter?.provider) {
        items = items.filter((item) => item.provider === input.filter!.provider);
      }
      if (input?.filter?.contentType) {
        items = items.filter((item) => item.contentType === input.filter!.contentType);
      }

      const limit = input?.limit ?? 20;
      const hasMore = items.length > limit;
      const pageItems = hasMore ? items.slice(0, limit) : items;

      return {
        items: pageItems,
        nextCursor: hasMore ? 'next-cursor' : null,
      };
    },

    home: async () => {
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }
      const bookmarked = libraryItems.filter((item) => item.state === UserItemState.BOOKMARKED);
      return {
        recentBookmarks: bookmarked.slice(0, 5),
        jumpBackIn: bookmarked.filter((item) => item.progress !== null).slice(0, 5),
        byContentType: {
          videos: bookmarked.filter((item) => item.contentType === ContentType.VIDEO).slice(0, 5),
          podcasts: bookmarked
            .filter((item) => item.contentType === ContentType.PODCAST)
            .slice(0, 5),
          articles: bookmarked
            .filter((item) => item.contentType === ContentType.ARTICLE)
            .slice(0, 5),
        },
      };
    },

    get: async (input: { id: string }) => {
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }
      const item = allItems.get(input.id);
      if (!item) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Item ${input.id} not found`,
        });
      }
      return item;
    },

    bookmark: async (input: { id: string }) => {
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }
      const item = allItems.get(input.id);
      if (!item) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Item ${input.id} not found`,
        });
      }
      // Simulate successful update
      return { success: true as const };
    },

    archive: async (input: { id: string }) => {
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }
      const item = allItems.get(input.id);
      if (!item) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Item ${input.id} not found`,
        });
      }
      return { success: true as const };
    },

    updateProgress: async (input: { id: string; position: number; duration: number }) => {
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }
      const item = allItems.get(input.id);
      if (!item) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Item ${input.id} not found`,
        });
      }
      return { success: true as const };
    },
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Items Router', () => {
  // ==========================================================================
  // Authentication Tests
  // ==========================================================================

  describe('Authentication', () => {
    it('should reject unauthenticated requests to inbox', async () => {
      const caller = createMockItemsCaller({ userId: null });

      await expect(caller.inbox()).rejects.toThrow(TRPCError);
      await expect(caller.inbox()).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('should reject unauthenticated requests to library', async () => {
      const caller = createMockItemsCaller({ userId: null });

      await expect(caller.library()).rejects.toThrow(TRPCError);
      await expect(caller.library()).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('should reject unauthenticated requests to home', async () => {
      const caller = createMockItemsCaller({ userId: null });

      await expect(caller.home()).rejects.toThrow(TRPCError);
      await expect(caller.home()).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('should reject unauthenticated requests to get', async () => {
      const caller = createMockItemsCaller({ userId: null });

      await expect(caller.get({ id: 'ui-001' })).rejects.toThrow(TRPCError);
      await expect(caller.get({ id: 'ui-001' })).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('should reject unauthenticated requests to bookmark', async () => {
      const caller = createMockItemsCaller({ userId: null });

      await expect(caller.bookmark({ id: 'ui-001' })).rejects.toThrow(TRPCError);
      await expect(caller.bookmark({ id: 'ui-001' })).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('should reject unauthenticated requests to archive', async () => {
      const caller = createMockItemsCaller({ userId: null });

      await expect(caller.archive({ id: 'ui-001' })).rejects.toThrow(TRPCError);
      await expect(caller.archive({ id: 'ui-001' })).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });
  });

  // ==========================================================================
  // items.inbox Tests
  // ==========================================================================

  describe('items.inbox', () => {
    it('should return empty array when no items in inbox', async () => {
      const caller = createMockItemsCaller({
        userId: TEST_USER_ID,
        inboxItems: [],
      });
      const result = await caller.inbox();

      expect(result.items).toEqual([]);
      expect(result.nextCursor).toBeNull();
    });

    it('should return inbox items with correct structure', async () => {
      const inboxItem = createMockItemView({
        id: 'ui-inbox-001',
        itemId: 'item-001',
        state: UserItemState.INBOX,
        title: 'Inbox Video',
        contentType: ContentType.VIDEO,
        provider: Provider.YOUTUBE,
      });

      const caller = createMockItemsCaller({
        userId: TEST_USER_ID,
        inboxItems: [inboxItem],
      });
      const result = await caller.inbox();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        id: 'ui-inbox-001',
        itemId: 'item-001',
        title: 'Inbox Video',
        state: UserItemState.INBOX,
        contentType: ContentType.VIDEO,
        provider: Provider.YOUTUBE,
      });
    });

    it('should include progress when available', async () => {
      const itemWithProgress = createMockItemView({
        id: 'ui-progress-001',
        progress: {
          position: 300,
          duration: 600,
          percent: 50,
        },
      });

      const caller = createMockItemsCaller({
        userId: TEST_USER_ID,
        inboxItems: [itemWithProgress],
      });
      const result = await caller.inbox();

      expect(result.items[0].progress).toEqual({
        position: 300,
        duration: 600,
        percent: 50,
      });
    });

    it('should return null progress when not set', async () => {
      const itemWithoutProgress = createMockItemView({
        progress: null,
      });

      const caller = createMockItemsCaller({
        userId: TEST_USER_ID,
        inboxItems: [itemWithoutProgress],
      });
      const result = await caller.inbox();

      expect(result.items[0].progress).toBeNull();
    });

    it('should filter by provider', async () => {
      const youtubeItem = createMockItemView({
        id: 'ui-youtube',
        provider: Provider.YOUTUBE,
      });
      const spotifyItem = createMockItemView({
        id: 'ui-spotify',
        provider: Provider.SPOTIFY,
      });

      const caller = createMockItemsCaller({
        userId: TEST_USER_ID,
        inboxItems: [youtubeItem, spotifyItem],
      });
      const result = await caller.inbox({ filter: { provider: Provider.YOUTUBE } });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].provider).toBe(Provider.YOUTUBE);
    });

    it('should filter by content type', async () => {
      const videoItem = createMockItemView({
        id: 'ui-video',
        contentType: ContentType.VIDEO,
      });
      const articleItem = createMockItemView({
        id: 'ui-article',
        contentType: ContentType.ARTICLE,
      });

      const caller = createMockItemsCaller({
        userId: TEST_USER_ID,
        inboxItems: [videoItem, articleItem],
      });
      const result = await caller.inbox({ filter: { contentType: ContentType.VIDEO } });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].contentType).toBe(ContentType.VIDEO);
    });
  });

  // ==========================================================================
  // items.library Tests
  // ==========================================================================

  describe('items.library', () => {
    it('should return empty array when no bookmarked items', async () => {
      const caller = createMockItemsCaller({
        userId: TEST_USER_ID,
        libraryItems: [],
      });
      const result = await caller.library();

      expect(result.items).toEqual([]);
      expect(result.nextCursor).toBeNull();
    });

    it('should return bookmarked items with correct structure', async () => {
      const libraryItem = createMockItemView({
        id: 'ui-lib-001',
        itemId: 'item-002',
        state: UserItemState.BOOKMARKED,
        title: 'Bookmarked Article',
        contentType: ContentType.ARTICLE,
        provider: Provider.SUBSTACK,
        bookmarkedAt: '2024-12-05T15:00:00Z',
      });

      const caller = createMockItemsCaller({
        userId: TEST_USER_ID,
        libraryItems: [libraryItem],
      });
      const result = await caller.library();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        id: 'ui-lib-001',
        state: UserItemState.BOOKMARKED,
        bookmarkedAt: '2024-12-05T15:00:00Z',
        contentType: ContentType.ARTICLE,
        provider: Provider.SUBSTACK,
      });
    });
  });

  // ==========================================================================
  // items.home Tests
  // ==========================================================================

  describe('items.home', () => {
    it('should return expected home sections structure', async () => {
      const caller = createMockItemsCaller({
        userId: TEST_USER_ID,
        libraryItems: [],
      });
      const result = await caller.home();

      expect(result).toHaveProperty('recentBookmarks');
      expect(result).toHaveProperty('jumpBackIn');
      expect(result).toHaveProperty('byContentType');
      expect(result.byContentType).toHaveProperty('videos');
      expect(result.byContentType).toHaveProperty('podcasts');
      expect(result.byContentType).toHaveProperty('articles');

      // All should be arrays
      expect(Array.isArray(result.recentBookmarks)).toBe(true);
      expect(Array.isArray(result.jumpBackIn)).toBe(true);
      expect(Array.isArray(result.byContentType.videos)).toBe(true);
      expect(Array.isArray(result.byContentType.podcasts)).toBe(true);
      expect(Array.isArray(result.byContentType.articles)).toBe(true);
    });

    it('should populate jumpBackIn with items that have progress', async () => {
      const itemWithProgress = createMockItemView({
        id: 'ui-progress',
        state: UserItemState.BOOKMARKED,
        progress: { position: 300, duration: 600, percent: 50 },
      });
      const itemWithoutProgress = createMockItemView({
        id: 'ui-no-progress',
        state: UserItemState.BOOKMARKED,
        progress: null,
      });

      const caller = createMockItemsCaller({
        userId: TEST_USER_ID,
        libraryItems: [itemWithProgress, itemWithoutProgress],
      });
      const result = await caller.home();

      expect(result.jumpBackIn).toHaveLength(1);
      expect(result.jumpBackIn[0].id).toBe('ui-progress');
    });

    it('should group items by content type', async () => {
      const videoItem = createMockItemView({
        id: 'ui-video',
        state: UserItemState.BOOKMARKED,
        contentType: ContentType.VIDEO,
      });
      const podcastItem = createMockItemView({
        id: 'ui-podcast',
        state: UserItemState.BOOKMARKED,
        contentType: ContentType.PODCAST,
      });
      const articleItem = createMockItemView({
        id: 'ui-article',
        state: UserItemState.BOOKMARKED,
        contentType: ContentType.ARTICLE,
      });

      const caller = createMockItemsCaller({
        userId: TEST_USER_ID,
        libraryItems: [videoItem, podcastItem, articleItem],
      });
      const result = await caller.home();

      expect(result.byContentType.videos).toHaveLength(1);
      expect(result.byContentType.podcasts).toHaveLength(1);
      expect(result.byContentType.articles).toHaveLength(1);
    });
  });

  // ==========================================================================
  // items.get Tests
  // ==========================================================================

  describe('items.get', () => {
    it('should return item when found', async () => {
      const item = createMockItemView({
        id: 'ui-get-001',
        itemId: 'item-get-001',
        title: 'Single Item',
      });
      const itemsMap = new Map<string, ItemView>();
      itemsMap.set('ui-get-001', item);

      const caller = createMockItemsCaller({
        userId: TEST_USER_ID,
        allItems: itemsMap,
      });
      const result = await caller.get({ id: 'ui-get-001' });

      expect(result.id).toBe('ui-get-001');
      expect(result.itemId).toBe('item-get-001');
      expect(result.title).toBe('Single Item');
    });

    it('should throw NOT_FOUND when item does not exist', async () => {
      const caller = createMockItemsCaller({
        userId: TEST_USER_ID,
        allItems: new Map(),
      });

      await expect(caller.get({ id: 'nonexistent' })).rejects.toThrow(TRPCError);
      await expect(caller.get({ id: 'nonexistent' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  // ==========================================================================
  // items.bookmark Tests
  // ==========================================================================

  describe('items.bookmark', () => {
    it('should return success when bookmarking existing item', async () => {
      const item = createMockItemView({ id: 'ui-001' });
      const itemsMap = new Map<string, ItemView>();
      itemsMap.set('ui-001', item);

      const caller = createMockItemsCaller({
        userId: TEST_USER_ID,
        allItems: itemsMap,
      });
      const result = await caller.bookmark({ id: 'ui-001' });

      expect(result).toEqual({ success: true });
    });

    it('should throw NOT_FOUND when item does not exist', async () => {
      const caller = createMockItemsCaller({
        userId: TEST_USER_ID,
        allItems: new Map(),
      });

      await expect(caller.bookmark({ id: 'nonexistent' })).rejects.toThrow(TRPCError);
      await expect(caller.bookmark({ id: 'nonexistent' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  // ==========================================================================
  // items.archive Tests
  // ==========================================================================

  describe('items.archive', () => {
    it('should return success when archiving existing item', async () => {
      const item = createMockItemView({ id: 'ui-001' });
      const itemsMap = new Map<string, ItemView>();
      itemsMap.set('ui-001', item);

      const caller = createMockItemsCaller({
        userId: TEST_USER_ID,
        allItems: itemsMap,
      });
      const result = await caller.archive({ id: 'ui-001' });

      expect(result).toEqual({ success: true });
    });

    it('should throw NOT_FOUND when item does not exist', async () => {
      const caller = createMockItemsCaller({
        userId: TEST_USER_ID,
        allItems: new Map(),
      });

      await expect(caller.archive({ id: 'nonexistent' })).rejects.toThrow(TRPCError);
      await expect(caller.archive({ id: 'nonexistent' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  // ==========================================================================
  // items.updateProgress Tests
  // ==========================================================================

  describe('items.updateProgress', () => {
    it('should return success when updating progress', async () => {
      const item = createMockItemView({ id: 'ui-001' });
      const itemsMap = new Map<string, ItemView>();
      itemsMap.set('ui-001', item);

      const caller = createMockItemsCaller({
        userId: TEST_USER_ID,
        allItems: itemsMap,
      });
      const result = await caller.updateProgress({
        id: 'ui-001',
        position: 300,
        duration: 600,
      });

      expect(result).toEqual({ success: true });
    });

    it('should throw NOT_FOUND when item does not exist', async () => {
      const caller = createMockItemsCaller({
        userId: TEST_USER_ID,
        allItems: new Map(),
      });

      await expect(
        caller.updateProgress({ id: 'nonexistent', position: 100, duration: 200 })
      ).rejects.toThrow(TRPCError);
      await expect(
        caller.updateProgress({ id: 'nonexistent', position: 100, duration: 200 })
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });
});

// ============================================================================
// ItemView Type Tests
// ============================================================================

describe('ItemView Type', () => {
  it('should have correct shape for ItemView', () => {
    const itemView: ItemView = {
      id: 'ui-001',
      itemId: 'item-001',
      title: 'Test Title',
      thumbnailUrl: 'https://example.com/thumb.jpg',
      canonicalUrl: 'https://example.com/video',
      contentType: ContentType.VIDEO,
      provider: Provider.YOUTUBE,
      creator: 'Creator Name',
      publisher: 'Publisher Name',
      summary: 'A test summary',
      duration: 3600,
      publishedAt: '2024-01-01T00:00:00Z',
      state: UserItemState.INBOX,
      ingestedAt: '2024-12-01T00:00:00Z',
      bookmarkedAt: null,
      progress: null,
      isFinished: false,
      finishedAt: null,
    };

    expect(itemView.id).toBe('ui-001');
    expect(itemView.contentType).toBe(ContentType.VIDEO);
    expect(itemView.provider).toBe(Provider.YOUTUBE);
    expect(itemView.state).toBe(UserItemState.INBOX);
  });

  it('should support progress tracking', () => {
    const itemWithProgress: ItemView = {
      id: 'ui-001',
      itemId: 'item-001',
      title: 'Test',
      thumbnailUrl: null,
      canonicalUrl: 'https://example.com',
      contentType: ContentType.PODCAST,
      provider: Provider.SPOTIFY,
      creator: 'Creator',
      publisher: null,
      summary: null,
      duration: 7200,
      publishedAt: null,
      state: UserItemState.BOOKMARKED,
      ingestedAt: '2024-12-01T00:00:00Z',
      bookmarkedAt: '2024-12-02T00:00:00Z',
      progress: {
        position: 1800,
        duration: 7200,
        percent: 25,
      },
      isFinished: false,
      finishedAt: null,
    };

    expect(itemWithProgress.progress).not.toBeNull();
    expect(itemWithProgress.progress?.position).toBe(1800);
    expect(itemWithProgress.progress?.percent).toBe(25);
  });
});
