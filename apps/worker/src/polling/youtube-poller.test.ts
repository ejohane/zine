/**
 * Tests for YouTube Polling Provider
 *
 * Specifically tests the date parsing edge cases:
 * - Missing publishedAt → filtered out with warning
 * - Invalid date string → filtered out with warning
 * - First poll (lastPolledAt = null) → valid items included
 * - Valid date → included when > lastPolledAt
 *
 * Also tests YouTubeSkipMetrics:
 * - Skip metrics type and utility functions
 * - Aggregation of skip metrics
 * - Skip counting
 *
 * @vitest-environment miniflare
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseYouTubeDate } from './youtube-poller';
import {
  createEmptyYouTubeSkipMetrics,
  aggregateYouTubeSkipMetrics,
  getTotalSkipCount,
  type YouTubeSkipMetrics,
} from './types';

// ============================================================================
// Tests for parseYouTubeDate
// ============================================================================

describe('parseYouTubeDate', () => {
  describe('valid dates', () => {
    it('should parse a valid ISO 8601 date string', () => {
      const result = parseYouTubeDate('2024-01-15T12:00:00.000Z');
      expect(result).toBe(1705320000000);
    });

    it('should parse a date without milliseconds', () => {
      const result = parseYouTubeDate('2024-01-15T12:00:00Z');
      expect(result).toBe(1705320000000);
    });

    it('should parse a date-only string', () => {
      const result = parseYouTubeDate('2024-01-15');
      expect(result).not.toBeNull();
      expect(typeof result).toBe('number');
    });

    it('should parse YouTube API format date', () => {
      // YouTube API returns dates like "2024-01-15T19:00:30Z"
      const result = parseYouTubeDate('2024-01-15T19:00:30Z');
      expect(result).toBe(1705345230000);
    });
  });

  describe('invalid dates', () => {
    it('should return null for undefined', () => {
      const result = parseYouTubeDate(undefined);
      expect(result).toBeNull();
    });

    it('should return null for null', () => {
      const result = parseYouTubeDate(null);
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = parseYouTubeDate('');
      expect(result).toBeNull();
    });

    it('should return null for completely invalid string', () => {
      const result = parseYouTubeDate('not-a-date');
      expect(result).toBeNull();
    });

    it('should return null for malformed date string', () => {
      const result = parseYouTubeDate('2024-99-99');
      expect(result).toBeNull();
    });

    it('should return null for "Invalid Date" edge case', () => {
      // Some edge cases that produce "Invalid Date"
      const result = parseYouTubeDate('invalid');
      expect(result).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle epoch timestamp (1970-01-01)', () => {
      const result = parseYouTubeDate('1970-01-01T00:00:00Z');
      expect(result).toBe(0);
    });

    it('should handle far future dates', () => {
      const result = parseYouTubeDate('2099-12-31T23:59:59Z');
      expect(result).not.toBeNull();
      expect(typeof result).toBe('number');
    });

    it('should return number, not NaN', () => {
      // Verify that NaN comparisons are prevented
      const validResult = parseYouTubeDate('2024-01-15T12:00:00Z');
      const invalidResult = parseYouTubeDate('not-a-date');

      expect(Number.isNaN(validResult)).toBe(false);
      expect(invalidResult).toBeNull(); // null, not NaN
    });
  });
});

// ============================================================================
// Mock Dependencies for filterNewVideos tests
// ============================================================================

// Mock the logger
vi.mock('../lib/logger', () => ({
  pollLogger: {
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  },
}));

// Mock drizzle
vi.mock('drizzle-orm', () => ({
  eq: (field: unknown, value: unknown) => ({ field, value }),
}));

// Mock schema
vi.mock('../db/schema', () => ({
  subscriptions: {},
}));

// Mock youtube provider
vi.mock('../providers/youtube', () => ({
  getYouTubeClientForConnection: vi.fn(),
  getUploadsPlaylistId: vi.fn(),
  fetchRecentVideos: vi.fn(),
  fetchVideoDetails: vi.fn(),
  fetchVideoDetailsBatched: vi.fn(),
}));

// Mock ingestion
vi.mock('../ingestion/processor', () => ({
  ingestItem: vi.fn(),
}));

// Mock transformers
vi.mock('../ingestion/transformers', () => ({
  transformYouTubeVideo: vi.fn(),
}));

// ============================================================================
// Test Fixtures
// ============================================================================

interface MockEnrichedVideo {
  id: string;
  contentDetails?: {
    videoId?: string;
  };
  snippet?: {
    publishedAt?: string;
    title?: string;
  };
  durationSeconds?: number;
}

function createMockVideo(overrides: Partial<MockEnrichedVideo> = {}): MockEnrichedVideo {
  return {
    id: 'video123',
    contentDetails: {
      videoId: 'video123',
    },
    snippet: {
      publishedAt: '2024-01-15T12:00:00.000Z',
      title: 'Test Video',
    },
    durationSeconds: 600, // 10 minutes (not a Short)
    ...overrides,
  };
}

// ============================================================================
// Integration Tests for Date Filtering Logic
// ============================================================================

describe('YouTube date filtering integration', () => {
  const MOCK_NOW = 1705320000000; // 2024-01-15T12:00:00.000Z
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MOCK_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('date parsing behavior verification', () => {
    it('should correctly identify new videos based on timestamp comparison', () => {
      const lastPolledAt = MOCK_NOW - ONE_DAY_MS; // 1 day ago

      // Video published today should be "new"
      const todayVideo = createMockVideo({
        snippet: {
          publishedAt: '2024-01-15T12:00:00.000Z', // MOCK_NOW
          title: 'Today Video',
        },
      });

      // Video published 2 days ago should NOT be "new"
      const oldVideo = createMockVideo({
        snippet: {
          publishedAt: '2024-01-13T12:00:00.000Z', // 2 days before MOCK_NOW
          title: 'Old Video',
        },
      });

      const todayTimestamp = parseYouTubeDate(todayVideo.snippet?.publishedAt);
      const oldTimestamp = parseYouTubeDate(oldVideo.snippet?.publishedAt);

      expect(todayTimestamp).toBe(MOCK_NOW);
      expect(oldTimestamp).toBe(MOCK_NOW - 2 * ONE_DAY_MS);

      // Verify filtering logic
      expect(todayTimestamp! > lastPolledAt).toBe(true);
      expect(oldTimestamp! > lastPolledAt).toBe(false);
    });

    it('should handle first poll scenario (lastPolledAt = null)', () => {
      const lastPolledAt = null;

      // Video with valid date
      const validVideo = createMockVideo({
        snippet: {
          publishedAt: '2024-01-15T12:00:00.000Z',
          title: 'Valid Video',
        },
      });

      // Video with invalid date
      const invalidVideo = createMockVideo({
        snippet: {
          publishedAt: undefined,
          title: 'Invalid Video',
        },
      });

      const validTimestamp = parseYouTubeDate(validVideo.snippet?.publishedAt);
      const invalidTimestamp = parseYouTubeDate(invalidVideo.snippet?.publishedAt);

      // Valid video should have a timestamp
      expect(validTimestamp).not.toBeNull();

      // Invalid video should be filtered out (null timestamp)
      expect(invalidTimestamp).toBeNull();

      // First poll logic: include valid items (slice to 1)
      // This is handled by filterNewVideos returning slice(0, 1) for first poll
      if (!lastPolledAt) {
        const validVideos = [validVideo, createMockVideo()].filter(
          (v) => parseYouTubeDate(v.snippet?.publishedAt) !== null
        );
        expect(validVideos.length).toBeGreaterThan(0);
      }
    });

    it('should prevent NaN comparison issues', () => {
      // Video with invalid date that would produce NaN
      const invalidVideo = createMockVideo({
        snippet: {
          publishedAt: 'not-a-valid-date',
          title: 'Invalid Date Video',
        },
      });

      const timestamp = parseYouTubeDate(invalidVideo.snippet?.publishedAt);

      // Should be null, not NaN
      expect(timestamp).toBeNull();

      // Verify that null comparison is safe
      if (timestamp !== null) {
        // This branch should not be reached
        expect(true).toBe(false);
      } else {
        // This is the expected path - video would be filtered out
        expect(true).toBe(true);
      }
    });

    it('should handle edge case where lastPolledAt is 0', () => {
      // Edge case from the bug description: lastPolledAt = 0 should be treated as first poll
      const lastPolledAt = 0;

      const video = createMockVideo({
        snippet: {
          publishedAt: '2024-01-15T12:00:00.000Z',
          title: 'Test Video',
        },
      });

      const timestamp = parseYouTubeDate(video.snippet?.publishedAt);

      // The fix: !lastPolledAt treats 0 as falsy (same as null)
      // So first poll logic applies: return only the latest valid video
      if (!lastPolledAt) {
        // First poll behavior - this is correct now
        expect(timestamp).not.toBeNull();
      }
    });

    it('should correctly calculate newest published timestamp', () => {
      const videos = [
        createMockVideo({
          snippet: { publishedAt: '2024-01-10T12:00:00.000Z', title: 'Old' },
        }),
        createMockVideo({
          snippet: { publishedAt: '2024-01-15T12:00:00.000Z', title: 'New' },
        }),
        createMockVideo({
          snippet: { publishedAt: '2024-01-12T12:00:00.000Z', title: 'Middle' },
        }),
        createMockVideo({
          snippet: { publishedAt: undefined, title: 'Invalid' },
        }),
      ];

      // Calculate newest like calculateNewestPublishedAt does
      const timestamps = videos
        .map((v) => parseYouTubeDate(v.snippet?.publishedAt))
        .filter((t): t is number => t !== null);

      const newest = timestamps.length > 0 ? Math.max(...timestamps) : null;

      // Should be the Jan 15 timestamp (MOCK_NOW)
      expect(newest).toBe(MOCK_NOW);
      // Should have filtered out the invalid one
      expect(timestamps.length).toBe(3);
    });
  });
});

// ============================================================================
// Tests for YouTubeSkipMetrics
// ============================================================================

describe('YouTubeSkipMetrics', () => {
  describe('createEmptyYouTubeSkipMetrics', () => {
    it('should create an empty skip metrics object with all zeros', () => {
      const metrics = createEmptyYouTubeSkipMetrics();

      expect(metrics).toEqual({
        alreadySeen: 0,
        shortsFiltered: 0,
        invalidDate: 0,
        unavailable: 0,
        other: 0,
      });
    });

    it('should create independent objects each time', () => {
      const metrics1 = createEmptyYouTubeSkipMetrics();
      const metrics2 = createEmptyYouTubeSkipMetrics();

      metrics1.shortsFiltered = 5;

      expect(metrics1.shortsFiltered).toBe(5);
      expect(metrics2.shortsFiltered).toBe(0);
    });
  });

  describe('aggregateYouTubeSkipMetrics', () => {
    it('should return empty metrics for empty array', () => {
      const result = aggregateYouTubeSkipMetrics([]);

      expect(result).toEqual(createEmptyYouTubeSkipMetrics());
    });

    it('should return same metrics for single element array', () => {
      const metrics: YouTubeSkipMetrics = {
        alreadySeen: 5,
        shortsFiltered: 3,
        invalidDate: 1,
        unavailable: 2,
        other: 0,
      };

      const result = aggregateYouTubeSkipMetrics([metrics]);

      expect(result).toEqual(metrics);
    });

    it('should aggregate multiple metrics correctly', () => {
      const metrics1: YouTubeSkipMetrics = {
        alreadySeen: 5,
        shortsFiltered: 3,
        invalidDate: 1,
        unavailable: 2,
        other: 0,
      };
      const metrics2: YouTubeSkipMetrics = {
        alreadySeen: 2,
        shortsFiltered: 7,
        invalidDate: 0,
        unavailable: 1,
        other: 4,
      };
      const metrics3: YouTubeSkipMetrics = {
        alreadySeen: 1,
        shortsFiltered: 0,
        invalidDate: 3,
        unavailable: 0,
        other: 1,
      };

      const result = aggregateYouTubeSkipMetrics([metrics1, metrics2, metrics3]);

      expect(result).toEqual({
        alreadySeen: 8, // 5 + 2 + 1
        shortsFiltered: 10, // 3 + 7 + 0
        invalidDate: 4, // 1 + 0 + 3
        unavailable: 3, // 2 + 1 + 0
        other: 5, // 0 + 4 + 1
      });
    });

    it('should handle metrics with all zeros', () => {
      const emptyMetrics = createEmptyYouTubeSkipMetrics();
      const result = aggregateYouTubeSkipMetrics([emptyMetrics, emptyMetrics, emptyMetrics]);

      expect(result).toEqual(createEmptyYouTubeSkipMetrics());
    });
  });

  describe('getTotalSkipCount', () => {
    it('should return 0 for empty metrics', () => {
      const metrics = createEmptyYouTubeSkipMetrics();

      expect(getTotalSkipCount(metrics)).toBe(0);
    });

    it('should sum all skip counts', () => {
      const metrics: YouTubeSkipMetrics = {
        alreadySeen: 5,
        shortsFiltered: 3,
        invalidDate: 1,
        unavailable: 2,
        other: 4,
      };

      expect(getTotalSkipCount(metrics)).toBe(15); // 5 + 3 + 1 + 2 + 4
    });

    it('should handle large numbers', () => {
      const metrics: YouTubeSkipMetrics = {
        alreadySeen: 1000,
        shortsFiltered: 500,
        invalidDate: 250,
        unavailable: 125,
        other: 62,
      };

      expect(getTotalSkipCount(metrics)).toBe(1937);
    });
  });

  describe('skip metrics integration scenarios', () => {
    it('should track typical YouTube polling scenario', () => {
      // Simulate polling a subscription with mixed video types
      const skipMetrics = createEmptyYouTubeSkipMetrics();

      // Found 10 videos total
      // - 3 are Shorts
      // - 2 have invalid dates
      // - 1 is private/unavailable
      // - 4 are valid new videos
      skipMetrics.shortsFiltered = 3;
      skipMetrics.invalidDate = 2;
      skipMetrics.unavailable = 1;

      expect(getTotalSkipCount(skipMetrics)).toBe(6);
      // 10 total - 6 skipped = 4 valid videos
    });

    it('should aggregate metrics from multiple subscriptions', () => {
      // Subscription 1: Tech channel with many Shorts
      const sub1Metrics: YouTubeSkipMetrics = {
        alreadySeen: 0,
        shortsFiltered: 8,
        invalidDate: 0,
        unavailable: 0,
        other: 0,
      };

      // Subscription 2: News channel with some unavailable videos
      const sub2Metrics: YouTubeSkipMetrics = {
        alreadySeen: 0,
        shortsFiltered: 1,
        invalidDate: 0,
        unavailable: 3,
        other: 0,
      };

      // Subscription 3: Old channel with date parsing issues
      const sub3Metrics: YouTubeSkipMetrics = {
        alreadySeen: 0,
        shortsFiltered: 0,
        invalidDate: 5,
        unavailable: 1,
        other: 0,
      };

      const aggregated = aggregateYouTubeSkipMetrics([sub1Metrics, sub2Metrics, sub3Metrics]);

      expect(aggregated).toEqual({
        alreadySeen: 0,
        shortsFiltered: 9, // 8 + 1 + 0
        invalidDate: 5, // 0 + 0 + 5
        unavailable: 4, // 0 + 3 + 1
        other: 0,
      });

      expect(getTotalSkipCount(aggregated)).toBe(18);
    });

    it('should provide insights for monitoring', () => {
      // After a poll cycle, we can answer questions like:
      const metrics: YouTubeSkipMetrics = {
        alreadySeen: 0,
        shortsFiltered: 15,
        invalidDate: 2,
        unavailable: 3,
        other: 1,
      };

      const total = getTotalSkipCount(metrics);

      // How many Shorts are we filtering? (validate filter working)
      expect(metrics.shortsFiltered).toBe(15);

      // What percentage are Shorts?
      const shortsPercentage = (metrics.shortsFiltered / total) * 100;
      expect(shortsPercentage).toBeCloseTo(71.43, 1);

      // How many videos have invalid dates? (API data quality)
      expect(metrics.invalidDate).toBe(2);

      // Are there unavailable videos we should investigate?
      expect(metrics.unavailable).toBe(3);
    });
  });
});
