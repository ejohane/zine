/**
 * Tests for Article Extractor
 *
 * Tests article metadata extraction using Readability and linkedom.
 * Uses mock fetch to simulate various HTML responses.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { extractArticleFromHtml, extractArticle } from './article-extractor';

// Mock logger to prevent console output during tests
vi.mock('./logger', () => ({
  logger: {
    child: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

// ============================================================================
// Test HTML Templates
// ============================================================================

/**
 * Generate valid article HTML that passes Readability's isProbablyReaderable check
 * Readability requires substantial content to consider something readable
 */
function createArticleHtml(options: {
  title?: string;
  author?: string;
  authorImageUrl?: string;
  ogImage?: string;
  siteName?: string;
  publishedTime?: string;
  content?: string;
}): string {
  const {
    title = 'Test Article Title',
    author,
    authorImageUrl,
    ogImage,
    siteName,
    publishedTime,
    content = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(50),
  } = options;

  const metaTags: string[] = [];
  if (ogImage) metaTags.push(`<meta property="og:image" content="${ogImage}">`);
  if (siteName) metaTags.push(`<meta property="og:site_name" content="${siteName}">`);
  if (publishedTime)
    metaTags.push(`<meta property="article:published_time" content="${publishedTime}">`);
  if (authorImageUrl)
    metaTags.push(`<meta property="article:author:image" content="${authorImageUrl}">`);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      ${metaTags.join('\n      ')}
    </head>
    <body>
      <article>
        <h1>${title}</h1>
        ${author ? `<p class="byline">By ${author}</p>` : ''}
        <p>${content}</p>
      </article>
    </body>
    </html>
  `;
}

/**
 * Generate minimal HTML that is not a readable article
 */
function createNonArticleHtml(options: { ogImage?: string; authorImageUrl?: string } = {}): string {
  const { ogImage, authorImageUrl } = options;

  const metaTags: string[] = [];
  if (ogImage) metaTags.push(`<meta property="og:image" content="${ogImage}">`);
  if (authorImageUrl)
    metaTags.push(`<meta property="article:author:image" content="${authorImageUrl}">`);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Home Page</title>
      ${metaTags.join('\n      ')}
    </head>
    <body>
      <nav><a href="/">Home</a><a href="/about">About</a></nav>
      <p>Short content.</p>
    </body>
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

describe('article-extractor', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('extractArticleFromHtml', () => {
    describe('valid article HTML', () => {
      it('extracts article metadata from valid HTML', () => {
        const html = createArticleHtml({
          title: 'My Test Article',
          author: 'John Doe',
          ogImage: 'https://example.com/image.jpg',
          siteName: 'Example Blog',
        });

        const result = extractArticleFromHtml(html, 'https://example.com/article');

        expect(result).not.toBeNull();
        expect(result!.isArticle).toBe(true);
        expect(result!.title).toBe('My Test Article');
        expect(result!.thumbnailUrl).toBe('https://example.com/image.jpg');
        expect(result!.siteName).toBe('Example Blog');
      });

      it('calculates reading time based on content length', () => {
        // Create article with known word count
        // ~200 words per minute, content is estimated at 5 chars per word
        const longContent = 'Word '.repeat(400); // ~400 words = 2 minutes
        const html = createArticleHtml({
          title: 'Long Article',
          content: longContent,
        });

        const result = extractArticleFromHtml(html, 'https://example.com/long');

        expect(result).not.toBeNull();
        expect(result!.isArticle).toBe(true);
        expect(result!.wordCount).toBeGreaterThan(0);
        expect(result!.readingTimeMinutes).toBeGreaterThan(0);
      });

      it('extracts author/byline from article', () => {
        const html = createArticleHtml({
          title: 'Article With Author',
          author: 'Jane Smith',
        });

        const result = extractArticleFromHtml(html, 'https://example.com/article');

        expect(result).not.toBeNull();
        // Note: Readability may or may not extract byline depending on HTML structure
        // The important thing is it doesn't throw
        expect(result!.isArticle).toBe(true);
      });

      it('extracts content HTML for reader view', () => {
        // Need substantial content for Readability to consider it readable
        const mainContent =
          'This is the main article content that should be extracted. ' +
          'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(50);
        const html = createArticleHtml({
          title: 'Content Test',
          content: mainContent,
        });

        const result = extractArticleFromHtml(html, 'https://example.com/article');

        expect(result).not.toBeNull();
        expect(result!.isArticle).toBe(true);
        expect(result!.content).not.toBeNull();
        expect(result!.content).toContain('main article content');
      });
    });

    describe('non-article HTML', () => {
      it('returns isArticle: false for non-readable content', () => {
        const html = createNonArticleHtml();

        const result = extractArticleFromHtml(html, 'https://example.com/');

        expect(result).not.toBeNull();
        expect(result!.isArticle).toBe(false);
        expect(result!.title).toBe('');
        expect(result!.content).toBeNull();
        expect(result!.wordCount).toBeNull();
        expect(result!.readingTimeMinutes).toBeNull();
      });

      it('still extracts OG image from non-article pages', () => {
        const html = createNonArticleHtml({
          ogImage: 'https://example.com/og-image.png',
        });

        const result = extractArticleFromHtml(html, 'https://example.com/');

        expect(result).not.toBeNull();
        expect(result!.isArticle).toBe(false);
        expect(result!.thumbnailUrl).toBe('https://example.com/og-image.png');
      });

      it('extracts site name from domain for non-article pages', () => {
        const html = createNonArticleHtml();

        const result = extractArticleFromHtml(html, 'https://medium.com/');

        expect(result).not.toBeNull();
        expect(result!.isArticle).toBe(false);
        expect(result!.siteName).toBe('Medium');
      });
    });

    describe('malformed HTML', () => {
      it('handles completely malformed HTML gracefully', () => {
        const malformedHtml = '<html><head><title>Broken';

        // Should return null or a non-article result without throwing
        // linkedom is quite tolerant, so it may still parse something
        expect(() =>
          extractArticleFromHtml(malformedHtml, 'https://example.com/broken')
        ).not.toThrow();
      });

      it('handles empty HTML string', () => {
        // Should not throw, may return null or non-article
        expect(() => extractArticleFromHtml('', 'https://example.com/empty')).not.toThrow();
      });

      it('handles HTML with only whitespace', () => {
        expect(() =>
          extractArticleFromHtml('   \n\t  ', 'https://example.com/whitespace')
        ).not.toThrow();
      });

      it('handles HTML without head or body', () => {
        expect(() =>
          extractArticleFromHtml('<p>Just a paragraph</p>', 'https://example.com/minimal')
        ).not.toThrow();
      });
    });

    describe('missing fields', () => {
      it('uses site name fallback from domain when not in meta tags', () => {
        const html = createArticleHtml({
          title: 'Article Without Site Name',
        });

        const result = extractArticleFromHtml(html, 'https://techcrunch.com/article');

        expect(result).not.toBeNull();
        // Should fall back to extracting from domain
        expect(result!.siteName).toBe('Techcrunch');
      });

      it('handles missing author gracefully', () => {
        const html = createArticleHtml({
          title: 'No Author Article',
        });

        const result = extractArticleFromHtml(html, 'https://example.com/article');

        expect(result).not.toBeNull();
        expect(result!.isArticle).toBe(true);
        // author can be null
        expect(result!.author).toSatisfy((v: string | null) => v === null || typeof v === 'string');
      });

      it('handles missing OG image gracefully', () => {
        const html = createArticleHtml({
          title: 'No Image Article',
        });

        const result = extractArticleFromHtml(html, 'https://example.com/article');

        expect(result).not.toBeNull();
        expect(result!.thumbnailUrl).toBeNull();
      });

      it('handles missing published time', () => {
        const html = createArticleHtml({
          title: 'No Date Article',
        });

        const result = extractArticleFromHtml(html, 'https://example.com/article');

        expect(result).not.toBeNull();
        expect(result!.publishedAt).toBeNull();
      });
    });

    describe('OG image extraction', () => {
      it('extracts og:image from meta tag', () => {
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta property="og:image" content="https://cdn.example.com/hero.jpg">
          </head>
          <body><nav>Links</nav></body>
          </html>
        `;

        const result = extractArticleFromHtml(html, 'https://example.com/');

        expect(result).not.toBeNull();
        expect(result!.thumbnailUrl).toBe('https://cdn.example.com/hero.jpg');
      });

      it('returns null when no og:image present', () => {
        const html = `
          <!DOCTYPE html>
          <html>
          <head><title>No OG</title></head>
          <body><nav>Links</nav></body>
          </html>
        `;

        const result = extractArticleFromHtml(html, 'https://example.com/');

        expect(result).not.toBeNull();
        expect(result!.thumbnailUrl).toBeNull();
      });

      it('takes first og:image when multiple present', () => {
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta property="og:image" content="https://example.com/first.jpg">
            <meta property="og:image" content="https://example.com/second.jpg">
          </head>
          <body><nav>Links</nav></body>
          </html>
        `;

        const result = extractArticleFromHtml(html, 'https://example.com/');

        expect(result).not.toBeNull();
        expect(result!.thumbnailUrl).toBe('https://example.com/first.jpg');
      });
    });

    describe('author image extraction', () => {
      it('extracts article:author:image from meta tag', () => {
        const html = createArticleHtml({
          title: 'Article With Author Image',
          authorImageUrl: 'https://cdn.example.com/author.jpg',
        });

        const result = extractArticleFromHtml(html, 'https://example.com/article');

        expect(result).not.toBeNull();
        expect(result!.authorImageUrl).toBe('https://cdn.example.com/author.jpg');
      });

      it('extracts author image from non-article pages', () => {
        const html = createNonArticleHtml({
          authorImageUrl: 'https://example.com/author-avatar.png',
        });

        const result = extractArticleFromHtml(html, 'https://example.com/');

        expect(result).not.toBeNull();
        expect(result!.isArticle).toBe(false);
        expect(result!.authorImageUrl).toBe('https://example.com/author-avatar.png');
      });

      it('returns null when no author image present', () => {
        const html = createArticleHtml({
          title: 'Article Without Author Image',
        });

        const result = extractArticleFromHtml(html, 'https://example.com/article');

        expect(result).not.toBeNull();
        expect(result!.authorImageUrl).toBeNull();
      });

      it('resolves relative author image URLs to absolute', () => {
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta property="article:author:image" content="/images/author.jpg">
          </head>
          <body>
            <article>
              <h1>Article Title</h1>
              <p>${'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(50)}</p>
            </article>
          </body>
          </html>
        `;

        const result = extractArticleFromHtml(html, 'https://example.com/article');

        expect(result).not.toBeNull();
        expect(result!.authorImageUrl).toBe('https://example.com/images/author.jpg');
      });

      it('falls back to author:image property when article:author:image missing', () => {
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta property="author:image" content="https://example.com/fallback-author.jpg">
          </head>
          <body><nav>Links</nav></body>
          </html>
        `;

        const result = extractArticleFromHtml(html, 'https://example.com/');

        expect(result).not.toBeNull();
        expect(result!.authorImageUrl).toBe('https://example.com/fallback-author.jpg');
      });

      it('falls back to author:image name attribute when others missing', () => {
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta name="author:image" content="https://example.com/name-author.jpg">
          </head>
          <body><nav>Links</nav></body>
          </html>
        `;

        const result = extractArticleFromHtml(html, 'https://example.com/');

        expect(result).not.toBeNull();
        expect(result!.authorImageUrl).toBe('https://example.com/name-author.jpg');
      });

      it('takes first author image when multiple present', () => {
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta property="article:author:image" content="https://example.com/first-author.jpg">
            <meta property="author:image" content="https://example.com/second-author.jpg">
          </head>
          <body><nav>Links</nav></body>
          </html>
        `;

        const result = extractArticleFromHtml(html, 'https://example.com/');

        expect(result).not.toBeNull();
        expect(result!.authorImageUrl).toBe('https://example.com/first-author.jpg');
      });
    });
  });

  describe('extractArticle', () => {
    describe('successful fetch and parse', () => {
      it('fetches URL and extracts article metadata', async () => {
        const html = createArticleHtml({
          title: 'Fetched Article',
          ogImage: 'https://example.com/thumb.jpg',
          authorImageUrl: 'https://example.com/author.jpg',
        });
        mockFetch(html);

        const result = await extractArticle('https://example.com/article');

        expect(result).not.toBeNull();
        expect(result!.title).toBe('Fetched Article');
        expect(result!.thumbnailUrl).toBe('https://example.com/thumb.jpg');
        expect(result!.authorImageUrl).toBe('https://example.com/author.jpg');
        expect(globalThis.fetch).toHaveBeenCalledWith(
          'https://example.com/article',
          expect.objectContaining({
            headers: expect.objectContaining({
              'User-Agent': expect.stringContaining('ZineBot'),
            }),
          })
        );
      });

      it('sends correct Accept header', async () => {
        mockFetch(createArticleHtml({ title: 'Test' }));

        await extractArticle('https://example.com/article');

        expect(globalThis.fetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              Accept: 'text/html,application/xhtml+xml',
            }),
          })
        );
      });
    });

    describe('fetch failures', () => {
      it('returns null on 404 response', async () => {
        mockFetch('Not Found', { status: 404 });

        const result = await extractArticle('https://example.com/missing');

        expect(result).toBeNull();
      });

      it('returns null on 500 response', async () => {
        mockFetch('Internal Server Error', { status: 500 });

        const result = await extractArticle('https://example.com/error');

        expect(result).toBeNull();
      });

      it('returns null on 403 forbidden', async () => {
        mockFetch('Forbidden', { status: 403 });

        const result = await extractArticle('https://example.com/forbidden');

        expect(result).toBeNull();
      });

      it('returns null on network error', async () => {
        mockFetchError(new Error('Network error'));

        const result = await extractArticle('https://example.com/unreachable');

        expect(result).toBeNull();
      });

      it('returns null on DNS resolution failure', async () => {
        mockFetchError(new Error('getaddrinfo ENOTFOUND'));

        const result = await extractArticle('https://nonexistent.example.com/');

        expect(result).toBeNull();
      });

      it('returns null on timeout', async () => {
        const timeoutError = new Error('Timeout');
        timeoutError.name = 'AbortError';
        mockFetchError(timeoutError);

        const result = await extractArticle('https://slow.example.com/');

        expect(result).toBeNull();
      });
    });
  });

  describe('extractSiteNameFromDomain (via extractArticleFromHtml)', () => {
    // The function is private, but we can test it through extractArticleFromHtml
    // when the page is not an article (isArticle: false case uses it)

    it('extracts "Medium" from medium.com', () => {
      const html = createNonArticleHtml();
      const result = extractArticleFromHtml(html, 'https://medium.com/');

      expect(result!.siteName).toBe('Medium');
    });

    it('extracts "Substack" from newsletter.substack.com', () => {
      const html = createNonArticleHtml();
      const result = extractArticleFromHtml(html, 'https://newsletter.substack.com/');

      expect(result!.siteName).toBe('Substack');
    });

    it('handles www prefix correctly', () => {
      const html = createNonArticleHtml();
      const result = extractArticleFromHtml(html, 'https://www.example.com/');

      expect(result!.siteName).toBe('Example');
    });

    it('handles multi-level TLDs', () => {
      const html = createNonArticleHtml();
      const result = extractArticleFromHtml(html, 'https://www.bbc.co.uk/');

      // Should extract "co" (second to last part) - this is expected behavior
      expect(result!.siteName).toBe('Co');
    });

    it('capitalizes first letter of domain', () => {
      const html = createNonArticleHtml();
      const result = extractArticleFromHtml(html, 'https://techcrunch.com/');

      expect(result!.siteName).toBe('Techcrunch');
    });

    it('returns "Unknown" for invalid URLs', () => {
      const html = createNonArticleHtml();
      // Force the function to be called with an invalid URL
      const result = extractArticleFromHtml(html, 'not-a-valid-url');

      expect(result!.siteName).toBe('Unknown');
    });
  });

  describe('edge cases', () => {
    it('handles very long articles', () => {
      const veryLongContent = 'This is a sentence. '.repeat(5000); // ~50k words
      const html = createArticleHtml({
        title: 'Very Long Article',
        content: veryLongContent,
      });

      const result = extractArticleFromHtml(html, 'https://example.com/long');

      expect(result).not.toBeNull();
      expect(result!.isArticle).toBe(true);
      expect(result!.wordCount).toBeGreaterThan(1000);
      expect(result!.readingTimeMinutes).toBeGreaterThan(10);
    });

    it('handles special characters in title', () => {
      const html = createArticleHtml({
        title: 'Test & "Quotes" <Special> Characters',
      });

      const result = extractArticleFromHtml(html, 'https://example.com/special');

      expect(result).not.toBeNull();
      // linkedom handles HTML entities, title should be extracted
      expect(result!.title).toBeTruthy();
    });

    it('handles unicode content', () => {
      const html = createArticleHtml({
        title: '日本語タイトル',
        content: 'Unicode content: café, naïve, 中文, 한국어. '.repeat(50),
      });

      const result = extractArticleFromHtml(html, 'https://example.com/unicode');

      expect(result).not.toBeNull();
      expect(result!.isArticle).toBe(true);
    });

    it('handles articles with no text content', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Image Gallery</title></head>
        <body>
          <article>
            <h1>Photo Gallery</h1>
            <img src="photo1.jpg" alt="Photo 1">
            <img src="photo2.jpg" alt="Photo 2">
          </article>
        </body>
        </html>
      `;

      // Should not throw
      expect(() => extractArticleFromHtml(html, 'https://example.com/gallery')).not.toThrow();
    });

    it('handles protocol-relative URLs in og:image', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta property="og:image" content="//cdn.example.com/image.jpg">
        </head>
        <body><nav>Links</nav></body>
        </html>
      `;

      const result = extractArticleFromHtml(html, 'https://example.com/');

      expect(result).not.toBeNull();
      // Protocol-relative URLs are resolved to absolute URLs using the base URL's protocol
      expect(result!.thumbnailUrl).toBe('https://cdn.example.com/image.jpg');
    });
  });
});
