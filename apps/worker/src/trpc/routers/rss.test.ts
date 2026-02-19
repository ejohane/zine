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

vi.mock('../../rss/service', () => ({
  syncRssFeed: (...args: unknown[]) => mockSyncRssFeed(...args),
  syncRssFeedById: (...args: unknown[]) => mockSyncRssFeedById(...args),
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
