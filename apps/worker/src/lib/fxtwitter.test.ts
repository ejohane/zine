import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchFxTwitter,
  fetchFxTwitterByUrl,
  parseTwitterUrl,
  FXTWITTER_API_BASE,
} from './fxtwitter';
import type { FxTwitterResponse } from './fxtwitter';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock logger to prevent console output during tests
vi.mock('./logger', () => ({
  logger: {
    child: () => ({
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

describe('fxtwitter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // parseTwitterUrl
  // ==========================================================================
  describe('parseTwitterUrl', () => {
    it('parses valid x.com URL', () => {
      const result = parseTwitterUrl('https://x.com/user/status/12345');
      expect(result).toEqual({ username: 'user', tweetId: '12345' });
    });

    it('parses valid twitter.com URL', () => {
      const result = parseTwitterUrl('https://twitter.com/user/status/12345');
      expect(result).toEqual({ username: 'user', tweetId: '12345' });
    });

    it('parses URL with www prefix', () => {
      const result = parseTwitterUrl('https://www.x.com/user/status/12345');
      expect(result).toEqual({ username: 'user', tweetId: '12345' });
    });

    it('parses URL with query params', () => {
      const result = parseTwitterUrl('https://x.com/user/status/12345?s=20');
      expect(result).toEqual({ username: 'user', tweetId: '12345' });
    });

    it('returns null for invalid domain', () => {
      const result = parseTwitterUrl('https://google.com');
      expect(result).toBeNull();
    });

    it('returns null for missing status path', () => {
      const result = parseTwitterUrl('https://x.com/user/likes');
      expect(result).toBeNull();
    });

    it('returns null for non-numeric tweet ID', () => {
      const result = parseTwitterUrl('https://x.com/user/status/abc');
      expect(result).toBeNull();
    });

    it('parses URL with http protocol', () => {
      const result = parseTwitterUrl('http://x.com/user/status/12345');
      expect(result).toEqual({ username: 'user', tweetId: '12345' });
    });

    it('parses URL with www prefix on twitter.com', () => {
      const result = parseTwitterUrl('https://www.twitter.com/user/status/12345');
      expect(result).toEqual({ username: 'user', tweetId: '12345' });
    });

    it('handles complex usernames', () => {
      const result = parseTwitterUrl('https://x.com/user_name123/status/12345');
      expect(result).toEqual({ username: 'user_name123', tweetId: '12345' });
    });

    it('handles long tweet IDs', () => {
      const result = parseTwitterUrl('https://x.com/user/status/1234567890123456789');
      expect(result).toEqual({ username: 'user', tweetId: '1234567890123456789' });
    });
  });

  // ==========================================================================
  // fetchFxTwitter
  // ==========================================================================
  describe('fetchFxTwitter', () => {
    const mockTweetResponse: FxTwitterResponse = {
      code: 200,
      message: 'OK',
      tweet: {
        id: '12345',
        url: 'https://twitter.com/user/status/12345',
        text: 'Hello world!',
        created_at: '2024-01-01T00:00:00.000Z',
        created_timestamp: 1704067200,
        author: {
          name: 'Test User',
          screen_name: 'user',
          avatar_url: 'https://pbs.twimg.com/profile_images/123/avatar.jpg',
        },
        likes: 100,
        retweets: 50,
        replies: 25,
        views: 1000,
        lang: 'en',
        source: 'Twitter Web App',
      },
    };

    it('returns tweet data on successful response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTweetResponse),
      });

      const result = await fetchFxTwitter('user', '12345');

      expect(result).toEqual(mockTweetResponse);
      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch).toHaveBeenCalledWith(
        `${FXTWITTER_API_BASE}/user/status/12345`,
        expect.objectContaining({
          headers: { Accept: 'application/json' },
        })
      );
    });

    it('returns null on HTTP error (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await fetchFxTwitter('user', '12345');

      expect(result).toBeNull();
    });

    it('returns null on API error response', async () => {
      const errorResponse: FxTwitterResponse = {
        code: 404,
        message: 'Tweet not found',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(errorResponse),
      });

      const result = await fetchFxTwitter('user', '12345');

      expect(result).toBeNull();
    });

    it('returns null on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchFxTwitter('user', '12345');

      expect(result).toBeNull();
    });

    it('returns null on timeout (AbortError)', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      const result = await fetchFxTwitter('user', '12345');

      expect(result).toBeNull();
    });

    it('encodes username and tweetId in URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTweetResponse),
      });

      await fetchFxTwitter('user@name', '12345');

      expect(mockFetch).toHaveBeenCalledWith(
        `${FXTWITTER_API_BASE}/user%40name/status/12345`,
        expect.any(Object)
      );
    });

    it('passes AbortSignal to fetch', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTweetResponse),
      });

      await fetchFxTwitter('user', '12345');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });
  });

  // ==========================================================================
  // fetchFxTwitterByUrl
  // ==========================================================================
  describe('fetchFxTwitterByUrl', () => {
    const mockTweetResponse: FxTwitterResponse = {
      code: 200,
      message: 'OK',
      tweet: {
        id: '12345',
        url: 'https://twitter.com/user/status/12345',
        text: 'Hello world!',
        created_at: '2024-01-01T00:00:00.000Z',
        created_timestamp: 1704067200,
        author: {
          name: 'Test User',
          screen_name: 'user',
          avatar_url: 'https://pbs.twimg.com/profile_images/123/avatar.jpg',
        },
        likes: 100,
        retweets: 50,
        replies: 25,
        views: 1000,
        lang: 'en',
        source: 'Twitter Web App',
      },
    };

    it('calls fetch with correct endpoint for valid URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTweetResponse),
      });

      const result = await fetchFxTwitterByUrl('https://x.com/user/status/12345');

      expect(result).toEqual(mockTweetResponse);
      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch).toHaveBeenCalledWith(
        `${FXTWITTER_API_BASE}/user/status/12345`,
        expect.any(Object)
      );
    });

    it('returns null for invalid URL without calling fetch', async () => {
      const result = await fetchFxTwitterByUrl('https://google.com');

      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns null for malformed Twitter URL without calling fetch', async () => {
      const result = await fetchFxTwitterByUrl('https://x.com/user/likes');

      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('handles twitter.com URLs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTweetResponse),
      });

      await fetchFxTwitterByUrl('https://twitter.com/testuser/status/67890');

      expect(mockFetch).toHaveBeenCalledWith(
        `${FXTWITTER_API_BASE}/testuser/status/67890`,
        expect.any(Object)
      );
    });

    it('strips query params from URL when parsing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTweetResponse),
      });

      await fetchFxTwitterByUrl('https://x.com/user/status/12345?s=20&t=abc');

      expect(mockFetch).toHaveBeenCalledWith(
        `${FXTWITTER_API_BASE}/user/status/12345`,
        expect.any(Object)
      );
    });
  });
});
