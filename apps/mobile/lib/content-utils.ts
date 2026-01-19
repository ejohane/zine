/**
 * Content type utility functions
 *
 * Centralized helpers for content type icons, colors, labels, and aspect ratios.
 * Accepts both API types (uppercase) and UI types (lowercase) for flexibility.
 */

import React from 'react';

import { ContentColors, ProviderColors } from '@/constants/theme';
import { HeadphonesIcon, VideoIcon, ArticleIcon, BookmarkIcon } from '@/components/icons';

// ============================================================================
// Types
// ============================================================================

/**
 * API content types (uppercase, from backend)
 */
export type ContentType = 'VIDEO' | 'PODCAST' | 'ARTICLE' | 'POST';

/**
 * UI content types (lowercase, for display/styling)
 */
export type UIContentType = 'video' | 'podcast' | 'article' | 'post';

/**
 * API provider types (uppercase, from backend)
 */
export type Provider = 'YOUTUBE' | 'SPOTIFY' | 'RSS' | 'SUBSTACK' | 'WEB' | 'X';

/**
 * UI provider types (lowercase, for display/styling)
 */
export type UIProvider = 'youtube' | 'spotify' | 'rss' | 'substack' | 'web' | 'x';

// ============================================================================
// Type Mapping
// ============================================================================

/**
 * Normalize content type to lowercase for consistent comparison
 */
function normalizeContentType(type: ContentType | UIContentType): UIContentType {
  return type.toLowerCase() as UIContentType;
}

/**
 * Normalize provider to lowercase for consistent comparison
 */
function normalizeProvider(provider: Provider | UIProvider): UIProvider {
  return provider.toLowerCase() as UIProvider;
}

/**
 * Map API content type to UI content type (lowercase)
 *
 * @param apiType - Uppercase content type from API
 * @returns Lowercase content type for UI
 *
 * @example
 * mapContentType('VIDEO')   // 'video'
 * mapContentType('PODCAST') // 'podcast'
 */
export function mapContentType(apiType: ContentType): UIContentType {
  return apiType.toLowerCase() as UIContentType;
}

/**
 * Map API provider to UI provider (lowercase)
 *
 * @param apiProvider - Uppercase provider from API
 * @returns Lowercase provider for UI
 *
 * @example
 * mapProvider('YOUTUBE') // 'youtube'
 * mapProvider('SPOTIFY') // 'spotify'
 */
export function mapProvider(apiProvider: Provider): UIProvider {
  return apiProvider.toLowerCase() as UIProvider;
}

// ============================================================================
// Icon Helpers
// ============================================================================

/**
 * Get the appropriate icon component for a content type
 *
 * @param type - Content type (accepts both API and UI types)
 * @param size - Icon size in pixels (default: 24)
 * @param color - Icon color (default: '#fff')
 * @returns React element with the appropriate icon
 *
 * @example
 * getContentIcon('video', 16, '#fff')    // VideoIcon
 * getContentIcon('PODCAST', 20, '#000')  // HeadphonesIcon
 */
export function getContentIcon(
  type: ContentType | UIContentType,
  size = 24,
  color = '#fff'
): React.ReactElement {
  const normalized = normalizeContentType(type);

  switch (normalized) {
    case 'podcast':
      return React.createElement(HeadphonesIcon, { size, color });
    case 'video':
      return React.createElement(VideoIcon, { size, color });
    case 'article':
      return React.createElement(ArticleIcon, { size, color });
    case 'post':
    default:
      return React.createElement(BookmarkIcon, { size, color });
  }
}

// ============================================================================
// Color Helpers
// ============================================================================

/**
 * Get the theme color for a content type
 *
 * @param type - Content type (accepts both API and UI types)
 * @returns Hex color string from ContentColors
 *
 * @example
 * getContentColor('video')   // '#EF4444' (red)
 * getContentColor('PODCAST') // '#8B5CF6' (purple)
 */
export function getContentColor(type: ContentType | UIContentType): string {
  const normalized = normalizeContentType(type);

  switch (normalized) {
    case 'podcast':
      return ContentColors.podcast;
    case 'video':
      return ContentColors.video;
    case 'article':
      return ContentColors.article;
    case 'post':
      return ContentColors.post;
    default:
      return '#6366F1'; // Fallback to primary indigo
  }
}

/**
 * Get the theme color for a provider
 *
 * @param provider - Provider (accepts both API and UI types)
 * @returns Hex color string from ProviderColors
 *
 * @example
 * getProviderColor('youtube') // '#FF0000'
 * getProviderColor('SPOTIFY') // '#1DB954'
 */
export function getProviderColor(provider: Provider | UIProvider): string {
  const normalized = normalizeProvider(provider);

  switch (normalized) {
    case 'youtube':
      return ProviderColors.youtube;
    case 'spotify':
      return ProviderColors.spotify;
    case 'substack':
      return ProviderColors.substack;
    case 'web':
      return '#6366F1'; // Indigo for web links
    case 'x':
      return ProviderColors.x;
    case 'rss':
    default:
      return '#6366F1'; // Fallback to primary indigo
  }
}

// ============================================================================
// Label Helpers
// ============================================================================

/**
 * Get human-readable label for content type
 *
 * @param type - Content type (accepts both API and UI types)
 * @returns Capitalized label string
 *
 * @example
 * getContentTypeLabel('video')   // 'Video'
 * getContentTypeLabel('PODCAST') // 'Podcast'
 */
export function getContentTypeLabel(type: ContentType | UIContentType): string {
  const normalized = normalizeContentType(type);

  switch (normalized) {
    case 'podcast':
      return 'Podcast';
    case 'video':
      return 'Video';
    case 'article':
      return 'Article';
    case 'post':
      return 'Post';
    default:
      return 'Content';
  }
}

/**
 * Get human-readable label for provider
 *
 * @param provider - Provider (accepts both API and UI types)
 * @returns Properly cased provider name (empty string for web - shows author only)
 *
 * @example
 * getProviderLabel('youtube') // 'YouTube'
 * getProviderLabel('SPOTIFY') // 'Spotify'
 * getProviderLabel('WEB')     // '' (empty - web links show author name only)
 */
export function getProviderLabel(provider: Provider | UIProvider): string {
  const normalized = normalizeProvider(provider);

  switch (normalized) {
    case 'youtube':
      return 'YouTube';
    case 'spotify':
      return 'Spotify';
    case 'substack':
      return 'Substack';
    case 'x':
      return 'X';
    case 'rss':
      return 'RSS';
    case 'web':
      return ''; // Web links show author name only, no provider label
    default:
      return 'Unknown';
  }
}

// ============================================================================
// Aspect Ratio Helpers
// ============================================================================

/**
 * Get the appropriate aspect ratio for cover images based on content type
 *
 * All content types use a consistent 16:10 aspect ratio for uniform card sizing.
 * Square content (podcasts) will be zoomed/cropped to fill via contentFit="cover".
 *
 * @param type - Content type (accepts both API and UI types)
 * @returns Aspect ratio as a number (width / height)
 *
 * @example
 * getContentAspectRatio('PODCAST') // 1.6 (16/10)
 * getContentAspectRatio('video')   // 1.6 (16/10)
 * getContentAspectRatio('article') // 1.6 (16/10)
 */
export function getContentAspectRatio(_type: ContentType | UIContentType): number {
  // Use consistent 16:10 aspect ratio for all content types
  return 16 / 10;
}

/**
 * Check if content type should display as square (podcast)
 *
 * Note: Currently returns false for all types as we use consistent 16:10 aspect ratio.
 * Square podcast images are zoomed/cropped to fill via contentFit="cover".
 *
 * @param type - Content type (accepts both API and UI types)
 * @returns true if content should be square (currently always false)
 *
 * @example
 * isSquareContent('PODCAST') // false
 * isSquareContent('video')   // false
 */
export function isSquareContent(_type: ContentType | UIContentType): boolean {
  // All content uses consistent 16:10 aspect ratio
  return false;
}

/**
 * Check if content type is video (for play button overlay)
 *
 * @param type - Content type (accepts both API and UI types)
 * @returns true if content is video
 *
 * @example
 * isVideoContent('VIDEO') // true
 * isVideoContent('article') // false
 */
export function isVideoContent(type: ContentType | UIContentType): boolean {
  return normalizeContentType(type) === 'video';
}

/**
 * Check if content type is podcast (for audio-specific UI)
 *
 * @param type - Content type (accepts both API and UI types)
 * @returns true if content is podcast
 *
 * @example
 * isPodcastContent('PODCAST') // true
 * isPodcastContent('video') // false
 */
export function isPodcastContent(type: ContentType | UIContentType): boolean {
  return normalizeContentType(type) === 'podcast';
}

// ============================================================================
// Image URL Helpers
// ============================================================================

/**
 * Upgrade YouTube channel avatar URL to high resolution.
 *
 * YouTube channel avatars use a size parameter like `=s88` (88 pixels).
 * This function replaces it with `=s800` for sharper images on high-DPI displays.
 *
 * Works with URLs from both:
 * - yt3.ggpht.com (older format)
 * - yt3.googleusercontent.com (newer format)
 *
 * @param url - The image URL (may be null/undefined)
 * @param targetSize - Target size in pixels (default: 800)
 * @returns Upgraded URL or original if not a YouTube channel avatar
 *
 * @example
 * upgradeYouTubeImageUrl('https://yt3.ggpht.com/abc=s88-c-k') // '...=s800-c-k'
 * upgradeYouTubeImageUrl('https://example.com/img.jpg')        // unchanged
 * upgradeYouTubeImageUrl(null)                                 // null
 */
export function upgradeYouTubeImageUrl(
  url: string | null | undefined,
  targetSize: number = 800
): string | null | undefined {
  if (!url) return url;

  // Match YouTube channel avatar URLs (yt3.ggpht.com or yt3.googleusercontent.com)
  if (url.includes('yt3.ggpht.com') || url.includes('yt3.googleusercontent.com')) {
    // Replace size parameter (e.g., =s88 or =s176) with target size
    return url.replace(/=s\d+/, `=s${targetSize}`);
  }

  return url;
}

/**
 * Spotify image quality identifiers:
 *
 * Album art (ab67616d0000 prefix):
 * - 1e02, f848: 300x300
 * - b273, d452: 640x640
 * - 82c1: 1400x1400
 *
 * Podcast/Show art (ab6765630000 prefix):
 * - f68d: 64x64
 * - 5f1f: 300x300
 * - ba8a: 640x640
 *
 * Upgrades Spotify CDN image URLs to use the highest available resolution.
 * - Album art: upgraded to 1400x1400 (82c1)
 * - Podcast art: upgraded to 640x640 (ba8a) - max available
 *
 * Non-Spotify URLs are returned unchanged.
 *
 * @param url - The image URL (may be Spotify CDN or other)
 * @returns The upgraded URL for Spotify images, or the original URL for others
 *
 * @example
 * upgradeSpotifyImageUrl('https://i.scdn.co/image/ab67616d0000b273abc123')   // album -> 1400px
 * upgradeSpotifyImageUrl('https://i.scdn.co/image/ab6765630000f68dabc123')   // podcast -> 640px
 * upgradeSpotifyImageUrl('https://example.com/img.jpg')                      // unchanged
 * upgradeSpotifyImageUrl(null)                                               // null
 */
export function upgradeSpotifyImageUrl(url: string | null | undefined): string | null | undefined {
  if (!url) return url;

  // Match Spotify CDN image URLs (i.scdn.co/image/)
  if (url.includes('i.scdn.co/image/')) {
    // Album art: upgrade to 1400x1400 (82c1)
    // JPEG: 1e02, f848 (300px), b273, d452 (640px)
    let upgraded = url.replace(/ab67616d0000(1e02|f848|b273|d452)/, 'ab67616d000082c1');

    // Podcast/Show art: upgrade to 640x640 (ba8a) - max available
    // f68d (64px), 5f1f (300px) -> ba8a (640px)
    upgraded = upgraded.replace(/ab6765630000(f68d|5f1f)/, 'ab6765630000ba8a');

    return upgraded;
  }

  return url;
}
