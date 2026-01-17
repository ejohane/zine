/**
 * Tests for Link Preview Orchestration Module
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { fetchLinkPreview, type PreviewContext } from './link-preview';
import { Provider, ContentType } from '@zine/shared';

// Mock dependencies
vi.mock('./oembed', () => ({
  fetchYouTubeOEmbed: vi.fn(),
  fetchSpotifyOEmbed: vi.fn(),
  fetchTwitterOEmbed: vi.fn(),
}));

vi.mock('./fxtwitter', () => ({
  fetchFxTwitterByUrl: vi.fn(),
}));

vi.mock('./opengraph', () => ({
  scrapeOpenGraph: vi.fn(),
}));

vi.mock('../providers/spotify', () => ({
  getEpisode: vi.fn(),
}));

vi.mock('./article-extractor', () => ({
  extractArticle: vi.fn(),
}));

vi.mock('./favicon', () => ({
  fetchFavicon: vi.fn(),
}));

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

// Import mocked modules and cast them
import { fetchYouTubeOEmbed, fetchSpotifyOEmbed, fetchTwitterOEmbed } from './oembed';
import { scrapeOpenGraph } from './opengraph';
import { getEpisode } from '../providers/spotify';
import { fetchFxTwitterByUrl } from './fxtwitter';
import { extractArticle } from './article-extractor';
import { fetchFavicon } from './favicon';

// Cast mock functions for type safety
const mockFetchYouTubeOEmbed = fetchYouTubeOEmbed as Mock;
const mockFetchSpotifyOEmbed = fetchSpotifyOEmbed as Mock;
const mockFetchTwitterOEmbed = fetchTwitterOEmbed as Mock;
const mockScrapeOpenGraph = scrapeOpenGraph as Mock;
const mockGetEpisode = getEpisode as Mock;
const mockFetchFxTwitterByUrl = fetchFxTwitterByUrl as Mock;
const mockExtractArticle = extractArticle as Mock;
const mockFetchFavicon = fetchFavicon as Mock;

describe('link-preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('fetchLinkPreview', () => {
    describe('invalid URLs', () => {
      it('returns null for invalid URL', async () => {
        const result = await fetchLinkPreview('not-a-url');
        expect(result).toBeNull();
      });

      it('returns null for empty string', async () => {
        const result = await fetchLinkPreview('');
        expect(result).toBeNull();
      });

      it('returns null for non-HTTP URL', async () => {
        const result = await fetchLinkPreview('ftp://example.com/file');
        expect(result).toBeNull();
      });
    });

    describe('YouTube URLs', () => {
      const youtubeUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

      it('fetches via oEmbed when no token provided', async () => {
        mockFetchYouTubeOEmbed.mockResolvedValue({
          title: 'Rick Astley - Never Gonna Give You Up',
          author_name: 'Rick Astley',
          author_url: 'https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw',
          thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
          provider_name: 'YouTube',
          provider_url: 'https://www.youtube.com/',
        });

        const result = await fetchLinkPreview(youtubeUrl);

        expect(result).not.toBeNull();
        expect(result!.provider).toBe(Provider.YOUTUBE);
        expect(result!.contentType).toBe(ContentType.VIDEO);
        expect(result!.providerId).toBe('dQw4w9WgXcQ');
        expect(result!.title).toBe('Rick Astley - Never Gonna Give You Up');
        expect(result!.creator).toBe('Rick Astley');
        expect(result!.thumbnailUrl).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
        expect(result!.source).toBe('oembed');
        expect(result!.duration).toBeNull(); // oEmbed doesn't provide duration
      });

      it('falls back to oEmbed even with token (API not implemented)', async () => {
        mockFetchYouTubeOEmbed.mockResolvedValue({
          title: 'Test Video',
          author_name: 'Test Channel',
          provider_name: 'YouTube',
          provider_url: 'https://www.youtube.com/',
        });

        const context: PreviewContext = {
          accessTokens: { youtube: 'fake-token' },
        };

        const result = await fetchLinkPreview(youtubeUrl, context);

        expect(result).not.toBeNull();
        expect(result!.source).toBe('oembed');
        expect(fetchYouTubeOEmbed).toHaveBeenCalled();
      });

      it('falls back to Open Graph if oEmbed fails', async () => {
        mockFetchYouTubeOEmbed.mockResolvedValue(null);
        mockScrapeOpenGraph.mockResolvedValue({
          title: 'Fallback Title',
          description: 'Some description',
          image: 'https://example.com/image.jpg',
          siteName: 'YouTube',
          url: null,
          type: 'video',
          author: null,
          authorImageUrl: null,
        });

        const result = await fetchLinkPreview(youtubeUrl);

        expect(result).not.toBeNull();
        expect(result!.title).toBe('Fallback Title');
        expect(result!.source).toBe('opengraph');
      });

      it('uses fallback result when all methods fail', async () => {
        mockFetchYouTubeOEmbed.mockResolvedValue(null);
        mockScrapeOpenGraph.mockResolvedValue({
          title: null,
          description: null,
          image: null,
          siteName: null,
          url: null,
          type: null,
          author: null,
          authorImageUrl: null,
        });

        const result = await fetchLinkPreview(youtubeUrl);

        expect(result).not.toBeNull();
        expect(result!.source).toBe('fallback');
        expect(result!.provider).toBe(Provider.YOUTUBE);
        expect(result!.providerId).toBe('dQw4w9WgXcQ');
      });

      it('handles youtu.be short URLs', async () => {
        mockFetchYouTubeOEmbed.mockResolvedValue({
          title: 'Short URL Video',
          author_name: 'Creator',
          provider_name: 'YouTube',
          provider_url: 'https://www.youtube.com/',
        });

        const result = await fetchLinkPreview('https://youtu.be/abc12345678');

        expect(result).not.toBeNull();
        expect(result!.provider).toBe(Provider.YOUTUBE);
        expect(result!.providerId).toBe('abc12345678');
      });
    });

    describe('Spotify URLs', () => {
      const spotifyUrl = 'https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk';
      const episodeId = '4rOoJ6Egrf8K2IrywzwOMk';

      it('fetches via API when token provided', async () => {
        mockGetEpisode.mockResolvedValue({
          id: episodeId,
          name: 'Amazing Podcast Episode',
          description: 'This is an amazing episode about something interesting.',
          releaseDate: '2024-01-15',
          durationMs: 3600000, // 1 hour
          externalUrl: spotifyUrl,
          images: [{ url: 'https://i.scdn.co/image/abc123', height: 640, width: 640 }],
          isPlayable: true,
        });

        const context: PreviewContext = {
          accessTokens: { spotify: 'fake-spotify-token' },
        };

        const result = await fetchLinkPreview(spotifyUrl, context);

        expect(result).not.toBeNull();
        expect(result!.provider).toBe(Provider.SPOTIFY);
        expect(result!.contentType).toBe(ContentType.PODCAST);
        expect(result!.providerId).toBe(episodeId);
        expect(result!.title).toBe('Amazing Podcast Episode');
        expect(result!.duration).toBe(3600); // Converted from ms to seconds
        expect(result!.thumbnailUrl).toBe('https://i.scdn.co/image/abc123');
        expect(result!.description).toBe('This is an amazing episode about something interesting.');
        expect(result!.source).toBe('provider_api');
      });

      it('falls back to oEmbed when no token provided', async () => {
        mockFetchSpotifyOEmbed.mockResolvedValue({
          title: 'Podcast Episode Title',
          author_name: 'Podcast Host',
          thumbnail_url: 'https://i.scdn.co/image/fallback',
          provider_name: 'Spotify',
          provider_url: 'https://spotify.com/',
        });

        const result = await fetchLinkPreview(spotifyUrl);

        expect(result).not.toBeNull();
        expect(result!.source).toBe('oembed');
        expect(result!.title).toBe('Podcast Episode Title');
        expect(getEpisode).not.toHaveBeenCalled();
        expect(fetchSpotifyOEmbed).toHaveBeenCalled();
      });

      it('falls back to oEmbed when API fails', async () => {
        mockGetEpisode.mockRejectedValue(new Error('API error'));
        mockFetchSpotifyOEmbed.mockResolvedValue({
          title: 'oEmbed Fallback',
          author_name: 'Host',
          provider_name: 'Spotify',
          provider_url: 'https://spotify.com/',
        });

        const context: PreviewContext = {
          accessTokens: { spotify: 'fake-token' },
        };

        const result = await fetchLinkPreview(spotifyUrl, context);

        expect(result).not.toBeNull();
        expect(result!.source).toBe('oembed');
        expect(result!.title).toBe('oEmbed Fallback');
      });

      it('falls back to oEmbed when episode not found', async () => {
        mockGetEpisode.mockResolvedValue(null);
        mockFetchSpotifyOEmbed.mockResolvedValue({
          title: 'oEmbed Title',
          author_name: 'Host',
          provider_name: 'Spotify',
          provider_url: 'https://spotify.com/',
        });

        const context: PreviewContext = {
          accessTokens: { spotify: 'fake-token' },
        };

        const result = await fetchLinkPreview(spotifyUrl, context);

        expect(result).not.toBeNull();
        expect(result!.source).toBe('oembed');
      });
    });

    describe('Twitter/X URLs', () => {
      it('fetches via FxTwitter for twitter.com URLs', async () => {
        mockFetchFxTwitterByUrl.mockResolvedValue({
          code: 200,
          message: 'OK',
          tweet: {
            id: '1234567890',
            url: 'https://x.com/testuser/status/1234567890',
            text: 'Just posted something interesting! Check it out...',
            created_at: 'Sun Jul 17 09:35:58 +0000 2022',
            created_timestamp: 1658050558,
            author: {
              name: 'Test User',
              screen_name: 'testuser',
              avatar_url: 'https://pbs.twimg.com/profile_images/avatar.jpg',
            },
            likes: 100,
            retweets: 50,
            replies: 10,
            views: 1000,
            lang: 'en',
            source: 'Twitter Web App',
          },
        });

        const result = await fetchLinkPreview('https://twitter.com/testuser/status/1234567890');

        expect(result).not.toBeNull();
        expect(result!.provider).toBe(Provider.X); // Twitter maps to X provider
        expect(result!.contentType).toBe(ContentType.POST);
        expect(result!.title).toBe('Just posted something interesting! Check it out...');
        expect(result!.creator).toBe('Test User (@testuser)');
        expect(result!.source).toBe('fxtwitter');
      });

      it('fetches via FxTwitter for x.com URLs', async () => {
        mockFetchFxTwitterByUrl.mockResolvedValue({
          code: 200,
          message: 'OK',
          tweet: {
            id: '9876543210',
            url: 'https://x.com/xuser/status/9876543210',
            text: 'X post content',
            created_at: 'Sun Jul 17 09:35:58 +0000 2022',
            created_timestamp: 1658050558,
            author: {
              name: 'X User',
              screen_name: 'xuser',
              avatar_url: 'https://pbs.twimg.com/profile_images/avatar.jpg',
            },
            likes: 100,
            retweets: 50,
            replies: 10,
            views: 1000,
            lang: 'en',
            source: 'Twitter Web App',
          },
        });

        const result = await fetchLinkPreview('https://x.com/xuser/status/9876543210');

        expect(result).not.toBeNull();
        expect(result!.creator).toBe('X User (@xuser)');
        expect(result!.source).toBe('fxtwitter');
      });

      it('falls back to oEmbed if FxTwitter fails', async () => {
        mockFetchFxTwitterByUrl.mockResolvedValue(null);
        mockFetchTwitterOEmbed.mockResolvedValue({
          title: 'Tweet from oEmbed',
          author_name: 'oEmbed User',
          provider_name: 'Twitter',
          provider_url: 'https://twitter.com/',
        });

        const result = await fetchLinkPreview('https://twitter.com/user/status/123456789012345678');

        expect(result).not.toBeNull();
        expect(result!.source).toBe('oembed');
        expect(result!.title).toBe('Tweet from oEmbed');
      });
    });

    describe('Substack URLs', () => {
      it('fetches via Open Graph', async () => {
        mockScrapeOpenGraph.mockResolvedValue({
          title: 'Interesting Newsletter Post',
          description: 'A deep dive into something fascinating.',
          image: 'https://substackcdn.com/image/fetch/xyz',
          siteName: 'Cool Newsletter',
          url: 'https://coolnewsletter.substack.com/p/interesting-post',
          type: 'article',
          author: 'Newsletter Author',
          authorImageUrl: null,
        });

        const result = await fetchLinkPreview(
          'https://coolnewsletter.substack.com/p/interesting-post'
        );

        expect(result).not.toBeNull();
        expect(result!.provider).toBe(Provider.SUBSTACK);
        expect(result!.contentType).toBe(ContentType.ARTICLE);
        expect(result!.title).toBe('Interesting Newsletter Post');
        expect(result!.creator).toBe('Newsletter Author');
        expect(result!.description).toBe('A deep dive into something fascinating.');
        expect(result!.source).toBe('opengraph');
      });

      it('uses siteName as fallback creator when author missing', async () => {
        mockScrapeOpenGraph.mockResolvedValue({
          title: 'Post Title',
          description: null,
          image: null,
          siteName: 'Tech Newsletter',
          url: null,
          type: null,
          author: null,
          authorImageUrl: null,
        });

        const result = await fetchLinkPreview('https://tech.substack.com/p/some-post');

        expect(result).not.toBeNull();
        expect(result!.creator).toBe('Tech Newsletter');
      });
    });

    describe('Generic URLs', () => {
      it('fetches via Open Graph for generic articles', async () => {
        mockExtractArticle.mockResolvedValue(null);
        mockScrapeOpenGraph.mockResolvedValue({
          title: 'Generic Article Title',
          description: 'Article description here',
          image: 'https://example.com/og-image.png',
          siteName: 'Example Blog',
          url: 'https://example.com/blog/article',
          type: 'article',
          author: 'Blog Author',
          authorImageUrl: null,
        });
        mockFetchFavicon.mockResolvedValue(null);

        const result = await fetchLinkPreview('https://example.com/blog/article');

        expect(result).not.toBeNull();
        expect(result!.provider).toBe(Provider.WEB);
        expect(result!.contentType).toBe(ContentType.ARTICLE);
        expect(result!.title).toBe('Generic Article Title');
        expect(result!.creator).toBe('Blog Author');
        expect(result!.source).toBe('opengraph');
      });

      it('creates fallback result when Open Graph fails', async () => {
        mockExtractArticle.mockResolvedValue(null);
        mockScrapeOpenGraph.mockResolvedValue({
          title: null,
          description: null,
          image: null,
          siteName: null,
          url: null,
          type: null,
          author: null,
          authorImageUrl: null,
        });

        const result = await fetchLinkPreview('https://example.com/some-article-slug');

        expect(result).not.toBeNull();
        expect(result!.source).toBe('fallback');
        expect(result!.title).toBe('some article slug'); // Cleaned from URL
        expect(result!.creator).toBe('example.com');
      });

      it('handles URLs with no path gracefully', async () => {
        mockExtractArticle.mockResolvedValue(null);
        mockScrapeOpenGraph.mockResolvedValue({
          title: null,
          description: null,
          image: null,
          siteName: null,
          url: null,
          type: null,
          author: null,
          authorImageUrl: null,
        });

        const result = await fetchLinkPreview('https://example.com');

        expect(result).not.toBeNull();
        expect(result!.source).toBe('fallback');
        expect(result!.creator).toBe('example.com');
      });
    });

    describe('WEB provider creatorImageUrl fallback chain', () => {
      it('uses authorImageUrl from article extractor when available', async () => {
        mockExtractArticle.mockResolvedValue({
          title: 'Test Article',
          author: 'Test Author',
          authorImageUrl: 'https://example.com/author.jpg',
          siteName: 'Test Site',
          publishedAt: null,
          thumbnailUrl: 'https://example.com/thumb.jpg',
          excerpt: 'Test excerpt',
          wordCount: 500,
          readingTimeMinutes: 3,
          content: '<p>Content</p>',
          isArticle: true,
        });

        const result = await fetchLinkPreview('https://example.com/article');

        expect(result).not.toBeNull();
        expect(result!.creatorImageUrl).toBe('https://example.com/author.jpg');
        expect(result!.source).toBe('article_extractor');
        expect(mockFetchFavicon).not.toHaveBeenCalled();
      });

      it('falls back to favicon when no authorImageUrl', async () => {
        mockExtractArticle.mockResolvedValue({
          title: 'Test Article',
          author: 'Test Author',
          authorImageUrl: null,
          siteName: 'Test Site',
          publishedAt: null,
          thumbnailUrl: 'https://example.com/thumb.jpg',
          excerpt: 'Test excerpt',
          wordCount: 500,
          readingTimeMinutes: 3,
          content: '<p>Content</p>',
          isArticle: true,
        });
        mockFetchFavicon.mockResolvedValue('https://example.com/favicon.ico');

        const result = await fetchLinkPreview('https://example.com/article');

        expect(result).not.toBeNull();
        expect(result!.creatorImageUrl).toBe('https://example.com/favicon.ico');
        expect(result!.source).toBe('article_extractor');
        expect(mockFetchFavicon).toHaveBeenCalledWith('https://example.com/article');
      });

      it('leaves creatorImageUrl undefined when no authorImageUrl and no favicon', async () => {
        mockExtractArticle.mockResolvedValue({
          title: 'Test Article',
          author: 'Test Author',
          authorImageUrl: null,
          siteName: 'Test Site',
          publishedAt: null,
          thumbnailUrl: 'https://example.com/thumb.jpg',
          excerpt: 'Test excerpt',
          wordCount: 500,
          readingTimeMinutes: 3,
          content: '<p>Content</p>',
          isArticle: true,
        });
        mockFetchFavicon.mockResolvedValue(null);

        const result = await fetchLinkPreview('https://example.com/article');

        expect(result).not.toBeNull();
        expect(result!.creatorImageUrl).toBeUndefined();
        expect(result!.source).toBe('article_extractor');
        expect(mockFetchFavicon).toHaveBeenCalledWith('https://example.com/article');
      });

      it('uses authorImageUrl from OG data when article extraction fails', async () => {
        mockExtractArticle.mockResolvedValue(null);
        mockScrapeOpenGraph.mockResolvedValue({
          title: 'OG Article',
          description: 'Description',
          image: 'https://example.com/og-image.jpg',
          siteName: 'Example Site',
          url: null,
          type: 'article',
          author: 'OG Author',
          authorImageUrl: 'https://example.com/og-author.jpg',
        });

        const result = await fetchLinkPreview('https://example.com/article');

        expect(result).not.toBeNull();
        expect(result!.creatorImageUrl).toBe('https://example.com/og-author.jpg');
        expect(result!.source).toBe('opengraph');
        expect(mockFetchFavicon).not.toHaveBeenCalled();
      });

      it('falls back to favicon for OG results without authorImageUrl', async () => {
        mockExtractArticle.mockResolvedValue(null);
        mockScrapeOpenGraph.mockResolvedValue({
          title: 'OG Article',
          description: 'Description',
          image: 'https://example.com/og-image.jpg',
          siteName: 'Example Site',
          url: null,
          type: 'article',
          author: 'OG Author',
          authorImageUrl: null,
        });
        mockFetchFavicon.mockResolvedValue('https://example.com/favicon.ico');

        const result = await fetchLinkPreview('https://example.com/article');

        expect(result).not.toBeNull();
        expect(result!.creatorImageUrl).toBe('https://example.com/favicon.ico');
        expect(result!.source).toBe('opengraph');
        expect(mockFetchFavicon).toHaveBeenCalled();
      });
    });

    describe('result shape', () => {
      it('always returns all required fields', async () => {
        mockFetchYouTubeOEmbed.mockResolvedValue({
          title: 'Test',
          author_name: 'Author',
          provider_name: 'YouTube',
          provider_url: 'https://youtube.com',
        });

        const result = await fetchLinkPreview('https://youtube.com/watch?v=test1234567');

        expect(result).toHaveProperty('provider');
        expect(result).toHaveProperty('contentType');
        expect(result).toHaveProperty('providerId');
        expect(result).toHaveProperty('title');
        expect(result).toHaveProperty('creator');
        expect(result).toHaveProperty('thumbnailUrl');
        expect(result).toHaveProperty('duration');
        expect(result).toHaveProperty('canonicalUrl');
        expect(result).toHaveProperty('source');
      });

      it('returns canonical URL from parsed link', async () => {
        mockFetchYouTubeOEmbed.mockResolvedValue({
          title: 'Test',
          author_name: 'Author',
          provider_name: 'YouTube',
          provider_url: 'https://youtube.com',
        });

        // URL with tracking params should get canonical URL
        const result = await fetchLinkPreview(
          'https://youtube.com/watch?v=test1234567&t=120&utm_source=share'
        );

        expect(result).not.toBeNull();
        // Canonical URL should be cleaned
        expect(result!.canonicalUrl).toBe('https://www.youtube.com/watch?v=test1234567');
      });
    });
  });
});
