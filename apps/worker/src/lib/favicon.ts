/**
 * Favicon Fetching Utility
 *
 * Fetches website favicons as a fallback for author images. Provides a universal
 * visual identity for any web article regardless of whether the author has a profile image.
 *
 * Favicon Discovery Strategy (ordered by quality):
 * 1. HTML link tags:
 *    - `<link rel="icon" href="/custom-icon.png">`
 *    - `<link rel="shortcut icon" href="/favicon.ico">`
 *    - `<link rel="apple-touch-icon" href="/apple-icon.png">` (usually higher res)
 * 2. Standard location fallback:
 *    - `{origin}/favicon.ico` - The de facto standard location
 *
 * @example
 * ```typescript
 * import { fetchFavicon } from './favicon';
 *
 * // Get favicon for Medium
 * const favicon = await fetchFavicon('https://medium.com/some-article');
 * // Returns: "https://cdn-static-1.medium.com/_/fp/icons/favicon.ico"
 *
 * // Get favicon for random site
 * const favicon = await fetchFavicon('https://example.com/article');
 * // Returns: "https://example.com/favicon.ico" or null
 * ```
 */

import { logger } from './logger';

const faviconLogger = logger.child('favicon');

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration options for favicon fetching
 */
export interface FaviconOptions {
  /** Timeout in milliseconds (default: 5000) */
  timeout?: number;
  /** User-Agent header to send (default: Zine bot UA) */
  userAgent?: string;
}

/**
 * Internal type for tracking favicon candidates during HTML parsing
 */
interface FaviconCandidate {
  /** The href attribute value */
  href: string;
  /** The rel attribute value */
  rel: string;
  /** Priority for sorting (lower is better) */
  priority: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_TIMEOUT = 5000; // 5 seconds
const DEFAULT_USER_AGENT = 'ZineBot/1.0 (+https://zine.app/bot; compatible; link-preview)';

/**
 * Priority mapping for different rel values.
 * Lower number = higher priority.
 * Apple touch icons are usually higher resolution.
 */
const REL_PRIORITY: Record<string, number> = {
  'apple-touch-icon': 1,
  'apple-touch-icon-precomposed': 2,
  icon: 3,
  'shortcut icon': 4,
};

// ============================================================================
// Implementation
// ============================================================================

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
    // Handle protocol-relative URLs (e.g., //cdn.example.com/favicon.ico)
    if (urlString.startsWith('//')) {
      const base = new URL(baseUrl);
      return `${base.protocol}${urlString}`;
    }

    // If it's already absolute, return as-is
    if (urlString.startsWith('http://') || urlString.startsWith('https://')) {
      return urlString;
    }

    // Resolve relative URL against base
    const resolved = new URL(urlString, baseUrl);
    return resolved.href;
  } catch {
    faviconLogger.warn('Failed to resolve favicon URL', { urlString, baseUrl });
    return null;
  }
}

/**
 * Validate that a favicon URL exists using a HEAD request
 *
 * @param url - Absolute URL to validate
 * @param timeout - Request timeout in milliseconds
 * @param userAgent - User-Agent header value
 * @returns true if the URL returns a successful response
 */
async function validateFaviconUrl(
  url: string,
  timeout: number,
  userAgent: string
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': userAgent,
      },
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    // Check for successful response and valid content type
    if (!response.ok) {
      faviconLogger.debug('Favicon validation failed: non-2xx status', {
        url,
        status: response.status,
      });
      return false;
    }

    // Verify content type is an image (optional, some servers don't send it for HEAD)
    const contentType = response.headers.get('content-type');
    if (contentType && !contentType.startsWith('image/') && !contentType.includes('icon')) {
      faviconLogger.debug('Favicon validation failed: non-image content type', {
        url,
        contentType,
      });
      return false;
    }

    return true;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      faviconLogger.debug('Favicon validation timed out', { url });
    } else {
      faviconLogger.debug('Favicon validation error', { url, error });
    }
    return false;
  }
}

/**
 * Parse HTML to extract favicon link tags using HTMLRewriter
 *
 * @param response - Fetch response with HTML content
 * @returns Array of favicon candidates found in the HTML
 */
async function parseFaviconLinks(response: Response): Promise<FaviconCandidate[]> {
  const candidates: FaviconCandidate[] = [];

  const rewriter = new HTMLRewriter()
    // Match link tags with rel containing "icon"
    .on('link[rel*="icon"]', {
      element(el) {
        const href = el.getAttribute('href');
        const rel = el.getAttribute('rel')?.toLowerCase() || '';

        if (href) {
          // Determine priority based on rel value
          let priority = 10; // Default low priority
          for (const [relKey, p] of Object.entries(REL_PRIORITY)) {
            if (rel.includes(relKey)) {
              priority = Math.min(priority, p);
            }
          }

          candidates.push({ href, rel, priority });
        }
      },
    });

  // Process the response through HTMLRewriter
  await rewriter.transform(response).text();

  // Sort by priority (lower is better)
  return candidates.sort((a, b) => a.priority - b.priority);
}

/**
 * Fetch the favicon URL for a given webpage URL
 *
 * Algorithm:
 * 1. Parse the URL to get the origin
 * 2. Fetch the page HTML (with timeout)
 * 3. Parse HTML to find favicon link tags
 * 4. For each candidate URL:
 *    - Resolve relative URLs to absolute
 *    - Validate the URL exists with a HEAD request
 *    - Return the first valid URL
 * 5. If no link tags found, try `{origin}/favicon.ico`
 * 6. Validate with HEAD request
 * 7. Return URL or null
 *
 * @param url - URL of the webpage to fetch favicon for
 * @param options - Optional configuration
 * @returns Absolute URL of the favicon, or null if not found
 *
 * @example
 * ```typescript
 * const favicon = await fetchFavicon('https://example.com/article');
 * if (favicon) {
 *   console.log(`Favicon: ${favicon}`);
 * }
 * ```
 */
export async function fetchFavicon(
  url: string,
  options: FaviconOptions = {}
): Promise<string | null> {
  const { timeout = DEFAULT_TIMEOUT, userAgent = DEFAULT_USER_AGENT } = options;

  let origin: string;
  try {
    const parsedUrl = new URL(url);
    origin = parsedUrl.origin;
  } catch {
    faviconLogger.warn('Invalid URL provided', { url });
    return null;
  }

  try {
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    faviconLogger.debug('Fetching page for favicon discovery', { url, timeout });

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
      faviconLogger.warn('Failed to fetch page for favicon discovery', {
        url,
        status: response.status,
      });
      // Fall through to try default favicon.ico
    } else {
      // Check content type - only parse HTML
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
        // Parse the HTML for favicon links
        const candidates = await parseFaviconLinks(response);

        faviconLogger.debug('Found favicon candidates', {
          url,
          count: candidates.length,
        });

        // Try each candidate in priority order
        for (const candidate of candidates) {
          const resolvedUrl = resolveUrl(candidate.href, url);
          if (!resolvedUrl) continue;

          faviconLogger.debug('Validating favicon candidate', {
            href: candidate.href,
            resolved: resolvedUrl,
            rel: candidate.rel,
          });

          const isValid = await validateFaviconUrl(resolvedUrl, timeout, userAgent);
          if (isValid) {
            faviconLogger.debug('Found valid favicon', { url, favicon: resolvedUrl });
            return resolvedUrl;
          }
        }
      }
    }

    // Fallback: try the standard /favicon.ico location
    const fallbackUrl = `${origin}/favicon.ico`;
    faviconLogger.debug('Trying fallback favicon.ico', { url, fallbackUrl });

    const isValid = await validateFaviconUrl(fallbackUrl, timeout, userAgent);
    if (isValid) {
      faviconLogger.debug('Found valid fallback favicon', { url, favicon: fallbackUrl });
      return fallbackUrl;
    }

    faviconLogger.debug('No favicon found', { url });
    return null;
  } catch (error) {
    // Handle abort/timeout
    if (error instanceof Error && error.name === 'AbortError') {
      faviconLogger.warn('Favicon fetch timed out', { url, timeout });
    } else {
      faviconLogger.error('Favicon fetch failed', { url, error });
    }

    // Still try the fallback even after timeout/error
    const fallbackUrl = `${origin}/favicon.ico`;
    try {
      const isValid = await validateFaviconUrl(fallbackUrl, timeout, userAgent);
      if (isValid) {
        return fallbackUrl;
      }
    } catch {
      // Ignore errors on fallback attempt
    }

    return null;
  }
}
