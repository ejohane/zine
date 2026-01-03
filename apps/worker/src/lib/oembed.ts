/**
 * oEmbed Client for Rich Metadata Fetching
 *
 * Provides oEmbed client functionality to fetch rich metadata from various
 * providers without requiring OAuth authentication. Used for manual link
 * saving feature to get titles, thumbnails, and author information.
 *
 * Supported providers:
 * - YouTube: Video metadata via oEmbed API
 * - Spotify: Episode/track metadata via oEmbed API
 * - Twitter/X: Tweet metadata via publish.twitter.com
 *
 * @example
 * ```typescript
 * import { fetchYouTubeOEmbed, fetchSpotifyOEmbed, fetchTwitterOEmbed } from './lib/oembed';
 *
 * const videoMeta = await fetchYouTubeOEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
 * const episodeMeta = await fetchSpotifyOEmbed('https://open.spotify.com/episode/...');
 * const tweetMeta = await fetchTwitterOEmbed('https://twitter.com/user/status/123');
 * ```
 */

import { logger } from './logger';

// ============================================================================
// Types
// ============================================================================

/**
 * Standardized oEmbed result from any provider
 */
export interface OEmbedResult {
  /** Title of the content (video title, tweet text, etc.) */
  title: string;
  /** Name of the content author/creator */
  author_name: string;
  /** URL to the author's profile (optional) */
  author_url?: string;
  /** URL to a thumbnail image (optional) */
  thumbnail_url?: string;
  /** Width of the thumbnail in pixels (optional) */
  thumbnail_width?: number;
  /** Height of the thumbnail in pixels (optional) */
  thumbnail_height?: number;
  /** HTML embed code (optional) */
  html?: string;
  /** Name of the provider (YouTube, Spotify, Twitter) */
  provider_name: string;
  /** URL to the provider's website */
  provider_url: string;
}

/**
 * Raw response from YouTube oEmbed API
 */
interface YouTubeOEmbedResponse {
  title: string;
  author_name: string;
  author_url: string;
  thumbnail_url: string;
  thumbnail_width: number;
  thumbnail_height: number;
  html: string;
  provider_name: string;
  provider_url: string;
  type: string;
  version: string;
  width: number;
  height: number;
}

/**
 * Raw response from Spotify oEmbed API
 */
interface SpotifyOEmbedResponse {
  title: string;
  thumbnail_url: string;
  thumbnail_width: number;
  thumbnail_height: number;
  html: string;
  provider_name: string;
  provider_url: string;
  type: string;
  version: string;
  width: number;
  height: number;
}

/**
 * Raw response from Twitter oEmbed API
 */
interface TwitterOEmbedResponse {
  url: string;
  author_name: string;
  author_url: string;
  html: string;
  provider_name: string;
  provider_url: string;
  type: string;
  version: string;
  width: number | null;
  height: number | null;
  cache_age: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Request timeout in milliseconds */
const FETCH_TIMEOUT_MS = 5000;

/** oEmbed API endpoints */
const OEMBED_ENDPOINTS = {
  YOUTUBE: 'https://www.youtube.com/oembed',
  SPOTIFY: 'https://open.spotify.com/oembed',
  TWITTER: 'https://publish.twitter.com/oembed',
} as const;

// ============================================================================
// Logger
// ============================================================================

const oembedLogger = logger.child('oembed');

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Make a fetch request with timeout using AbortController
 */
async function fetchWithTimeout(
  url: string,
  timeoutMs: number = FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Build oEmbed URL with encoded parameters
 */
function buildOEmbedUrl(endpoint: string, contentUrl: string, format?: string): string {
  const url = new URL(endpoint);
  url.searchParams.set('url', contentUrl);
  if (format) {
    url.searchParams.set('format', format);
  }
  return url.toString();
}

// ============================================================================
// YouTube oEmbed
// ============================================================================

/**
 * Fetch oEmbed metadata for a YouTube video
 *
 * @param videoUrl - Full YouTube video URL (e.g., https://www.youtube.com/watch?v=...)
 * @returns OEmbedResult with video metadata, or null on failure
 *
 * @example
 * ```typescript
 * const meta = await fetchYouTubeOEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
 * if (meta) {
 *   console.log(meta.title); // "Rick Astley - Never Gonna Give You Up"
 *   console.log(meta.author_name); // "Rick Astley"
 * }
 * ```
 */
export async function fetchYouTubeOEmbed(videoUrl: string): Promise<OEmbedResult | null> {
  const oembedUrl = buildOEmbedUrl(OEMBED_ENDPOINTS.YOUTUBE, videoUrl, 'json');

  try {
    const response = await fetchWithTimeout(oembedUrl);

    if (!response.ok) {
      oembedLogger.warn('YouTube oEmbed request failed', {
        status: response.status,
        videoUrl,
      });
      return null;
    }

    const data = (await response.json()) as YouTubeOEmbedResponse;

    return {
      title: data.title,
      author_name: data.author_name,
      author_url: data.author_url,
      thumbnail_url: data.thumbnail_url,
      thumbnail_width: data.thumbnail_width,
      thumbnail_height: data.thumbnail_height,
      html: data.html,
      provider_name: data.provider_name,
      provider_url: data.provider_url,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      oembedLogger.warn('YouTube oEmbed request timed out', { videoUrl });
    } else {
      oembedLogger.error('YouTube oEmbed request error', {
        error,
        videoUrl,
      });
    }
    return null;
  }
}

// ============================================================================
// Spotify oEmbed
// ============================================================================

/**
 * Fetch oEmbed metadata for a Spotify episode, track, or other content
 *
 * @param contentUrl - Full Spotify URL (e.g., https://open.spotify.com/episode/...)
 * @returns OEmbedResult with content metadata, or null on failure
 *
 * @example
 * ```typescript
 * const meta = await fetchSpotifyOEmbed('https://open.spotify.com/episode/ABC123');
 * if (meta) {
 *   console.log(meta.title); // "Episode Title"
 *   console.log(meta.thumbnail_url); // Album art URL
 * }
 * ```
 */
export async function fetchSpotifyOEmbed(contentUrl: string): Promise<OEmbedResult | null> {
  const oembedUrl = buildOEmbedUrl(OEMBED_ENDPOINTS.SPOTIFY, contentUrl);

  try {
    const response = await fetchWithTimeout(oembedUrl);

    if (!response.ok) {
      oembedLogger.warn('Spotify oEmbed request failed', {
        status: response.status,
        contentUrl,
      });
      return null;
    }

    const data = (await response.json()) as SpotifyOEmbedResponse;

    // Spotify doesn't include author_name in response, extract from title if possible
    // Title format is often "Song Name - Artist" or just the content title
    const authorName = extractSpotifyAuthor(data.title, data.html);

    return {
      title: data.title,
      author_name: authorName,
      thumbnail_url: data.thumbnail_url,
      thumbnail_width: data.thumbnail_width,
      thumbnail_height: data.thumbnail_height,
      html: data.html,
      provider_name: data.provider_name,
      provider_url: data.provider_url,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      oembedLogger.warn('Spotify oEmbed request timed out', { contentUrl });
    } else {
      oembedLogger.error('Spotify oEmbed request error', {
        error,
        contentUrl,
      });
    }
    return null;
  }
}

/**
 * Extract author/artist name from Spotify oEmbed data
 *
 * Spotify oEmbed doesn't directly provide author_name, so we try to extract it
 * from the HTML iframe title attribute or use the provider name as fallback.
 */
function extractSpotifyAuthor(title: string, html?: string): string {
  // Try to extract from HTML iframe title attribute
  // Format: <iframe ... title="Spotify Embed: Song Name by Artist">
  if (html) {
    const titleMatch = html.match(/title="Spotify Embed: .+ by ([^"]+)"/);
    if (titleMatch && titleMatch[1]) {
      return titleMatch[1];
    }
  }

  // Fallback to Spotify as the author
  return 'Spotify';
}

// ============================================================================
// Twitter oEmbed
// ============================================================================

/**
 * Fetch oEmbed metadata for a Twitter/X tweet
 *
 * @param tweetUrl - Full Twitter/X URL (e.g., https://twitter.com/user/status/...)
 * @returns OEmbedResult with tweet metadata, or null on failure
 *
 * @example
 * ```typescript
 * const meta = await fetchTwitterOEmbed('https://twitter.com/elonmusk/status/123456');
 * if (meta) {
 *   console.log(meta.author_name); // "Elon Musk"
 *   console.log(meta.html); // Tweet embed HTML
 * }
 * ```
 */
export async function fetchTwitterOEmbed(tweetUrl: string): Promise<OEmbedResult | null> {
  const oembedUrl = buildOEmbedUrl(OEMBED_ENDPOINTS.TWITTER, tweetUrl);

  try {
    const response = await fetchWithTimeout(oembedUrl);

    if (!response.ok) {
      oembedLogger.warn('Twitter oEmbed request failed', {
        status: response.status,
        tweetUrl,
      });
      return null;
    }

    const data = (await response.json()) as TwitterOEmbedResponse;

    // Twitter doesn't include a title in oEmbed, extract from HTML
    const title = extractTwitterTitle(data.html);

    return {
      title,
      author_name: data.author_name,
      author_url: data.author_url,
      html: data.html,
      provider_name: data.provider_name,
      provider_url: data.provider_url,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      oembedLogger.warn('Twitter oEmbed request timed out', { tweetUrl });
    } else {
      oembedLogger.error('Twitter oEmbed request error', {
        error,
        tweetUrl,
      });
    }
    return null;
  }
}

/**
 * Extract tweet text/title from Twitter oEmbed HTML
 *
 * The HTML contains the tweet text in a <p> tag within a blockquote.
 */
function extractTwitterTitle(html: string): string {
  // Extract text from the first <p> tag inside the blockquote
  // Format: <blockquote...><p...>Tweet text here</p>...
  const paragraphMatch = html.match(/<p[^>]*>([^<]+)<\/p>/);
  if (paragraphMatch && paragraphMatch[1]) {
    // Clean up HTML entities and trim
    const text = paragraphMatch[1]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();

    // Truncate if too long (for display purposes)
    if (text.length > 140) {
      return text.substring(0, 137) + '...';
    }
    return text;
  }

  // Fallback: return a generic title
  return 'Tweet';
}
