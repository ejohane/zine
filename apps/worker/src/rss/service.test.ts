import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentType, Provider } from '@zine/shared';

import { items } from '../db/schema';

const mockPrepareItem = vi.fn();
const mockFetchLinkPreview = vi.fn();
const mockGetOrCreateCreator = vi.fn();

vi.mock('../ingestion/processor/prepare', () => ({
  prepareItem: (...args: unknown[]) => mockPrepareItem(...args),
}));

vi.mock('../lib/link-preview', () => ({
  fetchLinkPreview: (...args: unknown[]) => mockFetchLinkPreview(...args),
}));

vi.mock('../ingestion/processor/creators', () => ({
  getOrCreateCreator: (...args: unknown[]) => mockGetOrCreateCreator(...args),
}));

import { syncRssFeed } from './service';

type SyncDb = Parameters<typeof syncRssFeed>[0];
type SyncFeed = Parameters<typeof syncRssFeed>[1];

function createMockDb(options?: {
  existingThumbnailUrl?: string | null;
  existingSummary?: string | null;
  existingCreatorId?: string | null;
}) {
  const itemFindFirst = vi.fn().mockResolvedValue({
    id: 'item_123',
    thumbnailUrl: options?.existingThumbnailUrl ?? null,
    summary: options?.existingSummary ?? null,
    creatorId: options?.existingCreatorId ?? null,
  });
  const whereSpy = vi.fn().mockResolvedValue(undefined);
  const setSpy = vi.fn(() => ({ where: whereSpy }));
  const updateSpy = vi.fn(() => ({ set: setSpy }));

  const onConflictDoNothingSpy = vi.fn().mockResolvedValue(undefined);
  const valuesSpy = vi.fn(() => ({ onConflictDoNothing: onConflictDoNothingSpy }));
  const insertSpy = vi.fn(() => ({ values: valuesSpy }));

  return {
    db: {
      query: {
        items: {
          findFirst: itemFindFirst,
        },
      },
      update: updateSpy,
      insert: insertSpy,
      batch: vi.fn(),
    } as unknown as SyncDb,
    spies: {
      itemFindFirst,
      updateSpy,
      setSpy,
      whereSpy,
      insertSpy,
      valuesSpy,
      onConflictDoNothingSpy,
    },
  };
}

const sampleAtom = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Feed</title>
  <link href="https://example.com/" rel="alternate" />
  <entry>
    <id>tag:example.com,2026:entry-1</id>
    <title>Entry With Image</title>
    <link href="https://example.com/posts/1" rel="alternate" />
    <updated>2026-02-18T10:00:00Z</updated>
    <summary type="html">&lt;p&gt;Body&lt;/p&gt;&lt;img src="https://cdn.example.com/post-1.jpg" /&gt;</summary>
  </entry>
</feed>`;

const sampleAtomBacklog = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Feed</title>
  <link href="https://example.com/" rel="alternate" />
  <entry>
    <id>tag:example.com,2026:entry-1</id>
    <title>Newest Entry</title>
    <link href="https://example.com/posts/1" rel="alternate" />
    <updated>2026-02-20T10:00:00Z</updated>
    <summary type="html">&lt;p&gt;Newest&lt;/p&gt;</summary>
  </entry>
  <entry>
    <id>tag:example.com,2026:entry-2</id>
    <title>Middle Entry</title>
    <link href="https://example.com/posts/2" rel="alternate" />
    <updated>2026-02-19T10:00:00Z</updated>
    <summary type="html">&lt;p&gt;Middle&lt;/p&gt;</summary>
  </entry>
  <entry>
    <id>tag:example.com,2026:entry-3</id>
    <title>Oldest Entry</title>
    <link href="https://example.com/posts/3" rel="alternate" />
    <updated>2026-02-18T10:00:00Z</updated>
    <summary type="html">&lt;p&gt;Oldest&lt;/p&gt;</summary>
  </entry>
</feed>`;

const feed = {
  id: 'feed_123',
  userId: 'user_123',
  feedUrl: 'https://example.com/feed.xml',
  title: 'Example Feed',
  description: null,
  siteUrl: null,
  imageUrl: null,
  etag: null,
  lastModified: null,
  lastPolledAt: null,
  lastSuccessAt: null,
  lastErrorAt: null,
  lastError: null,
  errorCount: 0,
  status: 'ACTIVE',
  pollIntervalSeconds: 3600,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

describe('syncRssFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrepareItem.mockResolvedValue({ status: 'skipped' });
    mockFetchLinkPreview.mockResolvedValue(null);
    mockGetOrCreateCreator.mockResolvedValue(null);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(sampleAtom, {
        status: 200,
        headers: {
          etag: '"feed-etag"',
          'last-modified': 'Wed, 18 Feb 2026 10:00:00 GMT',
        },
      })
    );
  });

  it('caps first sync to one entry even when a larger batch size is requested', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(sampleAtomBacklog, {
        status: 200,
      })
    );

    const { db } = createMockDb();
    const result = await syncRssFeed(db, feed as SyncFeed, {
      maxEntries: 20,
      useConditional: false,
    });

    expect(result.processedEntries).toBe(1);
    expect(mockPrepareItem).toHaveBeenCalledTimes(1);
  });

  it('uses the requested batch size after the feed has synced successfully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(sampleAtomBacklog, {
        status: 200,
      })
    );

    const { db } = createMockDb();
    const syncedFeed = {
      ...feed,
      lastSuccessAt: Date.now() - 60_000,
    };
    const result = await syncRssFeed(db, syncedFeed as SyncFeed, {
      maxEntries: 2,
      useConditional: false,
    });

    expect(result.processedEntries).toBe(2);
    expect(mockPrepareItem).toHaveBeenCalledTimes(2);
  });

  it('backfills thumbnail, summary, and creator for skipped RSS items', async () => {
    mockFetchLinkPreview.mockResolvedValue({
      provider: 'WEB',
      contentType: 'ARTICLE',
      providerId: 'https://example.com/posts/1',
      title: 'Entry With Image',
      creator: 'Example Author',
      creatorImageUrl: 'https://example.com/avatar.jpg',
      thumbnailUrl: 'https://example.com/cover.jpg',
      duration: null,
      canonicalUrl: 'https://example.com/posts/1',
      description: 'Clean description from article extractor.',
      source: 'article_extractor',
    });
    mockGetOrCreateCreator.mockResolvedValue('creator_123');

    const { db, spies } = createMockDb({
      existingThumbnailUrl: null,
      existingSummary: '<p>Raw html</p>',
      existingCreatorId: null,
    });

    await syncRssFeed(db, feed as SyncFeed, { maxEntries: 1, useConditional: false });

    const updateCalls = spies.updateSpy.mock.calls as unknown[][];
    const itemUpdateCall = updateCalls.find((call) => call[0] === items);
    expect(itemUpdateCall).toBeDefined();

    const setCalls = spies.setSpy.mock.calls as unknown[][];
    const itemSetCall = setCalls.find(
      (call) => call[0] && typeof call[0] === 'object' && 'thumbnailUrl' in (call[0] as object)
    );
    expect(itemSetCall).toBeDefined();

    const itemUpdates = itemSetCall![0] as {
      thumbnailUrl?: string;
      summary?: string;
      creatorId?: string;
    };
    expect(itemUpdates.thumbnailUrl).toBe('https://example.com/cover.jpg');
    expect(itemUpdates.summary).toBe('Clean description from article extractor.');
    expect(itemUpdates.creatorId).toBe('creator_123');
  });

  it('does not overwrite existing thumbnails on skipped entries', async () => {
    const { db, spies } = createMockDb({
      existingThumbnailUrl: 'https://cdn.example.com/existing.jpg',
      existingSummary: 'Already clean summary',
      existingCreatorId: 'creator_existing',
    });

    await syncRssFeed(db, feed as SyncFeed, { maxEntries: 1, useConditional: false });

    const setCalls = spies.setSpy.mock.calls as unknown[][];
    const thumbnailSetCalls = setCalls.filter(
      (call) => call[0] && typeof call[0] === 'object' && 'thumbnailUrl' in (call[0] as object)
    );
    expect(thumbnailSetCalls).toHaveLength(0);
  });

  it('backfills canonical RSS item metadata when item exists but seen marker is missing', async () => {
    mockPrepareItem.mockResolvedValue({
      status: 'prepared',
      item: {
        newItem: {
          id: 'new_item_123',
          contentType: ContentType.ARTICLE,
          provider: Provider.RSS,
          providerId: 'https://example.com/posts/1',
          canonicalUrl: 'https://example.com/posts/1',
          title: 'Entry With Image',
          description: 'Clean description from article extractor.',
          creator: 'Example Author',
          creatorImageUrl: 'https://example.com/avatar.jpg',
          imageUrl: 'https://example.com/cover.jpg',
          publishedAt: Date.now(),
          createdAt: Date.now(),
        },
        rawItem: {},
        providerId: 'https://example.com/posts/1',
        canonicalItemId: 'item_123',
        canonicalItemExists: true,
        userItemId: 'user_item_123',
        creatorId: 'creator_123',
      },
    });

    const { db, spies } = createMockDb({
      existingThumbnailUrl: null,
      existingSummary: '<p>Raw html</p>',
      existingCreatorId: null,
    });

    await syncRssFeed(db, feed as SyncFeed, { maxEntries: 1, useConditional: false });

    const updateCalls = spies.updateSpy.mock.calls as unknown[][];
    const itemUpdateCall = updateCalls.find((call) => call[0] === items);
    expect(itemUpdateCall).toBeDefined();

    const setCalls = spies.setSpy.mock.calls as unknown[][];
    const itemSetCall = setCalls.find(
      (call) => call[0] && typeof call[0] === 'object' && 'thumbnailUrl' in (call[0] as object)
    );
    expect(itemSetCall).toBeDefined();

    const itemUpdates = itemSetCall![0] as {
      thumbnailUrl?: string;
      summary?: string;
      creatorId?: string;
    };
    expect(itemUpdates.thumbnailUrl).toBe('https://example.com/cover.jpg');
    expect(itemUpdates.summary).toBe('Clean description from article extractor.');
    expect(itemUpdates.creatorId).toBe('creator_123');
  });
});
