/**
 * Tests for content transformers
 *
 * Tests transformYouTubeVideo and transformSpotifyEpisode functions including:
 * - Valid data transformation
 * - Missing fields handling
 * - Edge cases (empty strings, null values, etc.)
 * - Date format handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ContentType, Provider } from '@zine/shared';
import {
  transformYouTubeVideo,
  transformSpotifyEpisode,
  transformRssEntry,
  TransformError,
} from './transformers';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Creates a valid YouTube playlist item for testing
 */
function createYouTubePlaylistItem(overrides: Record<string, unknown> = {}) {
  return {
    contentDetails: {
      videoId: 'dQw4w9WgXcQ',
      ...(overrides.contentDetails as Record<string, unknown>),
    },
    snippet: {
      title: 'Test Video Title',
      description: 'Test video description',
      channelTitle: 'Test Channel',
      channelId: 'UC1234567890abcdefg',
      publishedAt: '2024-01-15T10:00:00Z',
      thumbnails: {
        high: { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg' },
        default: { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg' },
      },
      ...(overrides.snippet as Record<string, unknown>),
    },
    ...overrides,
  };
}

/**
 * Creates a valid Spotify episode for testing
 */
function createSpotifyEpisode(overrides: Record<string, unknown> = {}) {
  return {
    id: 'episode123abc',
    name: 'Test Episode',
    description: 'Test episode description',
    release_date: '2024-01-15',
    duration_ms: 3600000, // 1 hour
    external_urls: {
      spotify: 'https://open.spotify.com/episode/episode123abc',
      ...(overrides.external_urls as Record<string, unknown>),
    },
    images: [{ url: 'https://i.scdn.co/image/abc123' }],
    ...overrides,
  };
}

// ============================================================================
// Mock Date.now for consistent testing
// ============================================================================

const MOCK_NOW = 1705320000000; // 2024-01-15T12:00:00.000Z

// Store original Date.now for restoration
const originalDateNow = Date.now;

beforeEach(() => {
  // Mock Date.now directly (vi.setSystemTime not available in Workers pool)
  Date.now = vi.fn(() => MOCK_NOW);
});

// ============================================================================
// transformRssEntry Tests
// ============================================================================

describe('transformRssEntry', () => {
  it('strips HTML and decodes entities in RSS summaries', () => {
    const result = transformRssEntry({
      providerId: 'https://example.com/posts/final-bottleneck',
      canonicalUrl: 'https://example.com/posts/final-bottleneck',
      title: 'The Final Bottleneck',
      summary:
        '<p>AI speeds up writing code, but accountability &amp; review capacity still impose hard limits.</p>',
      creator: 'Armin Ronacher',
      creatorImageUrl: 'https://example.com/avatar.jpg',
      imageUrl: 'https://example.com/cover.jpg',
      publishedAt: 1705320000000,
    });

    expect(result.provider).toBe(Provider.RSS);
    expect(result.contentType).toBe(ContentType.ARTICLE);
    expect(result.description).toBe(
      'AI speeds up writing code, but accountability & review capacity still impose hard limits.'
    );
    expect(result.creatorImageUrl).toBe('https://example.com/avatar.jpg');
    expect(result.imageUrl).toBe('https://example.com/cover.jpg');
  });

  it('handles plain-text summaries without modification', () => {
    const result = transformRssEntry({
      providerId: 'https://example.com/posts/plain',
      canonicalUrl: 'https://example.com/posts/plain',
      title: 'Plain',
      summary: 'Plain summary',
      creator: 'Author',
    });

    expect(result.description).toBe('Plain summary');
  });
});

afterEach(() => {
  Date.now = originalDateNow;
});

// ============================================================================
// transformYouTubeVideo Tests
// ============================================================================

describe('transformYouTubeVideo', () => {
  describe('with valid data', () => {
    it('should transform a complete YouTube video', () => {
      const input = createYouTubePlaylistItem();
      const result = transformYouTubeVideo(input);

      expect(result.contentType).toBe(ContentType.VIDEO);
      expect(result.provider).toBe(Provider.YOUTUBE);
      expect(result.providerId).toBe('dQw4w9WgXcQ');
      expect(result.canonicalUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(result.title).toBe('Test Video Title');
      expect(result.description).toBe('Test video description');
      expect(result.creator).toBe('Test Channel');
      expect(result.creatorId).toBe('UC1234567890abcdefg');
      expect(result.imageUrl).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
      expect(result.publishedAt).toBe(new Date('2024-01-15T10:00:00Z').getTime());
      expect(result.createdAt).toBe(MOCK_NOW);
    });

    it('should generate unique IDs (ULID)', () => {
      const input = createYouTubePlaylistItem();
      const result1 = transformYouTubeVideo(input);
      const result2 = transformYouTubeVideo(input);

      expect(result1.id).toHaveLength(26); // ULID length
      expect(result2.id).toHaveLength(26);
      expect(result1.id).not.toBe(result2.id);
    });
  });

  describe('with missing fields', () => {
    it('should throw TransformError when videoId is missing', () => {
      const input = createYouTubePlaylistItem({
        contentDetails: { videoId: undefined },
      });

      expect(() => transformYouTubeVideo(input)).toThrow(TransformError);
      expect(() => transformYouTubeVideo(input)).toThrow('YouTube video missing videoId');
    });

    it('should throw TransformError when contentDetails is missing', () => {
      const input = createYouTubePlaylistItem({ contentDetails: undefined });

      expect(() => transformYouTubeVideo(input)).toThrow(TransformError);
      expect(() => transformYouTubeVideo(input)).toThrow('YouTube video missing videoId');
    });

    it('should use "Untitled" when title is missing', () => {
      const input = createYouTubePlaylistItem({
        snippet: { title: undefined },
      });

      const result = transformYouTubeVideo(input);
      expect(result.title).toBe('Untitled');
    });

    it('should use "Unknown" when channelTitle is missing', () => {
      const input = createYouTubePlaylistItem({
        snippet: { channelTitle: undefined },
      });

      const result = transformYouTubeVideo(input);
      expect(result.creator).toBe('Unknown');
    });

    it('should handle missing snippet gracefully', () => {
      const input = {
        contentDetails: { videoId: 'abc123' },
        snippet: undefined,
      };

      const result = transformYouTubeVideo(input);
      expect(result.providerId).toBe('abc123');
      expect(result.title).toBe('Untitled');
      expect(result.creator).toBe('Unknown');
      expect(result.publishedAt).toBe(MOCK_NOW);
    });

    it('should handle missing thumbnails', () => {
      const input = createYouTubePlaylistItem({
        snippet: { thumbnails: undefined },
      });

      const result = transformYouTubeVideo(input);
      expect(result.imageUrl).toBeUndefined();
    });

    it('should fallback to default thumbnail when high is missing', () => {
      const input = createYouTubePlaylistItem({
        snippet: {
          thumbnails: {
            default: { url: 'https://default.jpg' },
          },
        },
      });

      const result = transformYouTubeVideo(input);
      expect(result.imageUrl).toBe('https://default.jpg');
    });

    it('should handle missing description', () => {
      const input = createYouTubePlaylistItem({
        snippet: { description: undefined },
      });

      const result = transformYouTubeVideo(input);
      expect(result.description).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should handle empty string title', () => {
      const input = createYouTubePlaylistItem({
        snippet: { title: '' },
      });

      const result = transformYouTubeVideo(input);
      // Empty string is falsy, so should use 'Untitled'
      expect(result.title).toBe('Untitled');
    });

    it('should handle empty string channelTitle', () => {
      const input = createYouTubePlaylistItem({
        snippet: { channelTitle: '' },
      });

      const result = transformYouTubeVideo(input);
      // Empty string is falsy, so should use 'Unknown'
      expect(result.creator).toBe('Unknown');
    });

    it('should use current time when publishedAt is missing', () => {
      const input = createYouTubePlaylistItem({
        snippet: { publishedAt: undefined },
      });

      const result = transformYouTubeVideo(input);
      expect(result.publishedAt).toBe(MOCK_NOW);
    });

    it('should handle invalid date string', () => {
      const input = createYouTubePlaylistItem({
        snippet: { publishedAt: 'not-a-date' },
      });

      const result = transformYouTubeVideo(input);
      // Invalid date should result in NaN, then fallback or handle gracefully
      expect(Number.isNaN(result.publishedAt)).toBe(true);
    });

    it('should not include durationSeconds (YouTube API does not provide it here)', () => {
      const input = createYouTubePlaylistItem();
      const result = transformYouTubeVideo(input);
      expect(result.durationSeconds).toBeUndefined();
    });
  });
});

// ============================================================================
// transformSpotifyEpisode Tests
// ============================================================================

describe('transformSpotifyEpisode', () => {
  const DEFAULT_SHOW_NAME = 'Test Podcast Show';

  describe('with valid data', () => {
    it('should transform a complete Spotify episode', () => {
      const input = createSpotifyEpisode();
      const result = transformSpotifyEpisode(input, DEFAULT_SHOW_NAME);

      expect(result.contentType).toBe(ContentType.PODCAST);
      expect(result.provider).toBe(Provider.SPOTIFY);
      expect(result.providerId).toBe('episode123abc');
      expect(result.canonicalUrl).toBe('https://open.spotify.com/episode/episode123abc');
      expect(result.title).toBe('Test Episode');
      expect(result.description).toBe('Test episode description');
      expect(result.creator).toBe(DEFAULT_SHOW_NAME);
      expect(result.imageUrl).toBe('https://i.scdn.co/image/abc123');
      expect(result.durationSeconds).toBe(3600); // 3600000ms = 3600s
      expect(result.createdAt).toBe(MOCK_NOW);
    });

    it('should generate unique IDs (ULID)', () => {
      const input = createSpotifyEpisode();
      const result1 = transformSpotifyEpisode(input, DEFAULT_SHOW_NAME);
      const result2 = transformSpotifyEpisode(input, DEFAULT_SHOW_NAME);

      expect(result1.id).toHaveLength(26);
      expect(result2.id).toHaveLength(26);
      expect(result1.id).not.toBe(result2.id);
    });

    it('should use provided show name as creator', () => {
      const input = createSpotifyEpisode();
      const result = transformSpotifyEpisode(input, 'My Custom Show');

      expect(result.creator).toBe('My Custom Show');
    });
  });

  describe('with missing fields', () => {
    it('should throw TransformError when id is missing', () => {
      const input = createSpotifyEpisode({ id: undefined });

      expect(() => transformSpotifyEpisode(input, DEFAULT_SHOW_NAME)).toThrow(TransformError);
      expect(() => transformSpotifyEpisode(input, DEFAULT_SHOW_NAME)).toThrow(
        'Spotify episode missing id'
      );
    });

    it('should throw TransformError when id is empty string', () => {
      const input = createSpotifyEpisode({ id: '' });

      expect(() => transformSpotifyEpisode(input, DEFAULT_SHOW_NAME)).toThrow(TransformError);
    });

    it('should handle missing description', () => {
      const input = createSpotifyEpisode({ description: undefined });

      const result = transformSpotifyEpisode(input, DEFAULT_SHOW_NAME);
      expect(result.description).toBeUndefined();
    });

    it('should handle missing images', () => {
      const input = createSpotifyEpisode({ images: undefined });

      const result = transformSpotifyEpisode(input, DEFAULT_SHOW_NAME);
      expect(result.imageUrl).toBeUndefined();
    });

    it('should handle empty images array', () => {
      const input = createSpotifyEpisode({ images: [] });

      const result = transformSpotifyEpisode(input, DEFAULT_SHOW_NAME);
      expect(result.imageUrl).toBeUndefined();
    });
  });

  describe('date format handling', () => {
    it('should parse YYYY-MM-DD format correctly', () => {
      const input = createSpotifyEpisode({ release_date: '2024-01-15' });

      const result = transformSpotifyEpisode(input, DEFAULT_SHOW_NAME);
      expect(result.publishedAt).toBe(new Date('2024-01-15T00:00:00Z').getTime());
    });

    it('should parse YYYY-MM format correctly (normalize to first day)', () => {
      const input = createSpotifyEpisode({ release_date: '2024-01' });

      const result = transformSpotifyEpisode(input, DEFAULT_SHOW_NAME);
      expect(result.publishedAt).toBe(new Date('2024-01-01T00:00:00Z').getTime());
    });

    it('should parse YYYY format correctly (normalize to Jan 1)', () => {
      const input = createSpotifyEpisode({ release_date: '2024' });

      const result = transformSpotifyEpisode(input, DEFAULT_SHOW_NAME);
      expect(result.publishedAt).toBe(new Date('2024-01-01T00:00:00Z').getTime());
    });

    it('should handle leap year dates', () => {
      const input = createSpotifyEpisode({ release_date: '2024-02-29' });

      const result = transformSpotifyEpisode(input, DEFAULT_SHOW_NAME);
      expect(result.publishedAt).toBe(new Date('2024-02-29T00:00:00Z').getTime());
    });

    it('should handle end of year dates', () => {
      const input = createSpotifyEpisode({ release_date: '2024-12-31' });

      const result = transformSpotifyEpisode(input, DEFAULT_SHOW_NAME);
      expect(result.publishedAt).toBe(new Date('2024-12-31T00:00:00Z').getTime());
    });
  });

  describe('duration conversion', () => {
    it('should convert milliseconds to seconds', () => {
      const input = createSpotifyEpisode({ duration_ms: 60000 }); // 1 minute

      const result = transformSpotifyEpisode(input, DEFAULT_SHOW_NAME);
      expect(result.durationSeconds).toBe(60);
    });

    it('should floor partial seconds', () => {
      const input = createSpotifyEpisode({ duration_ms: 61999 }); // 61.999 seconds

      const result = transformSpotifyEpisode(input, DEFAULT_SHOW_NAME);
      expect(result.durationSeconds).toBe(61);
    });

    it('should handle zero duration', () => {
      const input = createSpotifyEpisode({ duration_ms: 0 });

      const result = transformSpotifyEpisode(input, DEFAULT_SHOW_NAME);
      expect(result.durationSeconds).toBe(0);
    });

    it('should handle very long episodes', () => {
      // 10 hours in ms
      const input = createSpotifyEpisode({ duration_ms: 36000000 });

      const result = transformSpotifyEpisode(input, DEFAULT_SHOW_NAME);
      expect(result.durationSeconds).toBe(36000);
    });
  });

  describe('edge cases', () => {
    it('should handle empty show name', () => {
      const input = createSpotifyEpisode();

      const result = transformSpotifyEpisode(input, '');
      expect(result.creator).toBe('');
    });

    it('should preserve unicode in names and descriptions', () => {
      const input = createSpotifyEpisode({
        name: 'Episode: 日本語タイトル 🎙️',
        description: 'Description with émojis 🎉 and ñ',
      });

      const result = transformSpotifyEpisode(input, '播客 Podcast');
      expect(result.title).toBe('Episode: 日本語タイトル 🎙️');
      expect(result.description).toBe('Description with émojis 🎉 and ñ');
      expect(result.creator).toBe('播客 Podcast');
    });
  });
});

// ============================================================================
// TransformError Tests
// ============================================================================

describe('TransformError', () => {
  it('should have correct name', () => {
    const error = new TransformError('Test message');
    expect(error.name).toBe('TransformError');
    expect(error.message).toBe('Test message');
  });

  it('should be catchable as Error', () => {
    const error = new TransformError('Test');
    expect(error instanceof Error).toBe(true);
  });
});
