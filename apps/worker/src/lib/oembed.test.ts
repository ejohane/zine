/**
 * Tests for oEmbed Client
 *
 * Tests the oEmbed client functionality for YouTube, Spotify, and Twitter.
 * All tests use mocked fetch responses to avoid external API calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchYouTubeOEmbed, fetchSpotifyOEmbed, fetchTwitterOEmbed } from './oembed';
import type { OEmbedResult } from './oembed';

// ============================================================================
// Mocks
// ============================================================================

// Mock logger to prevent console output during tests
vi.mock('./logger', () => ({
  logger: {
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// ============================================================================
// Test Fixtures
// ============================================================================

const YOUTUBE_OEMBED_RESPONSE = {
  title: 'Rick Astley - Never Gonna Give You Up (Official Music Video)',
  author_name: 'Rick Astley',
  author_url: 'https://www.youtube.com/@RickAstleyYT',
  type: 'video',
  height: 113,
  width: 200,
  version: '1.0',
  provider_name: 'YouTube',
  provider_url: 'https://www.youtube.com/',
  thumbnail_height: 360,
  thumbnail_width: 480,
  thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
  html: '<iframe width="200" height="113" src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>',
};

const SPOTIFY_OEMBED_RESPONSE = {
  title: 'Bohemian Rhapsody - Remastered 2011',
  type: 'rich',
  version: '1.0',
  provider_name: 'Spotify',
  provider_url: 'https://spotify.com',
  width: 456,
  height: 152,
  thumbnail_url: 'https://i.scdn.co/image/ab67616d00001e02e8b066f70c206551210d902b',
  thumbnail_width: 300,
  thumbnail_height: 300,
  html: '<iframe style="border-radius: 12px" width="100%" height="152" title="Spotify Embed: Bohemian Rhapsody - Remastered 2011 by Queen" frameborder="0" allowfullscreen allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" src="https://open.spotify.com/embed/track/4u7EnebtmKWzUH433cf5Qv"></iframe>',
};

const TWITTER_OEMBED_RESPONSE = {
  url: 'https://twitter.com/jack/status/20',
  author_name: 'jack',
  author_url: 'https://twitter.com/jack',
  html: '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">just setting up my twttr</p>&mdash; jack (@jack) <a href="https://twitter.com/jack/status/20">March 21, 2006</a></blockquote>',
  width: 550,
  height: null,
  type: 'rich',
  cache_age: '3153600000',
  provider_name: 'Twitter',
  provider_url: 'https://twitter.com',
  version: '1.0',
};

// ============================================================================
// Test Setup
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// YouTube oEmbed Tests
// ============================================================================

describe('fetchYouTubeOEmbed', () => {
  it('should fetch and return YouTube video metadata', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(YOUTUBE_OEMBED_RESPONSE),
    });

    const result = await fetchYouTubeOEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    expect(result).not.toBeNull();
    expect(result?.title).toBe('Rick Astley - Never Gonna Give You Up (Official Music Video)');
    expect(result?.author_name).toBe('Rick Astley');
    expect(result?.author_url).toBe('https://www.youtube.com/@RickAstleyYT');
    expect(result?.thumbnail_url).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    expect(result?.provider_name).toBe('YouTube');
    expect(result?.provider_url).toBe('https://www.youtube.com/');
  });

  it('should call correct YouTube oEmbed URL', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(YOUTUBE_OEMBED_RESPONSE),
    });

    await fetchYouTubeOEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('https://www.youtube.com/oembed');
    expect(calledUrl).toContain('url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ');
    expect(calledUrl).toContain('format=json');
  });

  it('should return null on HTTP error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
    });

    const result = await fetchYouTubeOEmbed('https://www.youtube.com/watch?v=invalid');

    expect(result).toBeNull();
  });

  it('should return null on network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await fetchYouTubeOEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    expect(result).toBeNull();
  });

  it('should return null on timeout', async () => {
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    mockFetch.mockRejectedValue(abortError);

    const result = await fetchYouTubeOEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    expect(result).toBeNull();
  });

  it('should include all available metadata fields', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(YOUTUBE_OEMBED_RESPONSE),
    });

    const result = await fetchYouTubeOEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    expect(result).toMatchObject({
      title: expect.any(String),
      author_name: expect.any(String),
      author_url: expect.any(String),
      thumbnail_url: expect.any(String),
      thumbnail_width: expect.any(Number),
      thumbnail_height: expect.any(Number),
      html: expect.any(String),
      provider_name: 'YouTube',
      provider_url: expect.any(String),
    } satisfies OEmbedResult);
  });

  it('should handle youtu.be short URLs', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(YOUTUBE_OEMBED_RESPONSE),
    });

    await fetchYouTubeOEmbed('https://youtu.be/dQw4w9WgXcQ');

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('url=https%3A%2F%2Fyoutu.be%2FdQw4w9WgXcQ');
  });
});

// ============================================================================
// Spotify oEmbed Tests
// ============================================================================

describe('fetchSpotifyOEmbed', () => {
  it('should fetch and return Spotify content metadata', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(SPOTIFY_OEMBED_RESPONSE),
    });

    const result = await fetchSpotifyOEmbed(
      'https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv'
    );

    expect(result).not.toBeNull();
    expect(result?.title).toBe('Bohemian Rhapsody - Remastered 2011');
    expect(result?.author_name).toBe('Queen'); // Extracted from HTML title
    expect(result?.thumbnail_url).toContain('i.scdn.co');
    expect(result?.provider_name).toBe('Spotify');
  });

  it('should call correct Spotify oEmbed URL', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(SPOTIFY_OEMBED_RESPONSE),
    });

    await fetchSpotifyOEmbed('https://open.spotify.com/episode/ABC123');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('https://open.spotify.com/oembed');
    expect(calledUrl).toContain('url=https%3A%2F%2Fopen.spotify.com%2Fepisode%2FABC123');
  });

  it('should extract author from HTML iframe title', async () => {
    const responseWithAuthor = {
      ...SPOTIFY_OEMBED_RESPONSE,
      html: '<iframe title="Spotify Embed: Song Name by Artist Name" src="..."></iframe>',
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(responseWithAuthor),
    });

    const result = await fetchSpotifyOEmbed('https://open.spotify.com/track/123');

    expect(result?.author_name).toBe('Artist Name');
  });

  it('should fallback to Spotify when author cannot be extracted', async () => {
    const responseWithoutAuthor = {
      ...SPOTIFY_OEMBED_RESPONSE,
      html: '<iframe title="Spotify Player" src="..."></iframe>',
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(responseWithoutAuthor),
    });

    const result = await fetchSpotifyOEmbed('https://open.spotify.com/track/123');

    expect(result?.author_name).toBe('Spotify');
  });

  it('should return null on HTTP error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
    });

    const result = await fetchSpotifyOEmbed('https://open.spotify.com/invalid');

    expect(result).toBeNull();
  });

  it('should return null on network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await fetchSpotifyOEmbed('https://open.spotify.com/track/123');

    expect(result).toBeNull();
  });

  it('should return null on timeout', async () => {
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    mockFetch.mockRejectedValue(abortError);

    const result = await fetchSpotifyOEmbed('https://open.spotify.com/track/123');

    expect(result).toBeNull();
  });

  it('should handle episode URLs', async () => {
    const episodeResponse = {
      ...SPOTIFY_OEMBED_RESPONSE,
      title: 'Episode Title - Podcast Name',
      html: '<iframe title="Spotify Embed: Episode Title by Podcast Host" src="..."></iframe>',
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(episodeResponse),
    });

    const result = await fetchSpotifyOEmbed('https://open.spotify.com/episode/5rgs');

    expect(result?.title).toBe('Episode Title - Podcast Name');
    expect(result?.author_name).toBe('Podcast Host');
  });
});

// ============================================================================
// Twitter oEmbed Tests
// ============================================================================

describe('fetchTwitterOEmbed', () => {
  it('should fetch and return Twitter tweet metadata', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(TWITTER_OEMBED_RESPONSE),
    });

    const result = await fetchTwitterOEmbed('https://twitter.com/jack/status/20');

    expect(result).not.toBeNull();
    expect(result?.title).toBe('just setting up my twttr');
    expect(result?.author_name).toBe('jack');
    expect(result?.author_url).toBe('https://twitter.com/jack');
    expect(result?.provider_name).toBe('Twitter');
    expect(result?.html).toContain('twitter-tweet');
  });

  it('should call correct Twitter oEmbed URL', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(TWITTER_OEMBED_RESPONSE),
    });

    await fetchTwitterOEmbed('https://twitter.com/jack/status/20');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('https://publish.twitter.com/oembed');
    expect(calledUrl).toContain('url=https%3A%2F%2Ftwitter.com%2Fjack%2Fstatus%2F20');
  });

  it('should extract tweet text from HTML', async () => {
    const tweetWithText = {
      ...TWITTER_OEMBED_RESPONSE,
      html: '<blockquote><p>Hello world! This is a test tweet.</p></blockquote>',
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(tweetWithText),
    });

    const result = await fetchTwitterOEmbed('https://twitter.com/user/status/123');

    expect(result?.title).toBe('Hello world! This is a test tweet.');
  });

  it('should truncate long tweets to 280 characters', async () => {
    const longTweetText = 'A'.repeat(300);
    const tweetWithLongText = {
      ...TWITTER_OEMBED_RESPONSE,
      html: `<blockquote><p>${longTweetText}</p></blockquote>`,
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(tweetWithLongText),
    });

    const result = await fetchTwitterOEmbed('https://twitter.com/user/status/123');

    expect(result?.title?.length).toBe(280);
    expect(result?.title?.endsWith('...')).toBe(true);
  });

  it('should handle tweets with HTML tags like br and a', async () => {
    const tweetWithHtml = {
      ...TWITTER_OEMBED_RESPONSE,
      html: '<blockquote><p lang="en">First line<br><br>Second line with <a href="https://example.com">@mention</a></p></blockquote>',
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(tweetWithHtml),
    });

    const result = await fetchTwitterOEmbed('https://twitter.com/user/status/123');

    expect(result?.title).toBe('First line Second line with @mention');
  });

  it('should decode HTML entities in tweet text', async () => {
    const tweetWithEntities = {
      ...TWITTER_OEMBED_RESPONSE,
      html: '<blockquote><p>Hello &amp; goodbye &lt;world&gt;</p></blockquote>',
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(tweetWithEntities),
    });

    const result = await fetchTwitterOEmbed('https://twitter.com/user/status/123');

    expect(result?.title).toBe('Hello & goodbye <world>');
  });

  it('should fallback to "Tweet" when text cannot be extracted', async () => {
    const tweetWithoutParagraph = {
      ...TWITTER_OEMBED_RESPONSE,
      html: '<blockquote><div>Some content</div></blockquote>',
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(tweetWithoutParagraph),
    });

    const result = await fetchTwitterOEmbed('https://twitter.com/user/status/123');

    expect(result?.title).toBe('Tweet');
  });

  it('should return null on HTTP error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
    });

    const result = await fetchTwitterOEmbed('https://twitter.com/user/status/deleted');

    expect(result).toBeNull();
  });

  it('should return null on network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await fetchTwitterOEmbed('https://twitter.com/user/status/123');

    expect(result).toBeNull();
  });

  it('should return null on timeout', async () => {
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    mockFetch.mockRejectedValue(abortError);

    const result = await fetchTwitterOEmbed('https://twitter.com/user/status/123');

    expect(result).toBeNull();
  });

  it('should handle x.com URLs', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(TWITTER_OEMBED_RESPONSE),
    });

    await fetchTwitterOEmbed('https://x.com/jack/status/20');

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('url=https%3A%2F%2Fx.com%2Fjack%2Fstatus%2F20');
  });

  it('should not include thumbnail fields (Twitter does not provide them)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(TWITTER_OEMBED_RESPONSE),
    });

    const result = await fetchTwitterOEmbed('https://twitter.com/jack/status/20');

    expect(result?.thumbnail_url).toBeUndefined();
    expect(result?.thumbnail_width).toBeUndefined();
    expect(result?.thumbnail_height).toBeUndefined();
  });
});

// ============================================================================
// Common Behavior Tests
// ============================================================================

describe('common oEmbed behavior', () => {
  it('should use AbortController for timeout', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(YOUTUBE_OEMBED_RESPONSE),
    });

    await fetchYouTubeOEmbed('https://www.youtube.com/watch?v=test');

    const fetchOptions = mockFetch.mock.calls[0][1];
    expect(fetchOptions.signal).toBeDefined();
    expect(fetchOptions.signal).toBeInstanceOf(AbortSignal);
  });

  it('should set Accept header to application/json', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(YOUTUBE_OEMBED_RESPONSE),
    });

    await fetchYouTubeOEmbed('https://www.youtube.com/watch?v=test');

    const fetchOptions = mockFetch.mock.calls[0][1];
    expect(fetchOptions.headers.Accept).toBe('application/json');
  });

  it('should properly URL-encode special characters in URLs', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(YOUTUBE_OEMBED_RESPONSE),
    });

    await fetchYouTubeOEmbed('https://www.youtube.com/watch?v=test&feature=share');

    const calledUrl = mockFetch.mock.calls[0][0];
    // The & should be encoded as %26
    expect(calledUrl).toContain('v%3Dtest%26feature%3Dshare');
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('edge cases', () => {
  it('should handle empty response gracefully', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({}),
    });

    const result = await fetchYouTubeOEmbed('https://www.youtube.com/watch?v=test');

    // Should still return a result with undefined fields
    expect(result).not.toBeNull();
    expect(result?.title).toBeUndefined();
  });

  it('should handle malformed JSON gracefully', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token')),
    });

    const result = await fetchYouTubeOEmbed('https://www.youtube.com/watch?v=test');

    expect(result).toBeNull();
  });

  it('should handle 500 server errors', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    const youtubeResult = await fetchYouTubeOEmbed('https://www.youtube.com/watch?v=test');
    const spotifyResult = await fetchSpotifyOEmbed('https://open.spotify.com/track/test');
    const twitterResult = await fetchTwitterOEmbed('https://twitter.com/user/status/test');

    expect(youtubeResult).toBeNull();
    expect(spotifyResult).toBeNull();
    expect(twitterResult).toBeNull();
  });

  it('should handle rate limiting (429) gracefully', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
    });

    const result = await fetchYouTubeOEmbed('https://www.youtube.com/watch?v=test');

    expect(result).toBeNull();
  });
});
