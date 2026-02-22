import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { discoverFeedsForUrl, extractFeedLinksFromHtml } from './discovery';

const VALID_FEED_XML = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Example Feed</title>
    <link>https://example.com</link>
    <description>Example</description>
    <item>
      <title>Post</title>
      <link>https://example.com/post</link>
      <guid>post-1</guid>
    </item>
  </channel>
</rss>`;

function createMockDb(overrides?: { cachedRow?: Record<string, unknown> | null }) {
  const findFirst = vi.fn().mockResolvedValue(overrides?.cachedRow ?? null);
  const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
  const insert = vi.fn().mockReturnValue({ values });

  return {
    db: {
      query: {
        rssDiscoveryCache: {
          findFirst,
        },
      },
      insert,
    } as unknown as Parameters<typeof discoverFeedsForUrl>[0],
    mocks: {
      findFirst,
      insert,
      values,
      onConflictDoUpdate,
    },
  };
}

describe('rss discovery', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('extracts feed links from HTML link alternate tags', () => {
    const html = `
      <html>
        <head>
          <link rel="alternate" type="application/rss+xml" href="/feed.xml" />
          <link rel="alternate" type="application/atom+xml" href="https://example.com/atom.xml" />
          <link rel="stylesheet" href="/styles.css" />
        </head>
      </html>
    `;

    const links = extractFeedLinksFromHtml(html, 'https://example.com/article');

    expect(links).toContain('https://example.com/feed.xml');
    expect(links).toContain('https://example.com/atom.xml');
    expect(links).toHaveLength(2);
  });

  it('returns cached discovery result when cache is fresh', async () => {
    const { db } = createMockDb({
      cachedRow: {
        id: 'hash',
        sourceOrigin: 'https://example.com',
        sourceOriginHash: 'hash',
        sourceUrl: 'https://example.com/article',
        candidatesJson: JSON.stringify([
          {
            feedUrl: 'https://example.com/feed.xml',
            title: 'Example Feed',
            description: null,
            siteUrl: 'https://example.com/',
            discoveredFrom: 'page_link',
            score: 100,
          },
        ]),
        status: 'SUCCESS',
        lastError: null,
        checkedAt: 123,
        expiresAt: Date.now() + 60_000,
        createdAt: 123,
        updatedAt: 123,
      },
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await discoverFeedsForUrl(db, 'https://example.com/article');

    expect(result.cached).toBe(true);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.feedUrl).toBe('https://example.com/feed.xml');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('discovers feeds from page links and writes cache', async () => {
    const { db, mocks } = createMockDb();

    const fetchSpy = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url === 'https://example.com/article') {
        return new Response(
          `<html><head><link rel="alternate" type="application/rss+xml" href="/feed.xml" /></head></html>`,
          { status: 200, headers: { 'content-type': 'text/html' } }
        );
      }
      if (url === 'https://example.com/feed.xml') {
        return new Response(VALID_FEED_XML, {
          status: 200,
          headers: { 'content-type': 'application/rss+xml' },
        });
      }
      if (url === 'https://example.com/') {
        return new Response('<html><head></head></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      }
      // Common-path candidates return 404 to keep this test focused on page autodiscovery.
      return new Response('Not Found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchSpy);

    const result = await discoverFeedsForUrl(db, 'https://example.com/article');

    expect(result.cached).toBe(false);
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates[0]?.feedUrl).toBe('https://example.com/feed.xml');
    expect(result.candidates[0]?.discoveredFrom).toBe('page_link');
    expect(mocks.insert).toHaveBeenCalled();
    expect(mocks.values).toHaveBeenCalled();
    expect(mocks.onConflictDoUpdate).toHaveBeenCalled();
  });
});
