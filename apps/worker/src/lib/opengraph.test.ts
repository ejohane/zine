/**
 * Tests for Open Graph scraper
 *
 * Tests metadata extraction from HTML using HTMLRewriter.
 * Uses mock fetch to simulate various HTML responses.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scrapeOpenGraph, type OpenGraphData } from './opengraph';

// ============================================================================
// Test HTML Templates
// ============================================================================

/**
 * Escape HTML attribute value
 */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Generate HTML with Open Graph tags
 */
function createHtmlWithOG(og: Partial<OpenGraphData>, extras?: string): string {
  const metaTags: string[] = [];

  if (og.title) metaTags.push(`<meta property="og:title" content="${escapeAttr(og.title)}">`);
  if (og.description)
    metaTags.push(`<meta property="og:description" content="${escapeAttr(og.description)}">`);
  if (og.image) metaTags.push(`<meta property="og:image" content="${escapeAttr(og.image)}">`);
  if (og.siteName)
    metaTags.push(`<meta property="og:site_name" content="${escapeAttr(og.siteName)}">`);
  if (og.url) metaTags.push(`<meta property="og:url" content="${escapeAttr(og.url)}">`);
  if (og.type) metaTags.push(`<meta property="og:type" content="${escapeAttr(og.type)}">`);
  if (og.author)
    metaTags.push(`<meta property="article:author" content="${escapeAttr(og.author)}">`);
  if (og.authorImageUrl)
    metaTags.push(
      `<meta property="article:author:image" content="${escapeAttr(og.authorImageUrl)}">`
    );

  return `
    <!DOCTYPE html>
    <html>
    <head>
      ${metaTags.join('\n      ')}
      ${extras || ''}
    </head>
    <body><p>Content</p></body>
    </html>
  `;
}

/**
 * Generate HTML with standard meta tags (no OG)
 */
function createHtmlWithMeta(
  title: string,
  description?: string,
  author?: string,
  authorImage?: string
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      ${description ? `<meta name="description" content="${description}">` : ''}
      ${author ? `<meta name="author" content="${author}">` : ''}
      ${authorImage ? `<meta name="author:image" content="${authorImage}">` : ''}
    </head>
    <body><p>Content</p></body>
    </html>
  `;
}

// ============================================================================
// Mock Fetch Setup
// ============================================================================

const originalFetch = globalThis.fetch;

function mockFetch(html: string, options?: { status?: number; contentType?: string }): void {
  const { status = 200, contentType = 'text/html; charset=utf-8' } = options || {};

  globalThis.fetch = vi.fn().mockResolvedValue(
    new Response(html, {
      status,
      headers: { 'Content-Type': contentType },
    })
  );
}

function mockFetchError(error: Error): void {
  globalThis.fetch = vi.fn().mockRejectedValue(error);
}

// ============================================================================
// Tests
// ============================================================================

describe('scrapeOpenGraph', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  describe('Open Graph tags', () => {
    it('should extract all OG tags', async () => {
      const ogData: Partial<OpenGraphData> = {
        title: 'Test Article',
        description: 'A great article about testing',
        image: 'https://example.com/image.jpg',
        siteName: 'Example Site',
        url: 'https://example.com/article',
        type: 'article',
        author: 'John Doe',
      };

      mockFetch(createHtmlWithOG(ogData));

      const result = await scrapeOpenGraph('https://example.com/article');

      expect(result.title).toBe('Test Article');
      expect(result.description).toBe('A great article about testing');
      expect(result.image).toBe('https://example.com/image.jpg');
      expect(result.siteName).toBe('Example Site');
      expect(result.url).toBe('https://example.com/article');
      expect(result.type).toBe('article');
      expect(result.author).toBe('John Doe');
    });

    it('should handle partial OG tags', async () => {
      mockFetch(
        createHtmlWithOG({
          title: 'Just Title',
          image: 'https://example.com/og.png',
        })
      );

      const result = await scrapeOpenGraph('https://example.com/page');

      expect(result.title).toBe('Just Title');
      expect(result.image).toBe('https://example.com/og.png');
      expect(result.description).toBeNull();
      expect(result.siteName).toBeNull();
      expect(result.author).toBeNull();
    });
  });

  describe('Fallback tags', () => {
    it('should use title tag when no og:title', async () => {
      mockFetch(createHtmlWithMeta('Page Title from Title Tag'));

      const result = await scrapeOpenGraph('https://example.com/page');

      expect(result.title).toBe('Page Title from Title Tag');
    });

    it('should use meta description when no og:description', async () => {
      mockFetch(createHtmlWithMeta('Title', 'Meta description fallback'));

      const result = await scrapeOpenGraph('https://example.com/page');

      expect(result.description).toBe('Meta description fallback');
    });

    it('should use meta author when no article:author', async () => {
      mockFetch(createHtmlWithMeta('Title', undefined, 'Jane Smith'));

      const result = await scrapeOpenGraph('https://example.com/page');

      expect(result.author).toBe('Jane Smith');
    });

    it('should prefer OG tags over fallbacks', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Fallback Title</title>
          <meta name="description" content="Fallback description">
          <meta name="author" content="Fallback Author">
          <meta property="og:title" content="OG Title">
          <meta property="og:description" content="OG Description">
          <meta property="article:author" content="OG Author">
        </head>
        <body></body>
        </html>
      `;
      mockFetch(html);

      const result = await scrapeOpenGraph('https://example.com/page');

      expect(result.title).toBe('OG Title');
      expect(result.description).toBe('OG Description');
      expect(result.author).toBe('OG Author');
    });
  });

  describe('URL resolution', () => {
    it('should resolve relative image URLs', async () => {
      mockFetch(createHtmlWithOG({ image: '/images/og.jpg' }));

      const result = await scrapeOpenGraph('https://example.com/article');

      expect(result.image).toBe('https://example.com/images/og.jpg');
    });

    it('should resolve protocol-relative image URLs', async () => {
      mockFetch(createHtmlWithOG({ image: '//cdn.example.com/image.jpg' }));

      const result = await scrapeOpenGraph('https://example.com/article');

      expect(result.image).toBe('https://cdn.example.com/image.jpg');
    });

    it('should preserve absolute image URLs', async () => {
      mockFetch(createHtmlWithOG({ image: 'https://cdn.other.com/image.png' }));

      const result = await scrapeOpenGraph('https://example.com/article');

      expect(result.image).toBe('https://cdn.other.com/image.png');
    });

    it('should handle invalid image URLs gracefully', async () => {
      mockFetch(createHtmlWithOG({ image: 'not a valid url: [broken]' }));

      const result = await scrapeOpenGraph('https://example.com/article');

      // Invalid URLs should be resolved relative to base, or null if truly invalid
      expect(result.image).toBeTruthy(); // Will be resolved as relative path
    });
  });

  describe('Error handling', () => {
    it('should return empty result on HTTP error', async () => {
      mockFetch('Not Found', { status: 404 });

      const result = await scrapeOpenGraph('https://example.com/missing');

      expect(result.title).toBeNull();
      expect(result.description).toBeNull();
      expect(result.image).toBeNull();
    });

    it('should return empty result on non-HTML content', async () => {
      mockFetch('{ "data": "json" }', { contentType: 'application/json' });

      const result = await scrapeOpenGraph('https://example.com/api');

      expect(result.title).toBeNull();
    });

    it('should return empty result on network error', async () => {
      mockFetchError(new Error('Network error'));

      const result = await scrapeOpenGraph('https://example.com/page');

      expect(result.title).toBeNull();
      expect(result.description).toBeNull();
    });

    it('should handle timeout gracefully', async () => {
      // Create a fetch that never resolves
      globalThis.fetch = vi.fn().mockImplementation(
        () =>
          new Promise((_, reject) => {
            // Simulate abort after timeout
            setTimeout(() => {
              const error = new Error('Aborted');
              error.name = 'AbortError';
              reject(error);
            }, 100);
          })
      );

      // Use short timeout
      const resultPromise = scrapeOpenGraph('https://slow.example.com', {
        timeout: 50,
      });

      // Advance timers to trigger timeout
      await vi.advanceTimersByTimeAsync(150);

      const result = await resultPromise;
      expect(result.title).toBeNull();
    });
  });

  describe('Request options', () => {
    it('should use default User-Agent', async () => {
      mockFetch(createHtmlWithOG({ title: 'Test' }));

      await scrapeOpenGraph('https://example.com/page');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://example.com/page',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': expect.stringContaining('ZineBot'),
          }),
        })
      );
    });

    it('should allow custom User-Agent', async () => {
      mockFetch(createHtmlWithOG({ title: 'Test' }));

      await scrapeOpenGraph('https://example.com/page', {
        userAgent: 'CustomBot/1.0',
      });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://example.com/page',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'CustomBot/1.0',
          }),
        })
      );
    });

    it('should follow redirects', async () => {
      mockFetch(createHtmlWithOG({ title: 'Redirected Page' }));

      await scrapeOpenGraph('https://example.com/old-url');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://example.com/old-url',
        expect.objectContaining({
          redirect: 'follow',
        })
      );
    });
  });

  describe('Edge cases', () => {
    it('should handle minimal HTML', async () => {
      mockFetch('<html></html>');

      const result = await scrapeOpenGraph('https://example.com/empty');

      expect(result.title).toBeNull();
    });

    it('should handle HTML without head', async () => {
      mockFetch('<html><body><p>No head</p></body></html>');

      const result = await scrapeOpenGraph('https://example.com/nohead');

      expect(result.title).toBeNull();
    });

    it('should handle malformed HTML gracefully', async () => {
      mockFetch('<html><head><meta property="og:title" content="Works"><title>Also');

      const result = await scrapeOpenGraph('https://example.com/malformed');

      expect(result.title).toBe('Works');
    });

    it('should take first og:image when multiple present', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta property="og:image" content="https://example.com/first.jpg">
          <meta property="og:image" content="https://example.com/second.jpg">
        </head>
        <body></body>
        </html>
      `;
      mockFetch(html);

      const result = await scrapeOpenGraph('https://example.com/multi-image');

      expect(result.image).toBe('https://example.com/first.jpg');
    });

    it('should handle XHTML content type', async () => {
      mockFetch(createHtmlWithOG({ title: 'XHTML Page' }), {
        contentType: 'application/xhtml+xml',
      });

      const result = await scrapeOpenGraph('https://example.com/xhtml');

      expect(result.title).toBe('XHTML Page');
    });

    it('should handle special characters in content', async () => {
      // Note: createHtmlWithOG escapes the values for HTML attributes
      // The scraper returns the raw attribute values (HTML entities not decoded)
      mockFetch(
        createHtmlWithOG({
          title: 'Test & "Quotes"',
          description: "Description with 'quotes' and unicode: \u00e9\u00f1",
        })
      );

      const result = await scrapeOpenGraph('https://example.com/special');

      // HTMLRewriter returns attribute values with entities preserved
      expect(result.title).toBe('Test &amp; &quot;Quotes&quot;');
      expect(result.description).toBe("Description with 'quotes' and unicode: \u00e9\u00f1");
    });
  });

  describe('Author image URL extraction', () => {
    it('should extract article:author:image meta property', async () => {
      mockFetch(
        createHtmlWithOG({
          title: 'Article with Author Image',
          author: 'John Doe',
          authorImageUrl: 'https://example.com/avatars/john.jpg',
        })
      );

      const result = await scrapeOpenGraph('https://example.com/article');

      expect(result.authorImageUrl).toBe('https://example.com/avatars/john.jpg');
    });

    it('should use author:image with property attribute as fallback', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta property="og:title" content="Test Article">
          <meta property="author:image" content="https://example.com/author-avatar.png">
        </head>
        <body></body>
        </html>
      `;
      mockFetch(html);

      const result = await scrapeOpenGraph('https://example.com/article');

      expect(result.authorImageUrl).toBe('https://example.com/author-avatar.png');
    });

    it('should use author:image with name attribute as fallback', async () => {
      mockFetch(
        createHtmlWithMeta('Title', undefined, 'Jane Smith', 'https://example.com/jane.jpg')
      );

      const result = await scrapeOpenGraph('https://example.com/page');

      expect(result.authorImageUrl).toBe('https://example.com/jane.jpg');
    });

    it('should prefer article:author:image over author:image fallbacks', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta property="og:title" content="Test">
          <meta property="article:author:image" content="https://example.com/preferred.jpg">
          <meta property="author:image" content="https://example.com/fallback1.jpg">
          <meta name="author:image" content="https://example.com/fallback2.jpg">
        </head>
        <body></body>
        </html>
      `;
      mockFetch(html);

      const result = await scrapeOpenGraph('https://example.com/article');

      expect(result.authorImageUrl).toBe('https://example.com/preferred.jpg');
    });

    it('should resolve relative author image URLs', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta property="og:title" content="Test">
          <meta property="article:author:image" content="/images/authors/avatar.jpg">
        </head>
        <body></body>
        </html>
      `;
      mockFetch(html);

      const result = await scrapeOpenGraph('https://example.com/article');

      expect(result.authorImageUrl).toBe('https://example.com/images/authors/avatar.jpg');
    });

    it('should resolve protocol-relative author image URLs', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta property="og:title" content="Test">
          <meta property="article:author:image" content="//cdn.example.com/avatar.jpg">
        </head>
        <body></body>
        </html>
      `;
      mockFetch(html);

      const result = await scrapeOpenGraph('https://example.com/article');

      expect(result.authorImageUrl).toBe('https://cdn.example.com/avatar.jpg');
    });

    it('should return null when no author image is present', async () => {
      mockFetch(
        createHtmlWithOG({
          title: 'Article without Author Image',
          author: 'John Doe',
        })
      );

      const result = await scrapeOpenGraph('https://example.com/article');

      expect(result.authorImageUrl).toBeNull();
    });

    it('should take first article:author:image when multiple present', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta property="article:author:image" content="https://example.com/first.jpg">
          <meta property="article:author:image" content="https://example.com/second.jpg">
        </head>
        <body></body>
        </html>
      `;
      mockFetch(html);

      const result = await scrapeOpenGraph('https://example.com/multi-author-image');

      expect(result.authorImageUrl).toBe('https://example.com/first.jpg');
    });
  });
});
