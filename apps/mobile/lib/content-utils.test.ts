/**
 * Tests for lib/content-utils.ts
 *
 * Comprehensive tests for content type utilities including:
 * - Type mapping functions
 * - Color helpers
 * - Label helpers
 * - Aspect ratio helpers
 *
 * Note: Icon helper tests are skipped as they require React Native runtime.
 */

// Mock theme constants before importing content-utils
jest.mock('@/constants/theme', () => ({
  ContentColors: {
    video: '#EF4444',
    podcast: '#8B5CF6',
    article: '#3B82F6',
    post: '#10B981',
  },
  ProviderColors: {
    youtube: '#FF0000',
    spotify: '#1DB954',
    substack: '#FF6719',
  },
}));

// Mock icon components
jest.mock('@/components/icons', () => ({
  HeadphonesIcon: 'HeadphonesIcon',
  VideoIcon: 'VideoIcon',
  ArticleIcon: 'ArticleIcon',
  BookmarkIcon: 'BookmarkIcon',
}));

import {
  mapContentType,
  mapProvider,
  getContentColor,
  getProviderColor,
  getContentTypeLabel,
  getProviderLabel,
  getContentAspectRatio,
  isSquareContent,
  isVideoContent,
  isPodcastContent,
  upgradeYouTubeImageUrl,
} from './content-utils';
import { ContentType, Provider } from '@zine/shared';

// ============================================================================
// Type Mapping Tests
// ============================================================================

describe('mapContentType', () => {
  it('maps VIDEO to video', () => {
    expect(mapContentType(ContentType.VIDEO)).toBe('video');
  });

  it('maps PODCAST to podcast', () => {
    expect(mapContentType(ContentType.PODCAST)).toBe('podcast');
  });

  it('maps ARTICLE to article', () => {
    expect(mapContentType(ContentType.ARTICLE)).toBe('article');
  });

  it('maps POST to post', () => {
    expect(mapContentType(ContentType.POST)).toBe('post');
  });
});

describe('mapProvider', () => {
  it('maps YOUTUBE to youtube', () => {
    expect(mapProvider(Provider.YOUTUBE)).toBe('youtube');
  });

  it('maps SPOTIFY to spotify', () => {
    expect(mapProvider(Provider.SPOTIFY)).toBe('spotify');
  });

  it('maps RSS to rss', () => {
    expect(mapProvider(Provider.RSS)).toBe('rss');
  });

  it('maps SUBSTACK to substack', () => {
    expect(mapProvider(Provider.SUBSTACK)).toBe('substack');
  });
});

// ============================================================================
// Color Helper Tests
// ============================================================================

describe('getContentColor', () => {
  it('returns correct color for video', () => {
    expect(getContentColor('video')).toBe('#EF4444');
  });

  it('returns correct color for VIDEO (uppercase)', () => {
    expect(getContentColor(ContentType.VIDEO)).toBe('#EF4444');
  });

  it('returns correct color for podcast', () => {
    expect(getContentColor('podcast')).toBe('#8B5CF6');
  });

  it('returns correct color for article', () => {
    expect(getContentColor('article')).toBe('#3B82F6');
  });

  it('returns correct color for post', () => {
    expect(getContentColor('post')).toBe('#10B981');
  });
});

describe('getProviderColor', () => {
  it('returns correct color for youtube', () => {
    expect(getProviderColor('youtube')).toBe('#FF0000');
  });

  it('returns correct color for YOUTUBE (uppercase)', () => {
    expect(getProviderColor(Provider.YOUTUBE)).toBe('#FF0000');
  });

  it('returns correct color for spotify', () => {
    expect(getProviderColor('spotify')).toBe('#1DB954');
  });

  it('returns correct color for substack', () => {
    expect(getProviderColor('substack')).toBe('#FF6719');
  });

  it('returns fallback color for rss', () => {
    expect(getProviderColor('rss')).toBe('#6366F1');
  });
});

// ============================================================================
// Label Helper Tests
// ============================================================================

describe('getContentTypeLabel', () => {
  it('returns "Video" for video', () => {
    expect(getContentTypeLabel('video')).toBe('Video');
  });

  it('returns "Podcast" for podcast', () => {
    expect(getContentTypeLabel('podcast')).toBe('Podcast');
  });

  it('returns "Article" for article', () => {
    expect(getContentTypeLabel('article')).toBe('Article');
  });

  it('returns "Post" for post', () => {
    expect(getContentTypeLabel('post')).toBe('Post');
  });

  it('handles uppercase input', () => {
    expect(getContentTypeLabel(ContentType.VIDEO)).toBe('Video');
  });
});

describe('getProviderLabel', () => {
  it('returns "YouTube" for youtube', () => {
    expect(getProviderLabel('youtube')).toBe('YouTube');
  });

  it('returns "Spotify" for spotify', () => {
    expect(getProviderLabel('spotify')).toBe('Spotify');
  });

  it('returns "Substack" for substack', () => {
    expect(getProviderLabel('substack')).toBe('Substack');
  });

  it('returns "RSS" for rss', () => {
    expect(getProviderLabel('rss')).toBe('RSS');
  });

  it('handles uppercase input', () => {
    expect(getProviderLabel(Provider.YOUTUBE)).toBe('YouTube');
  });
});

// ============================================================================
// Aspect Ratio Helper Tests
// ============================================================================

describe('getContentAspectRatio', () => {
  it('returns 16/10 for podcast (consistent aspect ratio)', () => {
    expect(getContentAspectRatio('podcast')).toBeCloseTo(16 / 10);
  });

  it('returns 16/10 for video (consistent aspect ratio)', () => {
    expect(getContentAspectRatio('video')).toBeCloseTo(16 / 10);
  });

  it('returns 16/10 for article', () => {
    expect(getContentAspectRatio('article')).toBeCloseTo(16 / 10);
  });

  it('returns 16/10 for post', () => {
    expect(getContentAspectRatio('post')).toBeCloseTo(16 / 10);
  });

  it('handles uppercase input', () => {
    expect(getContentAspectRatio(ContentType.PODCAST)).toBeCloseTo(16 / 10);
  });
});

describe('isSquareContent', () => {
  it('returns false for podcast (now uses consistent 16:10 aspect ratio)', () => {
    expect(isSquareContent('podcast')).toBe(false);
  });

  it('returns false for PODCAST (now uses consistent 16:10 aspect ratio)', () => {
    expect(isSquareContent(ContentType.PODCAST)).toBe(false);
  });

  it('returns false for video', () => {
    expect(isSquareContent('video')).toBe(false);
  });

  it('returns false for article', () => {
    expect(isSquareContent('article')).toBe(false);
  });
});

describe('isVideoContent', () => {
  it('returns true for video', () => {
    expect(isVideoContent('video')).toBe(true);
  });

  it('returns true for VIDEO', () => {
    expect(isVideoContent(ContentType.VIDEO)).toBe(true);
  });

  it('returns false for podcast', () => {
    expect(isVideoContent('podcast')).toBe(false);
  });

  it('returns false for article', () => {
    expect(isVideoContent('article')).toBe(false);
  });
});

describe('isPodcastContent', () => {
  it('returns true for podcast', () => {
    expect(isPodcastContent('podcast')).toBe(true);
  });

  it('returns true for PODCAST', () => {
    expect(isPodcastContent(ContentType.PODCAST)).toBe(true);
  });

  it('returns false for video', () => {
    expect(isPodcastContent('video')).toBe(false);
  });

  it('returns false for article', () => {
    expect(isPodcastContent('article')).toBe(false);
  });
});

// ============================================================================
// Image URL Helper Tests
// ============================================================================

describe('upgradeYouTubeImageUrl', () => {
  it('upgrades yt3.ggpht.com URLs from s88 to s800', () => {
    const url = 'https://yt3.ggpht.com/ytc/abc123=s88-c-k-c0x00ffffff-no-rj';
    expect(upgradeYouTubeImageUrl(url)).toBe(
      'https://yt3.ggpht.com/ytc/abc123=s800-c-k-c0x00ffffff-no-rj'
    );
  });

  it('upgrades yt3.googleusercontent.com URLs from s88 to s800', () => {
    const url = 'https://yt3.googleusercontent.com/abc123=s88-c-k-c0x00ffffff-no-rj';
    expect(upgradeYouTubeImageUrl(url)).toBe(
      'https://yt3.googleusercontent.com/abc123=s800-c-k-c0x00ffffff-no-rj'
    );
  });

  it('upgrades from different sizes (s176)', () => {
    const url = 'https://yt3.ggpht.com/ytc/abc123=s176-c-k';
    expect(upgradeYouTubeImageUrl(url)).toBe('https://yt3.ggpht.com/ytc/abc123=s800-c-k');
  });

  it('accepts custom target size', () => {
    const url = 'https://yt3.ggpht.com/ytc/abc123=s88-c-k';
    expect(upgradeYouTubeImageUrl(url, 400)).toBe('https://yt3.ggpht.com/ytc/abc123=s400-c-k');
  });

  it('returns non-YouTube URLs unchanged', () => {
    const url = 'https://example.com/image.jpg';
    expect(upgradeYouTubeImageUrl(url)).toBe(url);
  });

  it('returns Spotify image URLs unchanged', () => {
    const url = 'https://i.scdn.co/image/abc123';
    expect(upgradeYouTubeImageUrl(url)).toBe(url);
  });

  it('returns null for null input', () => {
    expect(upgradeYouTubeImageUrl(null)).toBe(null);
  });

  it('returns undefined for undefined input', () => {
    expect(upgradeYouTubeImageUrl(undefined)).toBe(undefined);
  });
});
