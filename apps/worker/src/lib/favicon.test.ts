/**
 * Tests for Favicon Fetching Utility
 *
 * Tests favicon discovery from HTML link tags and fallback to /favicon.ico.
 * Uses mock fetch to simulate various HTML responses and HEAD request validations.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchFavicon } from './favicon';

// ============================================================================
// Test HTML Templates
// ============================================================================

/**
 * Generate HTML with favicon link tags
 */
function createHtmlWithFavicons(
  links: Array<{ rel: string; href: string }>,
  extras?: string
): string {
  const linkTags = links
    .map((link) => `<link rel="${link.rel}" href="${link.href}">`)
    .join('\n      ');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Test Page</title>
      ${linkTags}
      ${extras || ''}
    </head>
    <body><p>Content</p></body>
    </html>
  `;
}

/**
 * Generate HTML with no favicon links
 */
function createHtmlWithoutFavicons(): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Test Page</title>
      <meta name="description" content="A page without favicons">
    </head>
    <body><p>Content</p></body>
    </html>
  `;
}

// ============================================================================
// Mock Fetch Setup
// ============================================================================

const originalFetch = globalThis.fetch;

/**
 * Simple mock for a single page that returns HTML and validates favicons
 */
function mockFetchSimple(
  html: string,
  validFaviconUrls: string[] = [],
  options?: { status?: number; contentType?: string }
): void {
  const { status = 200, contentType = 'text/html; charset=utf-8' } = options || {};

  globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    // For HEAD requests to validate favicons
    if (init?.method === 'HEAD') {
      const urlStr = url.toString();
      const isValid = validFaviconUrls.some((valid) => urlStr.includes(valid));

      if (isValid) {
        return new Response(null, {
          status: 200,
          headers: { 'Content-Type': 'image/x-icon' },
        });
      }

      return new Response(null, {
        status: 404,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // For GET requests (fetching the page)
    return new Response(html, {
      status,
      headers: { 'Content-Type': contentType },
    });
  });
}

function mockFetchError(error: Error): void {
  globalThis.fetch = vi.fn().mockRejectedValue(error);
}

// ============================================================================
// Tests
// ============================================================================

describe('fetchFavicon', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  describe('HTML link tag extraction', () => {
    it('should extract favicon from rel="icon"', async () => {
      const html = createHtmlWithFavicons([{ rel: 'icon', href: '/favicon.png' }]);

      mockFetchSimple(html, ['favicon.png']);

      const result = await fetchFavicon('https://example.com/page');

      expect(result).toBe('https://example.com/favicon.png');
    });

    it('should extract favicon from rel="shortcut icon"', async () => {
      const html = createHtmlWithFavicons([{ rel: 'shortcut icon', href: '/favicon.ico' }]);

      mockFetchSimple(html, ['favicon.ico']);

      const result = await fetchFavicon('https://example.com/page');

      expect(result).toBe('https://example.com/favicon.ico');
    });

    it('should extract favicon from rel="apple-touch-icon"', async () => {
      const html = createHtmlWithFavicons([{ rel: 'apple-touch-icon', href: '/apple-icon.png' }]);

      mockFetchSimple(html, ['apple-icon.png']);

      const result = await fetchFavicon('https://example.com/page');

      expect(result).toBe('https://example.com/apple-icon.png');
    });

    it('should prefer apple-touch-icon over regular icon (higher quality)', async () => {
      const html = createHtmlWithFavicons([
        { rel: 'icon', href: '/favicon.png' },
        { rel: 'apple-touch-icon', href: '/apple-icon.png' },
      ]);

      mockFetchSimple(html, ['apple-icon.png', 'favicon.png']);

      const result = await fetchFavicon('https://example.com/page');

      expect(result).toBe('https://example.com/apple-icon.png');
    });

    it('should return first valid favicon if higher priority fails validation', async () => {
      const html = createHtmlWithFavicons([
        { rel: 'apple-touch-icon', href: '/apple-icon.png' },
        { rel: 'icon', href: '/favicon.png' },
      ]);

      // Only the regular icon is valid
      mockFetchSimple(html, ['favicon.png']);

      const result = await fetchFavicon('https://example.com/page');

      expect(result).toBe('https://example.com/favicon.png');
    });
  });

  describe('URL resolution', () => {
    it('should resolve relative URLs', async () => {
      const html = createHtmlWithFavicons([{ rel: 'icon', href: '/images/favicon.png' }]);

      mockFetchSimple(html, ['images/favicon.png']);

      const result = await fetchFavicon('https://example.com/articles/some-article');

      expect(result).toBe('https://example.com/images/favicon.png');
    });

    it('should handle protocol-relative URLs', async () => {
      const html = createHtmlWithFavicons([{ rel: 'icon', href: '//cdn.example.com/favicon.png' }]);

      mockFetchSimple(html, ['cdn.example.com/favicon.png']);

      const result = await fetchFavicon('https://example.com/page');

      expect(result).toBe('https://cdn.example.com/favicon.png');
    });

    it('should preserve absolute URLs', async () => {
      const html = createHtmlWithFavicons([
        { rel: 'icon', href: 'https://cdn.other.com/favicon.ico' },
      ]);

      mockFetchSimple(html, ['cdn.other.com/favicon.ico']);

      const result = await fetchFavicon('https://example.com/page');

      expect(result).toBe('https://cdn.other.com/favicon.ico');
    });

    it('should handle relative URLs without leading slash', async () => {
      const html = createHtmlWithFavicons([{ rel: 'icon', href: 'assets/favicon.png' }]);

      mockFetchSimple(html, ['assets/favicon.png']);

      const result = await fetchFavicon('https://example.com/articles/page');

      // Should resolve relative to the page URL
      expect(result).toBe('https://example.com/articles/assets/favicon.png');
    });
  });

  describe('Fallback to /favicon.ico', () => {
    it('should fall back to /favicon.ico when no link tags found', async () => {
      const html = createHtmlWithoutFavicons();

      mockFetchSimple(html, ['favicon.ico']);

      const result = await fetchFavicon('https://example.com/page');

      expect(result).toBe('https://example.com/favicon.ico');
    });

    it('should fall back to /favicon.ico when link tags are invalid', async () => {
      const html = createHtmlWithFavicons([{ rel: 'icon', href: '/invalid-icon.png' }]);

      // Only favicon.ico is valid, not the link tag href
      mockFetchSimple(html, ['favicon.ico']);

      const result = await fetchFavicon('https://example.com/page');

      expect(result).toBe('https://example.com/favicon.ico');
    });

    it('should return null when fallback /favicon.ico does not exist', async () => {
      const html = createHtmlWithoutFavicons();

      mockFetchSimple(html, []); // No valid favicon URLs

      const result = await fetchFavicon('https://example.com/page');

      expect(result).toBeNull();
    });
  });

  describe('HEAD request validation', () => {
    it('should validate favicon URLs with HEAD request', async () => {
      const html = createHtmlWithFavicons([{ rel: 'icon', href: '/favicon.png' }]);

      mockFetchSimple(html, ['favicon.png']);

      await fetchFavicon('https://example.com/page');

      // Should have called fetch with HEAD method for validation
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('favicon.png'),
        expect.objectContaining({ method: 'HEAD' })
      );
    });

    it('should reject favicon if HEAD returns non-2xx status', async () => {
      const html = createHtmlWithFavicons([{ rel: 'icon', href: '/favicon.png' }]);

      // No valid URLs - HEAD will return 404 for everything
      mockFetchSimple(html, []);

      const result = await fetchFavicon('https://example.com/page');

      expect(result).toBeNull();
    });

    it('should accept favicon with image content type', async () => {
      const html = createHtmlWithFavicons([{ rel: 'icon', href: '/favicon.svg' }]);

      globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (init?.method === 'HEAD') {
          return new Response(null, {
            status: 200,
            headers: { 'Content-Type': 'image/svg+xml' },
          });
        }
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      });

      const result = await fetchFavicon('https://example.com/page');

      expect(result).toBe('https://example.com/favicon.svg');
    });
  });

  describe('Error handling', () => {
    it('should return null for invalid input URL', async () => {
      const result = await fetchFavicon('not a valid url');

      expect(result).toBeNull();
    });

    it('should handle page fetch errors gracefully', async () => {
      mockFetchError(new Error('Network error'));

      const result = await fetchFavicon('https://example.com/page');

      // Should return null on error
      expect(result).toBeNull();
    });

    it('should handle non-HTML responses', async () => {
      mockFetchSimple('{"data": "json"}', ['favicon.ico'], {
        contentType: 'application/json',
      });

      const result = await fetchFavicon('https://example.com/api');

      // Should still try fallback favicon.ico
      expect(result).toBe('https://example.com/favicon.ico');
    });

    it('should handle HTTP error status on page fetch', async () => {
      mockFetchSimple('Not Found', ['favicon.ico'], { status: 404 });

      const result = await fetchFavicon('https://example.com/missing');

      // Should still try fallback favicon.ico
      expect(result).toBe('https://example.com/favicon.ico');
    });

    it('should handle timeout gracefully', async () => {
      // Use real timers for this test since we need actual timeout behavior
      vi.useRealTimers();

      // Create a fetch that times out for GET but works for HEAD
      globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'HEAD') {
          return new Response(null, {
            status: 200,
            headers: { 'Content-Type': 'image/x-icon' },
          });
        }

        // Simulate abort - the abort controller will trigger this
        const error = new Error('Aborted');
        error.name = 'AbortError';
        throw error;
      });

      const result = await fetchFavicon('https://slow.example.com/page', {
        timeout: 50,
      });

      // Should still try fallback after timeout/abort
      expect(result).toBe('https://slow.example.com/favicon.ico');

      // Restore fake timers for other tests
      vi.useFakeTimers();
    });
  });

  describe('Request options', () => {
    it('should use default timeout', async () => {
      const html = createHtmlWithFavicons([{ rel: 'icon', href: '/favicon.png' }]);
      mockFetchSimple(html, ['favicon.png']);

      // Not passing timeout option should use default (5000ms)
      await fetchFavicon('https://example.com/page');

      // Just verify it completes without timeout issues
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    it('should use custom timeout', async () => {
      const html = createHtmlWithFavicons([{ rel: 'icon', href: '/favicon.png' }]);
      mockFetchSimple(html, ['favicon.png']);

      await fetchFavicon('https://example.com/page', { timeout: 1000 });

      expect(globalThis.fetch).toHaveBeenCalled();
    });

    it('should use default User-Agent', async () => {
      const html = createHtmlWithFavicons([{ rel: 'icon', href: '/favicon.png' }]);
      mockFetchSimple(html, ['favicon.png']);

      await fetchFavicon('https://example.com/page');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://example.com/page',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': expect.stringContaining('ZineBot'),
          }),
        })
      );
    });

    it('should use custom User-Agent', async () => {
      const html = createHtmlWithFavicons([{ rel: 'icon', href: '/favicon.png' }]);
      mockFetchSimple(html, ['favicon.png']);

      await fetchFavicon('https://example.com/page', {
        userAgent: 'CustomBot/2.0',
      });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://example.com/page',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'CustomBot/2.0',
          }),
        })
      );
    });
  });

  describe('Edge cases', () => {
    it('should handle empty HTML', async () => {
      mockFetchSimple('<html></html>', ['favicon.ico']);

      const result = await fetchFavicon('https://example.com/empty');

      expect(result).toBe('https://example.com/favicon.ico');
    });

    it('should handle HTML without head', async () => {
      mockFetchSimple('<html><body></body></html>', ['favicon.ico']);

      const result = await fetchFavicon('https://example.com/nohead');

      expect(result).toBe('https://example.com/favicon.ico');
    });

    it('should handle malformed HTML gracefully', async () => {
      mockFetchSimple('<html><head><link rel="icon" href="/ok.png"><title>', ['ok.png']);

      const result = await fetchFavicon('https://example.com/malformed');

      expect(result).toBe('https://example.com/ok.png');
    });

    it('should handle multiple icon link tags', async () => {
      const html = createHtmlWithFavicons([
        { rel: 'icon', href: '/first.png' },
        { rel: 'icon', href: '/second.png' },
        { rel: 'icon', href: '/third.png' },
      ]);

      mockFetchSimple(html, ['first.png', 'second.png', 'third.png']);

      const result = await fetchFavicon('https://example.com/multi');

      // Should return first valid one (all have same priority)
      expect(result).toBe('https://example.com/first.png');
    });

    it('should handle XHTML content type', async () => {
      const html = createHtmlWithFavicons([{ rel: 'icon', href: '/xhtml-icon.png' }]);

      mockFetchSimple(html, ['xhtml-icon.png'], {
        contentType: 'application/xhtml+xml',
      });

      const result = await fetchFavicon('https://example.com/xhtml');

      expect(result).toBe('https://example.com/xhtml-icon.png');
    });

    it('should handle link tag with empty href', async () => {
      const html = createHtmlWithFavicons([
        { rel: 'icon', href: '' },
        { rel: 'shortcut icon', href: '/valid.ico' },
      ]);

      mockFetchSimple(html, ['valid.ico']);

      const result = await fetchFavicon('https://example.com/empty-href');

      expect(result).toBe('https://example.com/valid.ico');
    });

    it('should handle deeply nested article URLs', async () => {
      const html = createHtmlWithFavicons([{ rel: 'icon', href: '/favicon.png' }]);

      mockFetchSimple(html, ['favicon.png']);

      const result = await fetchFavicon('https://example.com/2024/01/15/category/article-title');

      expect(result).toBe('https://example.com/favicon.png');
    });
  });
});
