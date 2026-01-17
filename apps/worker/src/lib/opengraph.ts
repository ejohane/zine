/**
 * Open Graph Metadata Scraper
 *
 * Extracts Open Graph metadata from arbitrary URLs using Cloudflare's HTMLRewriter.
 * Used as a fallback when provider APIs and oEmbed aren't available for manual link saving.
 *
 * Priority order for extraction:
 * 1. og:* meta tags (Open Graph)
 * 2. article:* meta tags
 * 3. Standard meta tags (description, author)
 * 4. title tag
 *
 * @example
 * ```typescript
 * const data = await scrapeOpenGraph('https://example.com/article');
 * console.log(data.title);    // "Article Title"
 * console.log(data.image);    // "https://example.com/og-image.jpg"
 * ```
 */

import { logger } from './logger';

const ogLogger = logger.child('opengraph');

// ============================================================================
// Types
// ============================================================================

/**
 * Extracted Open Graph metadata from a URL
 */
export interface OpenGraphData {
  /** Page title from og:title or <title> tag */
  title: string | null;
  /** Page description from og:description or meta description */
  description: string | null;
  /** Image URL from og:image (resolved to absolute URL) */
  image: string | null;
  /** Site name from og:site_name */
  siteName: string | null;
  /** Canonical URL from og:url */
  url: string | null;
  /** Content type from og:type (e.g., "article", "website") */
  type: string | null;
  /** Author from article:author or meta author */
  author: string | null;
  /** Author image URL from article:author:image or author:image (resolved to absolute URL) */
  authorImageUrl: string | null;
}

/**
 * Configuration options for scraping
 */
export interface ScrapeOptions {
  /** Timeout in milliseconds (default: 10000) */
  timeout?: number;
  /** User-Agent header to send (default: Zine bot UA) */
  userAgent?: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_TIMEOUT = 10000; // 10 seconds
const DEFAULT_USER_AGENT = 'ZineBot/1.0 (+https://zine.app/bot; compatible; link-preview)';

// ============================================================================
// Implementation
// ============================================================================

/**
 * Create an empty OpenGraphData object with all null values
 */
function createEmptyResult(): OpenGraphData {
  return {
    title: null,
    description: null,
    image: null,
    siteName: null,
    url: null,
    type: null,
    author: null,
    authorImageUrl: null,
  };
}

/**
 * Resolve a potentially relative URL to an absolute URL
 *
 * @param urlString - URL string that may be relative
 * @param baseUrl - Base URL to resolve against
 * @returns Absolute URL string, or null if invalid
 */
function resolveUrl(urlString: string | null, baseUrl: string): string | null {
  if (!urlString) return null;

  try {
    // If it's already absolute, return as-is
    if (urlString.startsWith('http://') || urlString.startsWith('https://')) {
      return urlString;
    }

    // Resolve relative URL against base
    const resolved = new URL(urlString, baseUrl);
    return resolved.href;
  } catch {
    ogLogger.warn('Failed to resolve URL', { urlString, baseUrl });
    return null;
  }
}

/**
 * Scrape Open Graph metadata from a URL
 *
 * Uses Cloudflare's HTMLRewriter for streaming HTML parsing.
 * Falls back to standard meta tags and title tag when OG tags are missing.
 *
 * @param url - URL to scrape
 * @param options - Optional configuration
 * @returns Extracted metadata (partial data on errors)
 *
 * @example
 * ```typescript
 * const data = await scrapeOpenGraph('https://example.com/article');
 * if (data.title) {
 *   console.log(`Found: ${data.title}`);
 * }
 * ```
 */
export async function scrapeOpenGraph(
  url: string,
  options: ScrapeOptions = {}
): Promise<OpenGraphData> {
  const { timeout = DEFAULT_TIMEOUT, userAgent = DEFAULT_USER_AGENT } = options;

  const result = createEmptyResult();

  // Track title text chunks (title tag content comes in chunks)
  let titleChunks: string[] = [];
  let inTitleTag = false;

  try {
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    ogLogger.debug('Fetching URL for OG scrape', { url, timeout });

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      ogLogger.warn('Failed to fetch URL', { url, status: response.status });
      return result;
    }

    // Check content type - only parse HTML
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      ogLogger.debug('Non-HTML content type, skipping parse', { url, contentType });
      return result;
    }

    // Create HTMLRewriter with handlers for all relevant tags
    const rewriter = new HTMLRewriter()
      // Open Graph meta tags (property attribute)
      .on('meta[property="og:title"]', {
        element(el) {
          const content = el.getAttribute('content');
          if (content) result.title = content;
        },
      })
      .on('meta[property="og:description"]', {
        element(el) {
          const content = el.getAttribute('content');
          if (content) result.description = content;
        },
      })
      .on('meta[property="og:image"]', {
        element(el) {
          const content = el.getAttribute('content');
          if (content && !result.image) result.image = content;
        },
      })
      .on('meta[property="og:site_name"]', {
        element(el) {
          const content = el.getAttribute('content');
          if (content) result.siteName = content;
        },
      })
      .on('meta[property="og:url"]', {
        element(el) {
          const content = el.getAttribute('content');
          if (content) result.url = content;
        },
      })
      .on('meta[property="og:type"]', {
        element(el) {
          const content = el.getAttribute('content');
          if (content) result.type = content;
        },
      })
      // Article author (Open Graph extension)
      .on('meta[property="article:author"]', {
        element(el) {
          const content = el.getAttribute('content');
          if (content) result.author = content;
        },
      })
      // Article author image (Open Graph extension)
      .on('meta[property="article:author:image"]', {
        element(el) {
          const content = el.getAttribute('content');
          if (content && !result.authorImageUrl) result.authorImageUrl = content;
        },
      })
      // Fallback: author:image with property attribute
      .on('meta[property="author:image"]', {
        element(el) {
          const content = el.getAttribute('content');
          if (content && !result.authorImageUrl) result.authorImageUrl = content;
        },
      })
      // Fallback: standard meta tags (name attribute)
      .on('meta[name="description"]', {
        element(el) {
          if (!result.description) {
            const content = el.getAttribute('content');
            if (content) result.description = content;
          }
        },
      })
      .on('meta[name="author"]', {
        element(el) {
          if (!result.author) {
            const content = el.getAttribute('content');
            if (content) result.author = content;
          }
        },
      })
      // Fallback: author:image with name attribute
      .on('meta[name="author:image"]', {
        element(el) {
          if (!result.authorImageUrl) {
            const content = el.getAttribute('content');
            if (content) result.authorImageUrl = content;
          }
        },
      })
      // Fallback: title tag
      .on('title', {
        element() {
          inTitleTag = true;
          titleChunks = [];
        },
        text(text) {
          if (inTitleTag) {
            titleChunks.push(text.text);
            if (text.lastInTextNode) {
              inTitleTag = false;
            }
          }
        },
      });

    // Process the response through HTMLRewriter
    // We need to consume the transformed response to trigger the handlers
    await rewriter.transform(response).text();

    // Use title tag as fallback if no og:title
    if (!result.title && titleChunks.length > 0) {
      result.title = titleChunks.join('').trim();
    }

    // Resolve relative image URLs
    result.image = resolveUrl(result.image, url);
    result.authorImageUrl = resolveUrl(result.authorImageUrl, url);

    ogLogger.debug('OG scrape complete', {
      url,
      hasTitle: !!result.title,
      hasDescription: !!result.description,
      hasImage: !!result.image,
      hasAuthorImageUrl: !!result.authorImageUrl,
    });

    return result;
  } catch (error) {
    // Handle abort/timeout
    if (error instanceof Error && error.name === 'AbortError') {
      ogLogger.warn('OG scrape timed out', { url, timeout });
      return result;
    }

    // Log and return partial data
    ogLogger.error('OG scrape failed', { url, error });
    return result;
  }
}
