/**
 * Link Preview Orchestration Module
 *
 * Orchestrates metadata fetching from multiple sources with a priority-based
 * fallback system for the Manual Link Saving feature.
 *
 * Priority order:
 * 1. Provider APIs (best quality) - When user has OAuth connection
 *    - YouTube: YouTube Data API
 *    - Spotify: Spotify API via getEpisode()
 * 2. oEmbed APIs (good quality) - Fallback, no auth required
 * 3. Open Graph scraping (fallback) - For generic URLs
 *
 * @example
 * ```typescript
 * import { fetchLinkPreview } from './lib/link-preview';
 *
 * // With OAuth tokens (best quality)
 * const preview = await fetchLinkPreview('https://youtube.com/watch?v=abc123', {
 *   accessTokens: { youtube: userYouTubeToken }
 * });
 *
 * // Without tokens (falls back to oEmbed/OG)
 * const preview = await fetchLinkPreview('https://example.com/article');
 * ```
 */

import { ContentType, Provider } from '@zine/shared';
import { parseLink, type ParsedLink } from './link-parser';
import { fetchYouTubeOEmbed, fetchSpotifyOEmbed, fetchTwitterOEmbed } from './oembed';
import { scrapeOpenGraph } from './opengraph';
import { getEpisode, type SpotifyEpisode } from '../providers/spotify';
import { extractArticle } from './article-extractor';
import { fetchFxTwitterByUrl, type FxTwitterResponse, type FxTwitterTweet } from './fxtwitter';
import { fetchFavicon } from './favicon';
import { logger } from './logger';
import { parseISO8601Duration } from './duration';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of fetching link preview metadata
 */
export interface LinkPreviewResult {
  /** The detected provider */
  provider: ParsedLink['provider'];
  /** The content type for this provider */
  contentType: ParsedLink['contentType'];
  /** Provider-specific identifier */
  providerId: string;
  /** Title of the content */
  title: string;
  /** Creator/author name */
  creator: string;
  /** URL to creator/channel/podcast image (distinct from episode thumbnail) */
  creatorImageUrl?: string;
  /** URL to thumbnail image */
  thumbnailUrl: string | null;
  /** Duration in seconds (for video/podcast content) */
  duration: number | null;
  /** Canonical URL to the content */
  canonicalUrl: string;
  /** Description/summary of the content */
  description?: string;
  /** Source that provided the metadata */
  source: 'provider_api' | 'oembed' | 'opengraph' | 'fallback' | 'article_extractor' | 'fxtwitter';

  // Article-specific fields
  /** Publication or site name (for articles) */
  siteName?: string;
  /** Estimated word count (for articles) */
  wordCount?: number;
  /** Estimated reading time in minutes (for articles) */
  readingTimeMinutes?: number;
  /** Whether article content was extracted for reader view */
  hasArticleContent?: boolean;

  // X/Twitter-specific fields
  /** When content was published (ISO8601 string) */
  publishedAt?: string;
  /** Raw API response from provider (JSON string, for future features) */
  rawMetadata?: string;
}

/**
 * Context for fetching link previews
 */
export interface PreviewContext {
  /** User's valid access tokens for each provider */
  accessTokens?: {
    youtube?: string;
    spotify?: string;
  };
}

// ============================================================================
// Logger
// ============================================================================

const previewLogger = logger.child('link-preview');

// ============================================================================
// Provider API Fetchers
// ============================================================================

/**
 * YouTube Data API video response shape (partial, just what we need)
 */
interface YouTubeVideoResponse {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      description?: string;
      channelTitle?: string;
      thumbnails?: {
        maxres?: { url?: string };
        high?: { url?: string };
        medium?: { url?: string };
        default?: { url?: string };
      };
    };
    contentDetails?: {
      duration?: string;
    };
  }>;
}

/**
 * Fetch YouTube video metadata via YouTube Data API
 *
 * Uses the videos.list endpoint to get full video details including:
 * - Full description (not truncated like oEmbed)
 * - Duration
 * - High-quality thumbnails
 *
 * YouTube API Cost: 1 quota unit
 */
async function fetchYouTubeViaAPI(
  videoId: string,
  accessToken: string
): Promise<LinkPreviewResult | null> {
  try {
    previewLogger.debug('Fetching YouTube video via Data API', { videoId });

    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('part', 'snippet,contentDetails');
    url.searchParams.set('id', videoId);

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      previewLogger.warn('YouTube API request failed', {
        videoId,
        status: response.status,
        statusText: response.statusText,
      });
      return null;
    }

    const data = (await response.json()) as YouTubeVideoResponse;
    const video = data.items?.[0];

    if (!video?.snippet) {
      previewLogger.warn('YouTube API returned no video data', { videoId });
      return null;
    }

    // Get best available thumbnail
    const thumbnails = video.snippet.thumbnails;
    const thumbnailUrl =
      thumbnails?.maxres?.url ??
      thumbnails?.high?.url ??
      thumbnails?.medium?.url ??
      thumbnails?.default?.url ??
      null;

    // Parse duration from ISO8601 format (e.g., "PT4M13S")
    let duration: number | null = null;
    if (video.contentDetails?.duration) {
      try {
        duration = parseISO8601Duration(video.contentDetails.duration);
      } catch {
        previewLogger.warn('Failed to parse YouTube duration', {
          videoId,
          duration: video.contentDetails.duration,
        });
      }
    }

    previewLogger.debug('YouTube API fetch successful', {
      videoId,
      hasDescription: !!video.snippet.description,
      hasDuration: duration !== null,
    });

    return {
      provider: Provider.YOUTUBE,
      contentType: ContentType.VIDEO,
      providerId: videoId,
      title: video.snippet.title ?? 'Untitled Video',
      creator: video.snippet.channelTitle ?? 'Unknown',
      thumbnailUrl,
      duration,
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
      description: video.snippet.description ?? undefined,
      source: 'provider_api',
    };
  } catch (error) {
    previewLogger.error('YouTube API fetch error', { error, videoId });
    return null;
  }
}

/**
 * Fetch Spotify episode metadata via Spotify API
 */
async function fetchSpotifyViaAPI(
  episodeId: string,
  accessToken: string,
  canonicalUrl: string
): Promise<LinkPreviewResult | null> {
  try {
    const episode = await getEpisode(accessToken, episodeId);

    if (!episode) {
      previewLogger.warn('Spotify episode not found via API', { episodeId });
      return null;
    }

    return transformSpotifyEpisode(episode, canonicalUrl);
  } catch (error) {
    previewLogger.error('Spotify API fetch failed', { error, episodeId });
    return null;
  }
}

/**
 * Transform Spotify episode to LinkPreviewResult
 */
function transformSpotifyEpisode(episode: SpotifyEpisode, canonicalUrl: string): LinkPreviewResult {
  // Get the best available thumbnail (episode image)
  const thumbnail = episode.images[0]?.url ?? null;

  return {
    provider: Provider.SPOTIFY,
    contentType: ContentType.PODCAST,
    providerId: episode.id,
    title: episode.name,
    creator: episode.showName ?? 'Unknown',
    creatorImageUrl: episode.showImageUrl,
    thumbnailUrl: thumbnail,
    duration: Math.round(episode.durationMs / 1000), // Convert ms to seconds
    canonicalUrl,
    description: episode.description,
    source: 'provider_api',
    siteName: episode.showPublisher,
    publishedAt: episode.releaseDate,
    rawMetadata: JSON.stringify(episode),
  };
}

// ============================================================================
// oEmbed Fetchers
// ============================================================================

/**
 * Fetch YouTube metadata via oEmbed
 */
async function fetchYouTubeViaOEmbed(parsedLink: ParsedLink): Promise<LinkPreviewResult | null> {
  const oembed = await fetchYouTubeOEmbed(parsedLink.canonicalUrl);

  if (!oembed) {
    return null;
  }

  return {
    provider: parsedLink.provider,
    contentType: parsedLink.contentType,
    providerId: parsedLink.providerId,
    title: oembed.title,
    creator: oembed.author_name,
    thumbnailUrl: oembed.thumbnail_url ?? null,
    duration: null, // oEmbed doesn't provide duration
    canonicalUrl: parsedLink.canonicalUrl,
    source: 'oembed',
  };
}

/**
 * Fetch Spotify metadata via oEmbed
 */
async function fetchSpotifyViaOEmbed(parsedLink: ParsedLink): Promise<LinkPreviewResult | null> {
  const oembed = await fetchSpotifyOEmbed(parsedLink.canonicalUrl);

  if (!oembed) {
    return null;
  }

  return {
    provider: parsedLink.provider,
    contentType: parsedLink.contentType,
    providerId: parsedLink.providerId,
    title: oembed.title,
    creator: oembed.author_name,
    thumbnailUrl: oembed.thumbnail_url ?? null,
    duration: null, // oEmbed doesn't provide duration
    canonicalUrl: parsedLink.canonicalUrl,
    source: 'oembed',
  };
}

/**
 * Fetch Twitter/X metadata via oEmbed
 */
async function fetchTwitterViaOEmbed(parsedLink: ParsedLink): Promise<LinkPreviewResult | null> {
  const oembed = await fetchTwitterOEmbed(parsedLink.canonicalUrl);

  if (!oembed) {
    return null;
  }

  return {
    provider: parsedLink.provider,
    contentType: parsedLink.contentType,
    providerId: parsedLink.providerId,
    title: oembed.title,
    creator: oembed.author_name,
    thumbnailUrl: null, // Twitter oEmbed doesn't provide thumbnails
    duration: null,
    canonicalUrl: parsedLink.canonicalUrl,
    source: 'oembed',
  };
}

/**
 * Extract the first external URL from tweet facets
 * Filters out Twitter/X URLs (we don't want to scrape Twitter pages)
 */
function getFirstExternalUrl(tweet: FxTwitterTweet): string | null {
  const facets = tweet.raw_text?.facets;
  if (!facets || facets.length === 0) return null;

  for (const facet of facets) {
    if (facet.type === 'url' && facet.replacement) {
      // Skip Twitter/X URLs - we don't want to scrape those
      const url = facet.replacement.toLowerCase();
      if (!url.includes('twitter.com') && !url.includes('x.com') && !url.includes('t.co')) {
        return facet.replacement;
      }
    }
  }

  return null;
}

/**
 * Map FxTwitter response to LinkPreviewResult
 * If the tweet has no attached media but contains external URLs,
 * fetches the OG image from the first external URL
 */
async function mapFxTwitterToPreview(
  response: FxTwitterResponse,
  parsedLink: ParsedLink
): Promise<LinkPreviewResult | null> {
  const tweet = response.tweet;

  if (!tweet) {
    return null;
  }

  // Check if tweet has attached media (photos or videos)
  const hasAttachedMedia =
    (tweet.media?.photos && tweet.media.photos.length > 0) ||
    (tweet.media?.videos && tweet.media.videos.length > 0);

  // Get thumbnail from attached media first
  let thumbnailUrl: string | null =
    tweet.media?.photos?.[0]?.url ?? tweet.media?.videos?.[0]?.thumbnail_url ?? null;

  // If no attached media, try to fetch OG image from embedded URL
  if (!thumbnailUrl && !hasAttachedMedia) {
    const externalUrl = getFirstExternalUrl(tweet);
    if (externalUrl) {
      previewLogger.debug('Tweet has no media, fetching OG image from embedded URL', {
        tweetId: tweet.id,
        externalUrl,
      });

      try {
        const ogData = await scrapeOpenGraph(externalUrl);
        if (ogData.image) {
          thumbnailUrl = ogData.image;
          previewLogger.debug('Got OG image from embedded URL', {
            tweetId: tweet.id,
            externalUrl,
            imageUrl: thumbnailUrl,
          });
        }
      } catch (error) {
        previewLogger.warn('Failed to fetch OG image from embedded URL', {
          tweetId: tweet.id,
          externalUrl,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // Fall back to author avatar if still no thumbnail
  if (!thumbnailUrl) {
    thumbnailUrl = tweet.author.avatar_url ?? null;
  }

  // Format creator as "Display Name (@handle)"
  const creator = `${tweet.author.name} (@${tweet.author.screen_name})`;

  // Convert Unix timestamp to ISO8601
  const publishedAt = new Date(tweet.created_timestamp * 1000).toISOString();

  // Get video duration if available
  const duration = tweet.media?.videos?.[0]?.duration ?? null;

  return {
    provider: parsedLink.provider,
    contentType: parsedLink.contentType,
    providerId: tweet.id,
    title: tweet.text,
    creator,
    creatorImageUrl: tweet.author.avatar_url,
    thumbnailUrl,
    duration,
    canonicalUrl: tweet.url,
    description: undefined,
    source: 'fxtwitter',
    publishedAt,
    rawMetadata: JSON.stringify(response),
  };
}

/**
 * Fetch X (Twitter) preview with fallback chain:
 * 1. FxTwitter API (rich metadata)
 * 2. Twitter oEmbed (limited)
 * 3. Fallback
 */
async function fetchXProviderPreview(parsedLink: ParsedLink): Promise<LinkPreviewResult | null> {
  // Try FxTwitter first
  const fxResponse = await fetchFxTwitterByUrl(parsedLink.canonicalUrl);

  if (fxResponse?.code === 200 && fxResponse.tweet) {
    previewLogger.debug('FxTwitter fetch successful', {
      url: parsedLink.canonicalUrl,
      hasMedia: !!fxResponse.tweet.media,
    });

    const result = await mapFxTwitterToPreview(fxResponse, parsedLink);
    if (result) return result;
  }

  // Log why FxTwitter failed
  if (fxResponse) {
    previewLogger.debug('FxTwitter returned error', {
      url: parsedLink.canonicalUrl,
      code: fxResponse.code,
      message: fxResponse.message,
    });
  }

  // Fall back to Twitter oEmbed
  previewLogger.debug('Falling back to Twitter oEmbed', {
    url: parsedLink.canonicalUrl,
  });

  const oembedResult = await fetchTwitterViaOEmbed(parsedLink);
  if (oembedResult) return oembedResult;

  // All methods failed
  return null;
}

// ============================================================================
// Open Graph Scraper
// ============================================================================

/**
 * Fetch metadata via Open Graph scraping
 */
async function fetchViaOpenGraph(parsedLink: ParsedLink): Promise<LinkPreviewResult | null> {
  const ogData = await scrapeOpenGraph(parsedLink.canonicalUrl);

  // Must have at least a title to be useful
  if (!ogData.title) {
    return null;
  }

  return {
    provider: parsedLink.provider,
    contentType: parsedLink.contentType,
    providerId: parsedLink.providerId,
    title: ogData.title,
    creator: ogData.author ?? ogData.siteName ?? 'Unknown',
    creatorImageUrl: ogData.authorImageUrl ?? undefined,
    thumbnailUrl: ogData.image,
    duration: null,
    canonicalUrl: ogData.url ?? parsedLink.canonicalUrl,
    description: ogData.description ?? undefined,
    source: 'opengraph',
  };
}

// ============================================================================
// Fallback Result
// ============================================================================

/**
 * Create a minimal fallback result when all other methods fail
 */
function createFallbackResult(parsedLink: ParsedLink): LinkPreviewResult {
  // Extract a title from the URL as a last resort
  const url = new URL(parsedLink.canonicalUrl);
  const pathSegments = url.pathname.split('/').filter(Boolean);
  const lastSegment = pathSegments[pathSegments.length - 1] ?? url.hostname;

  // Clean up the segment for display (replace dashes/underscores with spaces)
  const title =
    lastSegment
      .replace(/[-_]/g, ' ')
      .replace(/\.(html?|php|aspx?)$/i, '')
      .trim() || url.hostname;

  return {
    provider: parsedLink.provider,
    contentType: parsedLink.contentType,
    providerId: parsedLink.providerId,
    title,
    creator: url.hostname,
    thumbnailUrl: null,
    duration: null,
    canonicalUrl: parsedLink.canonicalUrl,
    source: 'fallback',
  };
}

// ============================================================================
// Main Orchestrator
// ============================================================================

/**
 * Fetch link preview metadata using a priority-based fallback system.
 *
 * Priority order:
 * 1. Provider API (if user has OAuth token for that provider)
 * 2. oEmbed API (no auth required)
 * 3. Open Graph scraping (for generic URLs)
 * 4. Fallback (minimal result from URL parsing)
 *
 * @param url - URL to fetch preview for
 * @param context - Optional context with user's OAuth tokens
 * @returns LinkPreviewResult with metadata, or null if URL is invalid
 *
 * @example
 * ```typescript
 * // With OAuth tokens
 * const preview = await fetchLinkPreview('https://open.spotify.com/episode/abc123', {
 *   accessTokens: { spotify: userSpotifyToken }
 * });
 *
 * // Without tokens
 * const preview = await fetchLinkPreview('https://youtube.com/watch?v=xyz789');
 *
 * // Generic URL
 * const preview = await fetchLinkPreview('https://example.com/article');
 * ```
 */
export async function fetchLinkPreview(
  url: string,
  context?: PreviewContext
): Promise<LinkPreviewResult | null> {
  // Parse the URL to detect provider
  const parsedLink = parseLink(url);

  if (!parsedLink) {
    previewLogger.warn('Invalid URL provided', { url });
    return null;
  }

  previewLogger.debug('Fetching link preview', {
    url,
    provider: parsedLink.provider,
    contentType: parsedLink.contentType,
    hasYouTubeToken: !!context?.accessTokens?.youtube,
    hasSpotifyToken: !!context?.accessTokens?.spotify,
  });

  let result: LinkPreviewResult | null = null;

  // Strategy based on provider
  switch (parsedLink.provider) {
    case Provider.YOUTUBE:
      result = await fetchYouTubePreview(parsedLink, context);
      break;

    case Provider.SPOTIFY:
      result = await fetchSpotifyPreview(parsedLink, context);
      break;

    case Provider.X:
      result = await fetchXProviderPreview(parsedLink);
      break;

    case Provider.RSS:
      // RSS provider is used for Twitter/X and generic URLs
      result = await fetchRssProviderPreview(parsedLink);
      break;

    case Provider.SUBSTACK:
      // Substack uses Open Graph
      result = await fetchViaOpenGraph(parsedLink);
      break;

    case Provider.WEB:
      // WEB provider uses article extraction with OG fallback
      result = await fetchWebProviderPreview(parsedLink);
      break;

    default:
      // Fallback to Open Graph for unknown providers
      result = await fetchViaOpenGraph(parsedLink);
  }

  // If all methods failed, create a minimal fallback
  if (!result) {
    previewLogger.debug('All fetch methods failed, using fallback', {
      url,
      provider: parsedLink.provider,
    });
    result = createFallbackResult(parsedLink);
  }

  previewLogger.debug('Link preview fetched', {
    url,
    source: result.source,
    hasTitle: !!result.title,
    hasThumbnail: !!result.thumbnailUrl,
  });

  return result;
}

/**
 * Fetch YouTube preview with fallback chain
 */
async function fetchYouTubePreview(
  parsedLink: ParsedLink,
  context?: PreviewContext
): Promise<LinkPreviewResult | null> {
  // Try Provider API if we have a token
  if (context?.accessTokens?.youtube) {
    const apiResult = await fetchYouTubeViaAPI(parsedLink.providerId, context.accessTokens.youtube);
    if (apiResult) return apiResult;
  }

  // Fall back to oEmbed
  const oembedResult = await fetchYouTubeViaOEmbed(parsedLink);
  if (oembedResult) return oembedResult;

  // Fall back to Open Graph (unlikely to help for YouTube)
  return fetchViaOpenGraph(parsedLink);
}

/**
 * Fetch Spotify preview with fallback chain
 */
async function fetchSpotifyPreview(
  parsedLink: ParsedLink,
  context?: PreviewContext
): Promise<LinkPreviewResult | null> {
  // Try Provider API if we have a token
  if (context?.accessTokens?.spotify) {
    const apiResult = await fetchSpotifyViaAPI(
      parsedLink.providerId,
      context.accessTokens.spotify,
      parsedLink.canonicalUrl
    );
    if (apiResult) return apiResult;
  }

  // For episodes, prefer OpenGraph over oEmbed because OG has show name in description
  // Format: "Show Name · Episode" in og:description
  if (parsedLink.contentType === ContentType.PODCAST) {
    const ogResult = await fetchSpotifyViaOpenGraph(parsedLink);
    if (ogResult) return ogResult;
  }

  // Fall back to oEmbed
  const oembedResult = await fetchSpotifyViaOEmbed(parsedLink);
  if (oembedResult) return oembedResult;

  // Fall back to Open Graph
  return fetchViaOpenGraph(parsedLink);
}

/**
 * Fetch Spotify episode metadata via OpenGraph scraping
 * Extracts show name from og:description format: "Show Name · Episode"
 */
async function fetchSpotifyViaOpenGraph(parsedLink: ParsedLink): Promise<LinkPreviewResult | null> {
  const ogData = await scrapeOpenGraph(parsedLink.canonicalUrl);

  if (!ogData?.title) {
    return null;
  }

  // Extract show name from description format: "Show Name · Episode"
  let creator = 'Unknown';
  if (ogData.description) {
    const match = ogData.description.match(/^(.+?)\s*·\s*Episode$/);
    if (match && match[1]) {
      creator = match[1].trim();
    }
  }

  return {
    provider: parsedLink.provider,
    contentType: parsedLink.contentType,
    providerId: parsedLink.providerId,
    title: ogData.title,
    creator,
    thumbnailUrl: ogData.image,
    duration: null,
    canonicalUrl: ogData.url ?? parsedLink.canonicalUrl,
    description: ogData.description ?? undefined,
    source: 'opengraph',
  };
}

/**
 * Fetch RSS provider preview (Twitter/X and generic URLs)
 */
async function fetchRssProviderPreview(parsedLink: ParsedLink): Promise<LinkPreviewResult | null> {
  // Check if this is a Twitter/X URL
  const isTwitter =
    parsedLink.canonicalUrl.includes('twitter.com') || parsedLink.canonicalUrl.includes('x.com');

  if (isTwitter) {
    // Try Twitter oEmbed first
    const oembedResult = await fetchTwitterViaOEmbed(parsedLink);
    if (oembedResult) return oembedResult;
  }

  // Fall back to Open Graph for all RSS provider URLs
  return fetchViaOpenGraph(parsedLink);
}

/**
 * Fetch WEB provider preview with article extraction fallback chain
 *
 * Fallback order:
 * 1. Article Extraction (Readability) - best for article content
 * 2. Open Graph scraping - fallback for non-article pages
 *
 * Creator image fallback chain:
 * 1. Author image from article metadata
 * 2. Favicon from the website
 * 3. null (mobile shows default icon)
 */
async function fetchWebProviderPreview(parsedLink: ParsedLink): Promise<LinkPreviewResult | null> {
  // Try article extraction first
  const articleData = await extractArticle(parsedLink.canonicalUrl);

  if (articleData?.isArticle) {
    // Try to get creator image with fallback chain
    let creatorImageUrl: string | undefined = undefined;

    // 1. First try author image from article metadata
    if (articleData.authorImageUrl) {
      creatorImageUrl = articleData.authorImageUrl;
      previewLogger.debug('Using author image from article metadata', {
        url: parsedLink.canonicalUrl,
        authorImageUrl: creatorImageUrl,
      });
    }

    // 2. Fall back to favicon if no author image
    if (!creatorImageUrl) {
      const favicon = await fetchFavicon(parsedLink.canonicalUrl);
      if (favicon) {
        creatorImageUrl = favicon;
        previewLogger.debug('Using favicon as creator image fallback', {
          url: parsedLink.canonicalUrl,
          favicon: creatorImageUrl,
        });
      }
    }

    // 3. If all fails, creatorImageUrl stays undefined (mobile shows default icon)
    if (!creatorImageUrl) {
      previewLogger.debug('No creator image available, using default', {
        url: parsedLink.canonicalUrl,
      });
    }

    return {
      provider: parsedLink.provider,
      contentType: parsedLink.contentType,
      providerId: parsedLink.providerId,
      title: articleData.title,
      creator: articleData.author || articleData.siteName || 'Unknown',
      creatorImageUrl,
      thumbnailUrl: articleData.thumbnailUrl,
      duration: null,
      canonicalUrl: parsedLink.canonicalUrl,
      description: articleData.excerpt || undefined,
      source: 'article_extractor',
      siteName: articleData.siteName || undefined,
      wordCount: articleData.wordCount || undefined,
      readingTimeMinutes: articleData.readingTimeMinutes || undefined,
      hasArticleContent: !!articleData.content,
    };
  }

  // Fall back to Open Graph
  const ogResult = await fetchViaOpenGraph(parsedLink);

  // For non-articles, also try favicon as fallback if no creatorImageUrl
  if (ogResult && !ogResult.creatorImageUrl) {
    const favicon = await fetchFavicon(parsedLink.canonicalUrl);
    if (favicon) {
      ogResult.creatorImageUrl = favicon;
      previewLogger.debug('Using favicon as creator image fallback for OG result', {
        url: parsedLink.canonicalUrl,
        favicon,
      });
    }
  }

  return ogResult;
}
