import { describe, expect, it } from 'vitest';

import { deriveIdentityHash, normalizeContentUrl, normalizeFeedUrl } from './url';

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
});
