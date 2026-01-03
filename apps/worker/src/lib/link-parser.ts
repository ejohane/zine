/**
 * Link Parser Utilities
 *
 * Parses URLs to detect providers and extract provider-specific IDs.
 * Used by the Manual Link Saving feature to process user-submitted URLs.
 */

import { ContentType, Provider } from '@zine/shared';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of parsing a URL
 */
export interface ParsedLink {
  /** The detected provider */
  provider: Provider;
  /** The content type for this provider */
  contentType: ContentType;
  /** Provider-specific identifier (e.g., video ID, episode ID) */
  providerId: string;
  /** Cleaned URL with tracking parameters removed */
  canonicalUrl: string;
}

// ============================================================================
// Tracking Parameter Cleanup
// ============================================================================

/**
 * Parameters to strip from URLs for cleaner canonical URLs
 */
const TRACKING_PARAMS = new Set([
  't', // YouTube timestamp
  'si', // Spotify share ID
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'ref',
  'ref_src',
  'ref_url',
  's', // Twitter share tracking
  'feature', // YouTube feature tracking
]);

/**
 * Remove tracking parameters from a URL
 */
function stripTrackingParams(url: URL): string {
  const cleanUrl = new URL(url.toString());

  for (const param of TRACKING_PARAMS) {
    cleanUrl.searchParams.delete(param);
  }

  // Remove empty query string
  let result = cleanUrl.toString();
  if (result.endsWith('?')) {
    result = result.slice(0, -1);
  }

  return result;
}

// ============================================================================
// Provider Patterns
// ============================================================================

/**
 * YouTube video ID pattern: 11 alphanumeric characters (including - and _)
 */
const YOUTUBE_VIDEO_ID_PATTERN = /^[\w-]{11}$/;

/**
 * Spotify episode ID pattern: 22 alphanumeric characters
 */
const SPOTIFY_EPISODE_ID_PATTERN = /^[\dA-Za-z]{22}$/;

/**
 * Twitter/X numeric status ID pattern
 */
const TWITTER_STATUS_ID_PATTERN = /^\d+$/;

// ============================================================================
// Provider Parsers
// ============================================================================

/**
 * Parse YouTube URLs
 *
 * Supported formats:
 * - youtube.com/watch?v=VIDEO_ID
 * - youtu.be/VIDEO_ID
 * - youtube.com/shorts/VIDEO_ID
 * - youtube.com/live/VIDEO_ID
 * - youtube.com/embed/VIDEO_ID
 */
function parseYouTube(url: URL): ParsedLink | null {
  const hostname = url.hostname.toLowerCase().replace('www.', '');
  let videoId: string | null = null;

  if (hostname === 'youtube.com' || hostname === 'm.youtube.com') {
    // youtube.com/watch?v=VIDEO_ID
    if (url.pathname === '/watch') {
      videoId = url.searchParams.get('v');
    }
    // youtube.com/shorts/VIDEO_ID
    else if (url.pathname.startsWith('/shorts/')) {
      videoId = url.pathname.split('/shorts/')[1]?.split('/')[0] ?? null;
    }
    // youtube.com/live/VIDEO_ID
    else if (url.pathname.startsWith('/live/')) {
      videoId = url.pathname.split('/live/')[1]?.split('/')[0] ?? null;
    }
    // youtube.com/embed/VIDEO_ID
    else if (url.pathname.startsWith('/embed/')) {
      videoId = url.pathname.split('/embed/')[1]?.split('/')[0] ?? null;
    }
  }
  // youtu.be/VIDEO_ID
  else if (hostname === 'youtu.be') {
    videoId = url.pathname.slice(1).split('/')[0] ?? null;
  }

  // Validate video ID format
  if (!videoId || !YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) {
    return null;
  }

  // Build canonical URL
  const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;

  return {
    provider: Provider.YOUTUBE,
    contentType: ContentType.VIDEO,
    providerId: videoId,
    canonicalUrl,
  };
}

/**
 * Parse Spotify URLs
 *
 * Supported formats:
 * - open.spotify.com/episode/EPISODE_ID
 */
function parseSpotify(url: URL): ParsedLink | null {
  const hostname = url.hostname.toLowerCase();

  if (hostname !== 'open.spotify.com') {
    return null;
  }

  // open.spotify.com/episode/EPISODE_ID
  if (url.pathname.startsWith('/episode/')) {
    const episodeId = url.pathname.split('/episode/')[1]?.split('/')[0]?.split('?')[0] ?? null;

    if (!episodeId || !SPOTIFY_EPISODE_ID_PATTERN.test(episodeId)) {
      return null;
    }

    const canonicalUrl = `https://open.spotify.com/episode/${episodeId}`;

    return {
      provider: Provider.SPOTIFY,
      contentType: ContentType.PODCAST,
      providerId: episodeId,
      canonicalUrl,
    };
  }

  return null;
}

/**
 * Parse Substack URLs
 *
 * Supported formats:
 * - *.substack.com/p/SLUG
 */
function parseSubstack(url: URL): ParsedLink | null {
  const hostname = url.hostname.toLowerCase();

  // Check for *.substack.com pattern
  if (!hostname.endsWith('.substack.com') && hostname !== 'substack.com') {
    return null;
  }

  // Parse /p/SLUG pattern
  if (url.pathname.startsWith('/p/')) {
    const slug = url.pathname.split('/p/')[1]?.split('/')[0]?.split('?')[0] ?? null;

    if (!slug) {
      return null;
    }

    // Extract publication name from subdomain
    const publication = hostname.replace('.substack.com', '');

    // Provider ID combines publication and slug for uniqueness
    const providerId = `${publication}/${slug}`;

    // Build canonical URL (strip tracking params)
    const canonicalUrl = stripTrackingParams(url);

    return {
      provider: Provider.SUBSTACK,
      contentType: ContentType.ARTICLE,
      providerId,
      canonicalUrl,
    };
  }

  return null;
}

/**
 * Parse Twitter/X URLs
 *
 * Supported formats:
 * - twitter.com/USERNAME/status/STATUS_ID
 * - x.com/USERNAME/status/STATUS_ID
 *
 * Note: Uses RSS provider since X is not OAuth-connected
 */
function parseTwitter(url: URL): ParsedLink | null {
  const hostname = url.hostname.toLowerCase().replace('www.', '');

  if (hostname !== 'twitter.com' && hostname !== 'x.com') {
    return null;
  }

  // Match /USERNAME/status/STATUS_ID pattern
  const pathParts = url.pathname.split('/').filter(Boolean);

  if (pathParts.length >= 3 && pathParts[1] === 'status') {
    const statusId = pathParts[2]?.split('?')[0] ?? null;

    if (!statusId || !TWITTER_STATUS_ID_PATTERN.test(statusId)) {
      return null;
    }

    // Canonical URL uses x.com (the current domain)
    const username = pathParts[0];
    const canonicalUrl = `https://x.com/${username}/status/${statusId}`;

    return {
      provider: Provider.RSS, // X is not OAuth-connected, use RSS provider
      contentType: ContentType.POST,
      providerId: statusId,
      canonicalUrl,
    };
  }

  return null;
}

/**
 * Parse as generic URL (fallback)
 *
 * Any valid URL that doesn't match a known provider
 * is treated as a generic article.
 */
function parseGeneric(url: URL): ParsedLink {
  const canonicalUrl = stripTrackingParams(url);

  return {
    provider: Provider.RSS,
    contentType: ContentType.ARTICLE,
    providerId: canonicalUrl, // Use full URL as provider ID
    canonicalUrl,
  };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Check if a string is a valid URL
 *
 * @param url - String to validate
 * @returns true if the string is a valid HTTP/HTTPS URL
 *
 * @example
 * ```typescript
 * isValidUrl('https://youtube.com/watch?v=abc123')  // true
 * isValidUrl('not-a-url')                           // false
 * isValidUrl('ftp://example.com')                   // false (not HTTP/HTTPS)
 * ```
 */
export function isValidUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Parse a URL to extract provider information
 *
 * Detects the provider from the URL pattern and extracts
 * the provider-specific ID. Returns null for invalid URLs.
 *
 * @param url - URL string to parse
 * @returns ParsedLink with provider info, or null if invalid
 *
 * @example
 * ```typescript
 * // YouTube
 * parseLink('https://youtube.com/watch?v=dQw4w9WgXcQ')
 * // { provider: 'YOUTUBE', contentType: 'VIDEO', providerId: 'dQw4w9WgXcQ', ... }
 *
 * // Spotify
 * parseLink('https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk')
 * // { provider: 'SPOTIFY', contentType: 'PODCAST', providerId: '4rOoJ6Egrf8K2IrywzwOMk', ... }
 *
 * // Generic
 * parseLink('https://example.com/article')
 * // { provider: 'RSS', contentType: 'ARTICLE', providerId: 'https://example.com/article', ... }
 *
 * // Invalid
 * parseLink('not-a-url')
 * // null
 * ```
 */
export function parseLink(url: string): ParsedLink | null {
  if (!isValidUrl(url)) {
    return null;
  }

  const parsed = new URL(url);

  // Try each provider parser in order of specificity
  const result =
    parseYouTube(parsed) ?? parseSpotify(parsed) ?? parseSubstack(parsed) ?? parseTwitter(parsed);

  if (result) {
    return result;
  }

  // Fall back to generic
  return parseGeneric(parsed);
}
