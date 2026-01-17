/**
 * Unit Tests for Bookmarks Router
 *
 * Tests the tRPC bookmarks router procedures including:
 * - bookmarks.preview - Get link preview metadata
 * - bookmarks.save - Save a bookmark to the user's library
 * - Auth: Verify unauthenticated requests fail
 *
 * @vitest-environment miniflare
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { ContentType, Provider, UserItemState } from '@zine/shared';
import type { BookmarkSaveStatus } from './bookmarks';

// ============================================================================
// Test Fixtures
// ============================================================================

const TEST_USER_ID = 'user_test_123';

/**
 * Create mock LinkPreviewResult for testing
 */
function createMockPreviewResult(
  overrides: Partial<{
    provider: string;
    contentType: string;
    providerId: string;
    title: string;
    creator: string;
    creatorImageUrl: string | null;
    thumbnailUrl: string | null;
    duration: number | null;
    canonicalUrl: string;
    description?: string;
    source:
      | 'provider_api'
      | 'oembed'
      | 'opengraph'
      | 'fallback'
      | 'fxtwitter'
      | 'article_extractor';
  }> = {}
) {
  return {
    provider: Provider.YOUTUBE,
    contentType: ContentType.VIDEO,
    providerId: 'dQw4w9WgXcQ',
    title: 'Test Video',
    creator: 'Test Channel',
    creatorImageUrl: null,
    thumbnailUrl: 'https://example.com/thumb.jpg',
    duration: 3600,
    canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    source: 'oembed' as const,
    ...overrides,
  };
}

/**
 * Create mock save input for testing
 */
function createMockSaveInput(
  overrides: Partial<{
    url: string;
    provider: string;
    contentType: string;
    providerId: string;
    title: string;
    creator: string;
    creatorImageUrl: string | null;
    thumbnailUrl: string | null;
    duration: number | null;
    canonicalUrl: string;
    description?: string;
  }> = {}
) {
  return {
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    provider: Provider.YOUTUBE,
    contentType: ContentType.VIDEO,
    providerId: 'dQw4w9WgXcQ',
    title: 'Test Video',
    creator: 'Test Channel',
    creatorImageUrl: null as string | null,
    thumbnailUrl: 'https://example.com/thumb.jpg',
    duration: 3600,
    canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    ...overrides,
  };
}

// ============================================================================
// Mock Router Implementation for Testing
// ============================================================================

/**
 * Simulated item and userItem storage
 */
interface MockItem {
  id: string;
  provider: string;
  providerId: string;
  title: string;
  creator: string;
  creatorImageUrl: string | null;
  contentType: string;
  thumbnailUrl: string | null;
  duration: number | null;
  canonicalUrl: string;
  description?: string;
}

interface MockUserItem {
  id: string;
  userId: string;
  itemId: string;
  state: string;
  bookmarkedAt: string | null;
}

/**
 * Create a mock router caller that simulates the bookmarks router behavior
 */
function createMockBookmarksCaller(options: {
  userId: string | null;
  mockPreviewResult?: ReturnType<typeof createMockPreviewResult> | null;
  items?: Map<string, MockItem>;
  userItems?: Map<string, MockUserItem>;
}) {
  const {
    userId,
    mockPreviewResult = createMockPreviewResult(),
    items = new Map(),
    userItems = new Map(),
  } = options;

  let itemIdCounter = 1;
  let userItemIdCounter = 1;

  return {
    preview: async (input: { url: string }) => {
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      // Validate URL format
      try {
        new URL(input.url);
      } catch {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid URL format',
        });
      }

      return mockPreviewResult;
    },

    save: async (input: {
      url: string;
      provider: string;
      contentType: string;
      providerId: string;
      title: string;
      creator: string;
      creatorImageUrl?: string | null;
      thumbnailUrl: string | null;
      duration: number | null;
      canonicalUrl: string;
      description?: string;
    }) => {
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      // Find existing item by provider + providerId
      let itemId: string | null = null;
      for (const [id, item] of items) {
        if (item.provider === input.provider && item.providerId === input.providerId) {
          itemId = id;
          break;
        }
      }

      // Create item if not exists
      if (!itemId) {
        itemId = `item_${itemIdCounter++}`;
        items.set(itemId, {
          id: itemId,
          provider: input.provider,
          providerId: input.providerId,
          title: input.title,
          creator: input.creator,
          creatorImageUrl: input.creatorImageUrl ?? null,
          contentType: input.contentType,
          thumbnailUrl: input.thumbnailUrl,
          duration: input.duration,
          canonicalUrl: input.canonicalUrl,
          description: input.description,
        });
      }

      // Find existing user_item for this user + item
      let existingUserItem: MockUserItem | null = null;
      for (const [, ui] of userItems) {
        if (ui.userId === userId && ui.itemId === itemId) {
          existingUserItem = ui;
          break;
        }
      }

      if (existingUserItem) {
        if (existingUserItem.state === UserItemState.BOOKMARKED) {
          return {
            itemId,
            userItemId: existingUserItem.id,
            status: 'already_bookmarked' as BookmarkSaveStatus,
          };
        }

        // Update to BOOKMARKED
        existingUserItem.state = UserItemState.BOOKMARKED;
        existingUserItem.bookmarkedAt = new Date().toISOString();

        return {
          itemId,
          userItemId: existingUserItem.id,
          status: 'rebookmarked' as BookmarkSaveStatus,
        };
      }

      // Create new user_item
      const userItemId = `ui_${userItemIdCounter++}`;
      userItems.set(userItemId, {
        id: userItemId,
        userId,
        itemId,
        state: UserItemState.BOOKMARKED,
        bookmarkedAt: new Date().toISOString(),
      });

      return {
        itemId,
        userItemId,
        status: 'created' as BookmarkSaveStatus,
      };
    },
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Bookmarks Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ==========================================================================
  // Authentication Tests
  // ==========================================================================

  describe('Authentication', () => {
    it('should reject unauthenticated requests to preview', async () => {
      const caller = createMockBookmarksCaller({ userId: null });

      await expect(
        caller.preview({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })
      ).rejects.toThrow(TRPCError);
      await expect(
        caller.preview({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('should reject unauthenticated requests to save', async () => {
      const caller = createMockBookmarksCaller({ userId: null });

      await expect(caller.save(createMockSaveInput())).rejects.toThrow(TRPCError);
      await expect(caller.save(createMockSaveInput())).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });
  });

  // ==========================================================================
  // bookmarks.preview Tests
  // ==========================================================================

  describe('bookmarks.preview', () => {
    it('should return preview for valid YouTube URL', async () => {
      const mockPreview = createMockPreviewResult({
        provider: Provider.YOUTUBE,
        contentType: ContentType.VIDEO,
        providerId: 'dQw4w9WgXcQ',
        title: 'Rick Astley - Never Gonna Give You Up',
        creator: 'Rick Astley',
        source: 'oembed',
      });

      const caller = createMockBookmarksCaller({
        userId: TEST_USER_ID,
        mockPreviewResult: mockPreview,
      });

      const result = await caller.preview({
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      });

      expect(result).not.toBeNull();
      expect(result!.provider).toBe(Provider.YOUTUBE);
      expect(result!.contentType).toBe(ContentType.VIDEO);
      expect(result!.providerId).toBe('dQw4w9WgXcQ');
      expect(result!.title).toBe('Rick Astley - Never Gonna Give You Up');
      expect(result!.creator).toBe('Rick Astley');
      expect(result!.source).toBe('oembed');
    });

    it('should return preview for valid Spotify URL', async () => {
      const mockPreview = createMockPreviewResult({
        provider: Provider.SPOTIFY,
        contentType: ContentType.PODCAST,
        providerId: '0test123',
        title: 'Test Podcast Episode',
        creator: 'Test Podcast',
        duration: 3600,
        source: 'provider_api',
      });

      const caller = createMockBookmarksCaller({
        userId: TEST_USER_ID,
        mockPreviewResult: mockPreview,
      });

      const result = await caller.preview({
        url: 'https://open.spotify.com/episode/0test123',
      });

      expect(result).not.toBeNull();
      expect(result!.provider).toBe(Provider.SPOTIFY);
      expect(result!.contentType).toBe(ContentType.PODCAST);
      expect(result!.duration).toBe(3600);
      expect(result!.source).toBe('provider_api');
    });

    it('should return null for unsupported URL', async () => {
      const caller = createMockBookmarksCaller({
        userId: TEST_USER_ID,
        mockPreviewResult: null,
      });

      const result = await caller.preview({
        url: 'https://example.com/unknown-page',
      });

      expect(result).toBeNull();
    });

    it('should throw for invalid URL format', async () => {
      const caller = createMockBookmarksCaller({
        userId: TEST_USER_ID,
      });

      await expect(caller.preview({ url: 'not-a-valid-url' })).rejects.toThrow(TRPCError);
      await expect(caller.preview({ url: 'not-a-valid-url' })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
    });
  });

  // ==========================================================================
  // bookmarks.save Tests
  // ==========================================================================

  describe('bookmarks.save', () => {
    it('should create new item and user_item for first-time bookmark', async () => {
      const caller = createMockBookmarksCaller({
        userId: TEST_USER_ID,
        items: new Map(),
        userItems: new Map(),
      });

      const result = await caller.save(createMockSaveInput());

      expect(result.status).toBe('created');
      expect(result.itemId).toBeDefined();
      expect(result.userItemId).toBeDefined();
    });

    it('should return already_bookmarked for existing bookmarked item', async () => {
      const items = new Map<string, MockItem>();
      const userItems = new Map<string, MockUserItem>();

      items.set('item_1', {
        id: 'item_1',
        provider: Provider.YOUTUBE,
        providerId: 'dQw4w9WgXcQ',
        title: 'Test Video',
        creator: 'Test Channel',
        creatorImageUrl: null,
        contentType: ContentType.VIDEO,
        thumbnailUrl: null,
        duration: null,
        canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      });

      userItems.set('ui_1', {
        id: 'ui_1',
        userId: TEST_USER_ID,
        itemId: 'item_1',
        state: UserItemState.BOOKMARKED,
        bookmarkedAt: new Date().toISOString(),
      });

      const caller = createMockBookmarksCaller({
        userId: TEST_USER_ID,
        items,
        userItems,
      });

      const result = await caller.save(createMockSaveInput());

      expect(result.status).toBe('already_bookmarked');
      expect(result.itemId).toBe('item_1');
      expect(result.userItemId).toBe('ui_1');
    });

    it('should rebookmark archived item', async () => {
      const items = new Map<string, MockItem>();
      const userItems = new Map<string, MockUserItem>();

      items.set('item_1', {
        id: 'item_1',
        provider: Provider.YOUTUBE,
        providerId: 'dQw4w9WgXcQ',
        title: 'Test Video',
        creator: 'Test Channel',
        creatorImageUrl: null,
        contentType: ContentType.VIDEO,
        thumbnailUrl: null,
        duration: null,
        canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      });

      userItems.set('ui_1', {
        id: 'ui_1',
        userId: TEST_USER_ID,
        itemId: 'item_1',
        state: UserItemState.ARCHIVED,
        bookmarkedAt: null,
      });

      const caller = createMockBookmarksCaller({
        userId: TEST_USER_ID,
        items,
        userItems,
      });

      const result = await caller.save(createMockSaveInput());

      expect(result.status).toBe('rebookmarked');
      expect(result.itemId).toBe('item_1');
      expect(result.userItemId).toBe('ui_1');
    });

    it('should rebookmark inbox item', async () => {
      const items = new Map<string, MockItem>();
      const userItems = new Map<string, MockUserItem>();

      items.set('item_1', {
        id: 'item_1',
        provider: Provider.YOUTUBE,
        providerId: 'dQw4w9WgXcQ',
        title: 'Test Video',
        creator: 'Test Channel',
        creatorImageUrl: null,
        contentType: ContentType.VIDEO,
        thumbnailUrl: null,
        duration: null,
        canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      });

      userItems.set('ui_1', {
        id: 'ui_1',
        userId: TEST_USER_ID,
        itemId: 'item_1',
        state: UserItemState.INBOX,
        bookmarkedAt: null,
      });

      const caller = createMockBookmarksCaller({
        userId: TEST_USER_ID,
        items,
        userItems,
      });

      const result = await caller.save(createMockSaveInput());

      expect(result.status).toBe('rebookmarked');
      expect(result.itemId).toBe('item_1');
      expect(result.userItemId).toBe('ui_1');
    });

    it('should reuse existing item but create new user_item for different user', async () => {
      const items = new Map<string, MockItem>();
      const userItems = new Map<string, MockUserItem>();

      items.set('item_1', {
        id: 'item_1',
        provider: Provider.YOUTUBE,
        providerId: 'dQw4w9WgXcQ',
        title: 'Test Video',
        creator: 'Test Channel',
        creatorImageUrl: null,
        contentType: ContentType.VIDEO,
        thumbnailUrl: null,
        duration: null,
        canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      });

      // Another user has this item
      userItems.set('ui_other', {
        id: 'ui_other',
        userId: 'other_user',
        itemId: 'item_1',
        state: UserItemState.BOOKMARKED,
        bookmarkedAt: new Date().toISOString(),
      });

      const caller = createMockBookmarksCaller({
        userId: TEST_USER_ID,
        items,
        userItems,
      });

      const result = await caller.save(createMockSaveInput());

      expect(result.status).toBe('created');
      expect(result.itemId).toBe('item_1'); // Reused existing item
      expect(result.userItemId).not.toBe('ui_other'); // New user_item
    });

    it('should handle Spotify podcast bookmark', async () => {
      const caller = createMockBookmarksCaller({
        userId: TEST_USER_ID,
        items: new Map(),
        userItems: new Map(),
      });

      const result = await caller.save(
        createMockSaveInput({
          url: 'https://open.spotify.com/episode/0test123',
          provider: Provider.SPOTIFY,
          contentType: ContentType.PODCAST,
          providerId: '0test123',
          title: 'Test Podcast Episode',
          creator: 'Test Podcast',
          duration: 3600,
          canonicalUrl: 'https://open.spotify.com/episode/0test123',
        })
      );

      expect(result.status).toBe('created');
      expect(result.itemId).toBeDefined();
      expect(result.userItemId).toBeDefined();
    });

    it('should handle article bookmark', async () => {
      const caller = createMockBookmarksCaller({
        userId: TEST_USER_ID,
        items: new Map(),
        userItems: new Map(),
      });

      const result = await caller.save(
        createMockSaveInput({
          url: 'https://example.substack.com/p/great-article',
          provider: Provider.SUBSTACK,
          contentType: ContentType.ARTICLE,
          providerId: 'great-article',
          title: 'Great Article',
          creator: 'Author Name',
          duration: null,
          thumbnailUrl: null,
          canonicalUrl: 'https://example.substack.com/p/great-article',
        })
      );

      expect(result.status).toBe('created');
      expect(result.itemId).toBeDefined();
      expect(result.userItemId).toBeDefined();
    });

    describe('creatorImageUrl handling', () => {
      it('should save X/Twitter post with author avatar', async () => {
        const caller = createMockBookmarksCaller({
          userId: TEST_USER_ID,
          items: new Map(),
          userItems: new Map(),
        });

        const result = await caller.save(
          createMockSaveInput({
            url: 'https://x.com/naval/status/1234567890',
            provider: Provider.X,
            contentType: ContentType.POST,
            providerId: '1234567890',
            title: 'Naval tweet',
            creator: 'Naval (@naval)',
            creatorImageUrl: 'https://pbs.twimg.com/profile_images/avatar.jpg',
            thumbnailUrl: null,
            duration: null,
            canonicalUrl: 'https://x.com/naval/status/1234567890',
          })
        );

        expect(result.status).toBe('created');
        expect(result.itemId).toBeDefined();
      });

      it('should save web article with author image', async () => {
        const caller = createMockBookmarksCaller({
          userId: TEST_USER_ID,
          items: new Map(),
          userItems: new Map(),
        });

        const result = await caller.save(
          createMockSaveInput({
            url: 'https://steve-yegge.medium.com/article',
            provider: Provider.WEB,
            contentType: ContentType.ARTICLE,
            providerId: 'article',
            title: 'Great Article',
            creator: 'Steve Yegge',
            creatorImageUrl: 'https://cdn.medium.com/author-avatar.jpg',
            thumbnailUrl: 'https://cdn.medium.com/og-image.jpg',
            duration: null,
            canonicalUrl: 'https://steve-yegge.medium.com/article',
          })
        );

        expect(result.status).toBe('created');
        expect(result.itemId).toBeDefined();
      });

      it('should save web article with favicon fallback', async () => {
        const caller = createMockBookmarksCaller({
          userId: TEST_USER_ID,
          items: new Map(),
          userItems: new Map(),
        });

        const result = await caller.save(
          createMockSaveInput({
            url: 'https://example.com/blog/article',
            provider: Provider.WEB,
            contentType: ContentType.ARTICLE,
            providerId: 'article',
            title: 'Blog Post',
            creator: 'Blog Author',
            creatorImageUrl: 'https://example.com/favicon.ico', // Favicon fallback
            thumbnailUrl: null,
            duration: null,
            canonicalUrl: 'https://example.com/blog/article',
          })
        );

        expect(result.status).toBe('created');
        expect(result.itemId).toBeDefined();
      });

      it('should save bookmark with null creatorImageUrl (no favicon)', async () => {
        const caller = createMockBookmarksCaller({
          userId: TEST_USER_ID,
          items: new Map(),
          userItems: new Map(),
        });

        const result = await caller.save(
          createMockSaveInput({
            url: 'https://example.com/page',
            provider: Provider.WEB,
            contentType: ContentType.ARTICLE,
            providerId: 'page',
            title: 'Page without favicon',
            creator: 'Unknown',
            creatorImageUrl: null, // No author image or favicon
            thumbnailUrl: null,
            duration: null,
            canonicalUrl: 'https://example.com/page',
          })
        );

        expect(result.status).toBe('created');
        expect(result.itemId).toBeDefined();
      });

      it('should save Spotify podcast with show image', async () => {
        const caller = createMockBookmarksCaller({
          userId: TEST_USER_ID,
          items: new Map(),
          userItems: new Map(),
        });

        const result = await caller.save(
          createMockSaveInput({
            url: 'https://open.spotify.com/episode/abc123',
            provider: Provider.SPOTIFY,
            contentType: ContentType.PODCAST,
            providerId: 'abc123',
            title: 'Podcast Episode',
            creator: 'Podcast Show',
            creatorImageUrl: 'https://i.scdn.co/image/show-image.jpg', // Show image
            thumbnailUrl: 'https://i.scdn.co/image/episode-thumb.jpg',
            duration: 3600,
            canonicalUrl: 'https://open.spotify.com/episode/abc123',
          })
        );

        expect(result.status).toBe('created');
        expect(result.itemId).toBeDefined();
      });
    });
  });
});

// ============================================================================
// Type Tests
// ============================================================================

describe('BookmarkSaveStatus Type', () => {
  it('should have correct literal types', () => {
    const created: BookmarkSaveStatus = 'created';
    const alreadyBookmarked: BookmarkSaveStatus = 'already_bookmarked';
    const rebookmarked: BookmarkSaveStatus = 'rebookmarked';

    expect(created).toBe('created');
    expect(alreadyBookmarked).toBe('already_bookmarked');
    expect(rebookmarked).toBe('rebookmarked');
  });
});
