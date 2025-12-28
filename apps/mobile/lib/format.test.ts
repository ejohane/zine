/**
 * Tests for lib/format.ts
 *
 * Comprehensive tests for duration, relative time, and date formatting utilities.
 */

import {
  formatDuration,
  formatDurationTimestamp,
  formatRelativeTime,
  formatDate,
  formatDateTime,
} from './format';

// ============================================================================
// formatDuration Tests
// ============================================================================

describe('formatDuration', () => {
  describe('valid inputs', () => {
    it('formats hours and minutes', () => {
      expect(formatDuration(3723)).toBe('1h 2m');
    });

    it('formats exactly one hour', () => {
      expect(formatDuration(3600)).toBe('1h 0m');
    });

    it('formats multiple hours', () => {
      expect(formatDuration(7200)).toBe('2h 0m');
    });

    it('formats minutes only', () => {
      expect(formatDuration(2700)).toBe('45m');
    });

    it('formats zero seconds as 0m', () => {
      expect(formatDuration(0)).toBe('0m');
    });

    it('formats seconds less than a minute as 0m', () => {
      expect(formatDuration(59)).toBe('0m');
    });
  });

  describe('edge cases', () => {
    it('returns empty string for null', () => {
      expect(formatDuration(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(formatDuration(undefined)).toBe('');
    });

    it('returns empty string for negative values', () => {
      expect(formatDuration(-100)).toBe('');
    });
  });
});

// ============================================================================
// formatDurationTimestamp Tests
// ============================================================================

describe('formatDurationTimestamp', () => {
  describe('valid inputs', () => {
    it('formats hours, minutes, and seconds', () => {
      expect(formatDurationTimestamp(3661)).toBe('1:01:01');
    });

    it('formats with padded zeros', () => {
      expect(formatDurationTimestamp(3605)).toBe('1:00:05');
    });

    it('formats minutes and seconds only', () => {
      expect(formatDurationTimestamp(125)).toBe('2:05');
    });

    it('formats less than a minute', () => {
      expect(formatDurationTimestamp(45)).toBe('0:45');
    });

    it('formats zero seconds', () => {
      expect(formatDurationTimestamp(0)).toBe('0:00');
    });

    it('formats exactly one hour', () => {
      expect(formatDurationTimestamp(3600)).toBe('1:00:00');
    });
  });

  describe('edge cases', () => {
    it('returns empty string for null', () => {
      expect(formatDurationTimestamp(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(formatDurationTimestamp(undefined)).toBe('');
    });

    it('returns empty string for negative values', () => {
      expect(formatDurationTimestamp(-100)).toBe('');
    });
  });
});

// ============================================================================
// formatRelativeTime Tests
// ============================================================================

describe('formatRelativeTime', () => {
  // Helper to create a date relative to now
  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60 * 1000).toISOString();
  const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  describe('recent times', () => {
    it('returns "Just now" for times less than a minute ago', () => {
      const now = new Date().toISOString();
      expect(formatRelativeTime(now)).toBe('Just now');
    });

    it('returns "Just now" for future dates', () => {
      const future = new Date(Date.now() + 60 * 1000).toISOString();
      expect(formatRelativeTime(future)).toBe('Just now');
    });

    it('formats singular minute', () => {
      expect(formatRelativeTime(minutesAgo(1))).toBe('1 minute ago');
    });

    it('formats plural minutes', () => {
      expect(formatRelativeTime(minutesAgo(30))).toBe('30 minutes ago');
    });

    it('formats singular hour', () => {
      expect(formatRelativeTime(hoursAgo(1))).toBe('1 hour ago');
    });

    it('formats plural hours', () => {
      expect(formatRelativeTime(hoursAgo(5))).toBe('5 hours ago');
    });
  });

  describe('days and weeks', () => {
    it('returns "Yesterday" for 1 day ago', () => {
      expect(formatRelativeTime(daysAgo(1))).toBe('Yesterday');
    });

    it('formats plural days', () => {
      expect(formatRelativeTime(daysAgo(3))).toBe('3 days ago');
    });

    it('formats singular week', () => {
      expect(formatRelativeTime(daysAgo(7))).toBe('1 week ago');
    });

    it('formats plural weeks', () => {
      expect(formatRelativeTime(daysAgo(14))).toBe('2 weeks ago');
    });
  });

  describe('edge cases', () => {
    it('returns empty string for null', () => {
      expect(formatRelativeTime(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(formatRelativeTime(undefined)).toBe('');
    });

    it('returns empty string for invalid date', () => {
      expect(formatRelativeTime('invalid-date')).toBe('');
    });

    it('returns empty string for empty string', () => {
      expect(formatRelativeTime('')).toBe('');
    });
  });
});

// ============================================================================
// formatDate Tests
// ============================================================================

describe('formatDate', () => {
  describe('valid inputs', () => {
    it('formats date in current year without year', () => {
      const currentYear = new Date().getFullYear();
      const date = `${currentYear}-03-15T10:00:00Z`;
      expect(formatDate(date)).toBe('Mar 15');
    });

    it('formats date in different year with year', () => {
      expect(formatDate('2020-01-15T10:00:00Z')).toBe('Jan 15, 2020');
    });
  });

  describe('edge cases', () => {
    it('returns empty string for null', () => {
      expect(formatDate(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(formatDate(undefined)).toBe('');
    });

    it('returns empty string for invalid date', () => {
      expect(formatDate('not-a-date')).toBe('');
    });
  });
});

// ============================================================================
// formatDateTime Tests
// ============================================================================

describe('formatDateTime', () => {
  describe('valid inputs', () => {
    it('formats date and time correctly', () => {
      // Note: The exact output depends on the timezone, so we just check the format
      const result = formatDateTime('2024-01-15T15:30:00Z');
      expect(result).toContain('Jan 15, 2024');
      expect(result).toContain('at');
    });
  });

  describe('edge cases', () => {
    it('returns empty string for null', () => {
      expect(formatDateTime(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(formatDateTime(undefined)).toBe('');
    });

    it('returns empty string for invalid date', () => {
      expect(formatDateTime('invalid')).toBe('');
    });
  });
});
