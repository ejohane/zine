/**
 * Tests for RSS router behavior.
 *
 * @vitest-environment miniflare
 */

import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { rssRouter } from './rss';

const mockSyncRssFeed = vi.fn();
const mockSyncRssFeedById = vi.fn();
const mockDiscoverFeedsForUrl = vi.fn();

vi.mock('../../rss/service', () => ({
  syncRssFeed: (...args: unknown[]) => mockSyncRssFeed(...args),
  syncRssFeedById: (...args: unknown[]) => mockSyncRssFeedById(...args),
}));

vi.mock('../../rss/discovery', () => ({
  discoverFeedsForUrl: (...args: unknown[]) => mockDiscoverFeedsForUrl(...args),
}));

function createMockCtx(userId: string | null = 'user_test_123') {
  const mockFindFirst = vi.fn();
  const mockFindMany = vi.fn();
  const mockInsertValues = vi.fn().mockResolvedValue(undefined);
  const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
  const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);

  const db = {
    query: {
      rssFeeds: {
        findFirst: mockFindFirst,
        findMany: mockFindMany,
      },
      items: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn().mockReturnValue({
      values: mockInsertValues,
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: mockUpdateWhere,
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: mockDeleteWhere,
    }),
  };

  const kvGet = vi.fn().mockResolvedValue(null);
  const kvPut = vi.fn().mockResolvedValue(undefined);

  const env = {
    OAUTH_STATE_KV: {
      get: kvGet,
      put: kvPut,
    },
  };

  return {
    userId,
    db,
    env,
    mocks: {
      mockFindFirst,
      mockFindMany,
      mockInsertValues,
      mockUpdateWhere,
      mockDeleteWhere,
      kvGet,
      kvPut,
    },
  };
}

describe('rssRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds a feed and seeds latest item', async () => {
    const ctx = createMockCtx();
    const caller = rssRouter.createCaller(ctx as never);

    ctx.mocks.mockFindFirst
      .mockResolvedValueOnce(null) // existing lookup
      .mockResolvedValueOnce({
        id: 'feed_1',
        userId: 'user_test_123',
        feedUrl: 'https://example.com/feed.xml',
        status: 'ACTIVE',
      }) // feed after insert
      .mockResolvedValueOnce({
        id: 'feed_1',
        userId: 'user_test_123',
        feedUrl: 'https://example.com/feed.xml',
        title: 'Example Feed',
        status: 'ACTIVE',
      }); // refreshed feed

    mockSyncRssFeed.mockResolvedValue({
      newItems: 1,
      processedEntries: 1,
      skipped: false,
    });

    const result = await caller.add({ feedUrl: 'https://example.com/feed.xml' });

    expect(result.id).toBe('feed_1');
    expect(result.seededItems).toBe(1);
    expect(result.created).toBe(true);
  });

  it('adds a feed without seeding items when seedMode is none', async () => {
    const ctx = createMockCtx();
    const caller = rssRouter.createCaller(ctx as never);

    ctx.mocks.mockFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'feed_1',
        userId: 'user_test_123',
        feedUrl: 'https://example.com/feed.xml',
        status: 'ACTIVE',
      })
      .mockResolvedValueOnce({
        id: 'feed_1',
        userId: 'user_test_123',
        feedUrl: 'https://example.com/feed.xml',
        title: 'Example Feed',
        status: 'ACTIVE',
      });

    mockSyncRssFeed.mockResolvedValue({
      newItems: 0,
      processedEntries: 0,
      skipped: false,
    });

    const result = await caller.add({
      feedUrl: 'https://example.com/feed.xml',
      seedMode: 'none',
    });

    expect(result.seededItems).toBe(0);
    expect(mockSyncRssFeed).toHaveBeenCalledWith(
      ctx.db,
      expect.objectContaining({
        id: 'feed_1',
      }),
      expect.objectContaining({
        maxEntries: 0,
        useConditional: false,
      })
    );
  });

  it('cleans up created feed when initial sync fails', async () => {
    const ctx = createMockCtx();
    const caller = rssRouter.createCaller(ctx as never);

    ctx.mocks.mockFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'feed_2',
      userId: 'user_test_123',
      feedUrl: 'https://broken.example.com/feed.xml',
      status: 'ACTIVE',
    });

    mockSyncRssFeed.mockRejectedValue(new Error('Invalid XML feed'));

    await expect(
      caller.add({ feedUrl: 'https://broken.example.com/feed.xml' })
    ).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });

    expect(ctx.mocks.mockDeleteWhere).toHaveBeenCalled();
  });

  it('syncs an owned feed manually', async () => {
    const ctx = createMockCtx();
    const caller = rssRouter.createCaller(ctx as never);

    ctx.mocks.mockFindFirst.mockResolvedValue({
      id: 'feed_sync',
      userId: 'user_test_123',
      status: 'ACTIVE',
    });

    mockSyncRssFeedById.mockResolvedValue({
      newItems: 4,
      processedEntries: 6,
      skipped: false,
    });

    const result = await caller.syncNow({ feedId: 'feed_sync' });

    expect(result.success).toBe(true);
    expect(result.itemsFound).toBe(4);
    expect(ctx.mocks.kvPut).toHaveBeenCalled();
    expect(mockSyncRssFeedById).toHaveBeenCalledWith(
      ctx.db,
      'user_test_123',
      'feed_sync',
      expect.objectContaining({
        maxEntries: 20,
        useConditional: false,
      })
    );
  });

  it('discovers feeds and annotates existing subscriptions', async () => {
    const ctx = createMockCtx();
    const caller = rssRouter.createCaller(ctx as never);

    mockDiscoverFeedsForUrl.mockResolvedValue({
      sourceUrl: 'https://example.com/post',
      sourceOrigin: 'https://example.com',
      checkedAt: 123,
      cached: false,
      candidates: [
        {
          feedUrl: 'https://example.com/feed.xml',
          title: 'Example Feed',
          description: null,
          siteUrl: 'https://example.com/',
          discoveredFrom: 'page_link',
          score: 100,
        },
      ],
    });

    ctx.mocks.mockFindMany.mockResolvedValue([
      {
        id: 'feed_existing',
        userId: 'user_test_123',
        feedUrl: 'https://example.com/feed.xml',
        status: 'ACTIVE',
      },
    ]);

    const result = await caller.discover({
      url: 'https://example.com/post',
    });

    expect(mockDiscoverFeedsForUrl).toHaveBeenCalledWith(ctx.db, 'https://example.com/post', {
      refresh: false,
    });
    expect(result.sourceOrigin).toBe('https://example.com');
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.subscription).toEqual({
      feedId: 'feed_existing',
      status: 'ACTIVE',
    });
  });

  it('returns feed stats', async () => {
    const ctx = createMockCtx();
    const caller = rssRouter.createCaller(ctx as never);

    ctx.mocks.mockFindMany.mockResolvedValue([
      { status: 'ACTIVE', lastSuccessAt: 1000 },
      { status: 'PAUSED', lastSuccessAt: 500 },
      { status: 'UNSUBSCRIBED', lastSuccessAt: null },
      { status: 'ERROR', lastSuccessAt: 900 },
    ]);

    const result = await caller.stats();

    expect(result.total).toBe(4);
    expect(result.active).toBe(1);
    expect(result.paused).toBe(1);
    expect(result.unsubscribed).toBe(1);
    expect(result.error).toBe(1);
    expect(result.lastSuccessAt).toBe(1000);
  });

  it('requires authentication', async () => {
    const ctx = createMockCtx(null);
    const caller = rssRouter.createCaller(ctx as never);

    await expect(caller.list()).rejects.toBeInstanceOf(TRPCError);
    await expect(caller.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
