/**
 * Tests for lib/analytics.ts
 *
 * Tests for the analytics utility module.
 */

import { analytics, type AnalyticsEvents } from './analytics';

// ============================================================================
// Setup
// ============================================================================

// Mock console methods
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();

beforeEach(() => {
  mockConsoleLog.mockClear();
  // Re-enable analytics for each test
  analytics.setEnabled(true);
});

afterAll(() => {
  mockConsoleLog.mockRestore();
});

// ============================================================================
// analytics.track Tests
// ============================================================================

describe('analytics.track', () => {
  describe('creator_view_opened', () => {
    it('tracks event with required properties', () => {
      analytics.track('creator_view_opened', {
        creatorId: 'creator-123',
        provider: 'YOUTUBE',
        source: 'item_page',
        bookmarkCount: 5,
      });

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('creator_view_opened'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('creatorId'));
    });

    it('tracks with different sources', () => {
      const sources: Array<AnalyticsEvents['creator_view_opened']['source']> = [
        'item_page',
        'search',
        'deep_link',
      ];

      sources.forEach((source) => {
        mockConsoleLog.mockClear();
        analytics.track('creator_view_opened', {
          creatorId: 'creator-123',
          provider: 'YOUTUBE',
          source,
          bookmarkCount: 0,
        });

        expect(mockConsoleLog).toHaveBeenCalled();
      });
    });
  });

  describe('creator_latest_content_loaded', () => {
    it('tracks event with content count', () => {
      analytics.track('creator_latest_content_loaded', {
        creatorId: 'creator-123',
        provider: 'YOUTUBE',
        contentCount: 10,
        hadCache: false,
      });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('creator_latest_content_loaded')
      );
    });

    it('tracks with cache hit', () => {
      analytics.track('creator_latest_content_loaded', {
        creatorId: 'creator-123',
        provider: 'SPOTIFY',
        contentCount: 5,
        hadCache: true,
      });

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('hadCache=true'));
    });
  });

  describe('creator_subscribe_tapped', () => {
    it('tracks successful subscription', () => {
      analytics.track('creator_subscribe_tapped', {
        creatorId: 'creator-123',
        provider: 'YOUTUBE',
        success: true,
      });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('creator_subscribe_tapped')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('success=true'));
    });

    it('tracks failed subscription with error reason', () => {
      analytics.track('creator_subscribe_tapped', {
        creatorId: 'creator-123',
        provider: 'YOUTUBE',
        success: false,
        errorReason: 'Network error',
      });

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('success=false'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('errorReason'));
    });
  });

  describe('creator_content_opened', () => {
    it('tracks bookmark content opened', () => {
      analytics.track('creator_content_opened', {
        creatorId: 'creator-123',
        contentType: 'bookmark',
        provider: 'YOUTUBE',
        destination: 'internal',
        itemId: 'item-123',
      });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('creator_content_opened')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('contentType="bookmark"')
      );
    });

    it('tracks latest content opened with external URL', () => {
      analytics.track('creator_content_opened', {
        creatorId: 'creator-123',
        contentType: 'latest',
        provider: 'YOUTUBE',
        destination: 'external',
        itemId: null,
        externalUrl: 'https://youtube.com/watch?v=abc123',
      });

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('contentType="latest"'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('externalUrl'));
    });
  });

  describe('creator_connect_prompt_shown', () => {
    it('tracks NOT_CONNECTED reason', () => {
      analytics.track('creator_connect_prompt_shown', {
        creatorId: 'creator-123',
        provider: 'YOUTUBE',
        reason: 'NOT_CONNECTED',
      });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('creator_connect_prompt_shown')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('NOT_CONNECTED'));
    });

    it('tracks TOKEN_EXPIRED reason', () => {
      analytics.track('creator_connect_prompt_shown', {
        creatorId: 'creator-123',
        provider: 'SPOTIFY',
        reason: 'TOKEN_EXPIRED',
      });

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('TOKEN_EXPIRED'));
    });
  });
});

// ============================================================================
// analytics.setEnabled Tests
// ============================================================================

describe('analytics.setEnabled', () => {
  it('disables tracking when set to false', () => {
    analytics.setEnabled(false);

    analytics.track('creator_view_opened', {
      creatorId: 'creator-123',
      provider: 'YOUTUBE',
      source: 'item_page',
      bookmarkCount: 0,
    });

    expect(mockConsoleLog).not.toHaveBeenCalled();
  });

  it('re-enables tracking when set to true', () => {
    analytics.setEnabled(false);
    analytics.setEnabled(true);

    analytics.track('creator_view_opened', {
      creatorId: 'creator-123',
      provider: 'YOUTUBE',
      source: 'item_page',
      bookmarkCount: 0,
    });

    expect(mockConsoleLog).toHaveBeenCalled();
  });
});

// ============================================================================
// analytics.identify Tests
// ============================================================================

describe('analytics.identify', () => {
  it('logs user identification', () => {
    analytics.identify('user-123');

    expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Identify user'));
  });

  it('logs user identification with traits', () => {
    analytics.identify('user-123', { plan: 'premium', createdAt: '2024-01-01' });

    expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('traits'));
  });

  it('respects enabled flag', () => {
    analytics.setEnabled(false);
    analytics.identify('user-123');

    expect(mockConsoleLog).not.toHaveBeenCalled();
  });
});

// ============================================================================
// analytics.reset Tests
// ============================================================================

describe('analytics.reset', () => {
  it('logs reset', () => {
    analytics.reset();

    expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Analytics reset'));
  });
});
