import { describe, it, expect } from 'vitest';
import { DateNormalizer, toUnixTimestamp, toISOString, toDate, isValidTimestamp, normalizeObjectDates, now, formatRelative } from '../date-normalizer';

describe('DateNormalizer', () => {
  describe('toUnixTimestamp', () => {
    it('should handle null and undefined', () => {
      expect(DateNormalizer.toUnixTimestamp(null)).toBeNull();
      expect(DateNormalizer.toUnixTimestamp(undefined)).toBeNull();
    });

    it('should convert Date objects to Unix timestamp', () => {
      const date = new Date('2024-01-15T12:00:00Z');
      expect(DateNormalizer.toUnixTimestamp(date)).toBe(1705320000);
    });

    it('should parse ISO strings', () => {
      expect(DateNormalizer.toUnixTimestamp('2024-01-15T12:00:00Z')).toBe(1705320000);
      expect(DateNormalizer.toUnixTimestamp('2024-01-15T12:00:00.000Z')).toBe(1705320000);
    });

    it('should handle Unix timestamps in seconds', () => {
      const timestamp = 1705320000;
      expect(DateNormalizer.toUnixTimestamp(timestamp)).toBe(timestamp);
    });

    it('should convert millisecond timestamps to seconds', () => {
      const milliseconds = 1705320000000;
      expect(DateNormalizer.toUnixTimestamp(milliseconds)).toBe(1705320000);
    });

    it('should reject invalid dates', () => {
      expect(DateNormalizer.toUnixTimestamp('invalid-date')).toBeNull();
      expect(DateNormalizer.toUnixTimestamp(-1)).toBeNull(); // Before epoch
      expect(DateNormalizer.toUnixTimestamp(5000000000)).toBeNull(); // After 2100
    });

    it('should handle edge cases', () => {
      expect(DateNormalizer.toUnixTimestamp(0)).toBeNull(); // Invalid timestamp
      expect(DateNormalizer.toUnixTimestamp('')).toBeNull();
    });
  });

  describe('toISOString', () => {
    it('should convert Unix timestamp to ISO string', () => {
      expect(DateNormalizer.toISOString(1705320000)).toBe('2024-01-15T12:00:00.000Z');
    });

    it('should handle null and undefined', () => {
      expect(DateNormalizer.toISOString(null)).toBeNull();
      expect(DateNormalizer.toISOString(undefined)).toBeNull();
    });

    it('should handle millisecond timestamps', () => {
      expect(DateNormalizer.toISOString(1705320000000)).toBe('2024-01-15T12:00:00.000Z');
    });
  });

  describe('toDate', () => {
    it('should convert Unix timestamp to Date object', () => {
      const date = DateNormalizer.toDate(1705320000);
      expect(date).toBeInstanceOf(Date);
      expect(date?.toISOString()).toBe('2024-01-15T12:00:00.000Z');
    });

    it('should handle null and undefined', () => {
      expect(DateNormalizer.toDate(null)).toBeNull();
      expect(DateNormalizer.toDate(undefined)).toBeNull();
    });

    it('should handle millisecond timestamps', () => {
      const date = DateNormalizer.toDate(1705320000000);
      expect(date?.toISOString()).toBe('2024-01-15T12:00:00.000Z');
    });
  });

  describe('isValidTimestamp', () => {
    it('should validate Unix timestamps', () => {
      expect(DateNormalizer.isValidTimestamp(1705320000)).toBe(true);
      expect(DateNormalizer.isValidTimestamp(1)).toBe(true);
      expect(DateNormalizer.isValidTimestamp(4102444799)).toBe(true);
    });

    it('should reject invalid timestamps', () => {
      expect(DateNormalizer.isValidTimestamp(0)).toBe(false);
      expect(DateNormalizer.isValidTimestamp(-1)).toBe(false);
      expect(DateNormalizer.isValidTimestamp(5000000000)).toBe(false);
      expect(DateNormalizer.isValidTimestamp('1705320000')).toBe(false);
      expect(DateNormalizer.isValidTimestamp(null)).toBe(false);
      expect(DateNormalizer.isValidTimestamp(undefined)).toBe(false);
    });
  });

  describe('normalizeObjectDates', () => {
    it('should normalize date fields in an object', () => {
      const obj = {
        id: '123',
        title: 'Test',
        createdAt: '2024-01-15T12:00:00Z',
        updatedAt: new Date('2024-01-16T12:00:00Z'),
        publishedAt: 1705492800000, // milliseconds
        other: 'value'
      };

      const normalized = DateNormalizer.normalizeObjectDates(obj, ['createdAt', 'updatedAt', 'publishedAt']);

      expect(normalized).toEqual({
        id: '123',
        title: 'Test',
        createdAt: 1705320000,
        updatedAt: 1705406400,
        publishedAt: 1705492800,
        other: 'value'
      });
    });

    it('should handle missing fields', () => {
      const obj: any = { id: '123', title: 'Test' };
      const normalized = DateNormalizer.normalizeObjectDates(obj, ['createdAt', 'updatedAt']);
      
      expect(normalized).toEqual(obj);
    });

    it('should handle null values', () => {
      const obj = { id: '123', createdAt: null };
      const normalized = DateNormalizer.normalizeObjectDates(obj, ['createdAt']);
      
      expect(normalized).toEqual({ id: '123', createdAt: null });
    });
  });

  describe('now', () => {
    it('should return current Unix timestamp', () => {
      const timestamp = DateNormalizer.now();
      const now = Math.floor(Date.now() / 1000);
      
      expect(timestamp).toBeGreaterThan(1700000000);
      expect(timestamp).toBeLessThanOrEqual(now);
      expect(timestamp).toBeCloseTo(now, 0);
    });
  });

  describe('formatRelative', () => {
    it('should format timestamps as relative time', () => {
      const now = DateNormalizer.now();
      
      expect(DateNormalizer.formatRelative(now)).toBe('Just now');
      expect(DateNormalizer.formatRelative(now - 30)).toBe('Just now');
      expect(DateNormalizer.formatRelative(now - 120)).toBe('2 minutes ago');
      expect(DateNormalizer.formatRelative(now - 3700)).toBe('1 hours ago');
      expect(DateNormalizer.formatRelative(now - 90000)).toBe('1 days ago');
      expect(DateNormalizer.formatRelative(now - 700000)).toBe('1 weeks ago');
      expect(DateNormalizer.formatRelative(now - 3000000)).toBe('1 months ago');
      expect(DateNormalizer.formatRelative(now - 40000000)).toBe('1 years ago');
    });

    it('should handle null and undefined', () => {
      expect(DateNormalizer.formatRelative(null)).toBe('Unknown');
      expect(DateNormalizer.formatRelative(undefined)).toBe('Unknown');
    });
  });

  describe('convenience exports', () => {
    it('should export convenience functions', () => {
      expect(toUnixTimestamp('2024-01-15T12:00:00Z')).toBe(1705320000);
      expect(toISOString(1705320000)).toBe('2024-01-15T12:00:00.000Z');
      expect(toDate(1705320000)?.toISOString()).toBe('2024-01-15T12:00:00.000Z');
      expect(isValidTimestamp(1705320000)).toBe(true);
      expect(now()).toBeGreaterThan(1700000000);
      expect(formatRelative(now())).toBe('Just now');

      const obj = { createdAt: '2024-01-15T12:00:00Z' };
      expect(normalizeObjectDates(obj, ['createdAt'])).toEqual({ createdAt: 1705320000 });
    });
  });
});