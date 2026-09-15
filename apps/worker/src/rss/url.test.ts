import { describe, expect, it, vi } from 'vitest';

import {
  deriveIdentityHash,
  fetchPublicFeedUrl,
  normalizeContentUrl,
  normalizeFeedUrl,
} from './url';

describe('rss url utilities', () => {
  it('normalizes feed urls and strips tracking params', () => {
    const normalized = normalizeFeedUrl(
      'HTTPS://Example.com:443/feed/?utm_source=test&ref=abc#fragment'
    );

    expect(normalized).toBe('https://example.com/feed');
  });

  it('rejects localhost and private hosts', () => {
    expect(() => normalizeFeedUrl('http://localhost:8080/feed.xml')).toThrow(
      'unsafe or private host'
    );
    expect(() => normalizeFeedUrl('http://127.0.0.1/feed.xml')).toThrow('unsafe or private host');
  });

  it('normalizes content urls relative to feed and strips tracking', () => {
    const normalized = normalizeContentUrl(
      '/post?id=1&utm_medium=email',
      'https://example.com/feed.xml'
    );

    expect(normalized).toBe('https://example.com/post?id=1');
  });

  it('creates deterministic identity hashes', () => {
    const first = deriveIdentityHash({
      feedUrl: 'https://example.com/feed.xml',
      title: 'Title',
      summary: 'Summary',
      publishedAt: 123,
    });

    const second = deriveIdentityHash({
      feedUrl: 'https://example.com/feed.xml',
      title: 'Title',
      summary: 'Summary',
      publishedAt: 123,
    });

    expect(first).toBe(second);
    expect(first.length).toBeGreaterThan(8);
  });

  it('rejects a redirect to a private host before following it', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'http://127.0.0.1/private.xml' },
      })
    );

    await expect(fetchPublicFeedUrl('https://example.com/feed.xml', {})).rejects.toThrow(
      'unsafe or private host'
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.com/feed.xml',
      expect.objectContaining({ redirect: 'manual' })
    );
  });

  it('passes a conditional 304 response through without requiring a location', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 304 }));

    const result = await fetchPublicFeedUrl('https://example.com/feed.xml', {
      headers: { 'If-None-Match': '"current"' },
    });

    expect(result.response.status).toBe(304);
    expect(result.resolvedUrl).toBe('https://example.com/feed.xml');
  });
});
