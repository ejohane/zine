import { describe, it, expect } from 'vitest';
import { parseISO8601Duration } from './duration';

describe('parseISO8601Duration', () => {
  describe('standard durations', () => {
    it('parses minutes and seconds', () => {
      expect(parseISO8601Duration('PT1M30S')).toBe(90);
    });

    it('parses exact threshold (60s)', () => {
      expect(parseISO8601Duration('PT60S')).toBe(60);
      expect(parseISO8601Duration('PT1M')).toBe(60);
    });

    it('parses hours', () => {
      expect(parseISO8601Duration('PT1H')).toBe(3600);
    });

    it('parses full format (hours, minutes, seconds)', () => {
      expect(parseISO8601Duration('PT1H30M45S')).toBe(5445);
    });
  });

  describe('Shorts boundary cases', () => {
    it('59 seconds is a Short (<=60)', () => {
      expect(parseISO8601Duration('PT59S')).toBe(59);
    });

    it('60 seconds is a Short (<=60)', () => {
      expect(parseISO8601Duration('PT60S')).toBe(60);
    });

    it('61 seconds is NOT a Short (>60)', () => {
      expect(parseISO8601Duration('PT1M1S')).toBe(61);
    });
  });

  describe('edge cases', () => {
    it('handles zero duration', () => {
      expect(parseISO8601Duration('PT0S')).toBe(0);
    });

    it('handles missing seconds component', () => {
      expect(parseISO8601Duration('PT5M')).toBe(300);
    });

    it('handles missing minutes component', () => {
      expect(parseISO8601Duration('PT30S')).toBe(30);
    });

    it('handles hours only', () => {
      expect(parseISO8601Duration('PT2H')).toBe(7200);
    });

    it('handles empty string gracefully', () => {
      expect(parseISO8601Duration('')).toBe(0);
    });

    it('handles malformed input gracefully', () => {
      expect(parseISO8601Duration('invalid')).toBe(0);
      expect(parseISO8601Duration('1:30')).toBe(0);
      expect(parseISO8601Duration('90')).toBe(0);
    });

    it('handles null-like values', () => {
      // @ts-expect-error - testing runtime behavior
      expect(parseISO8601Duration(null)).toBe(0);
      // @ts-expect-error - testing runtime behavior
      expect(parseISO8601Duration(undefined)).toBe(0);
    });
  });

  describe('real YouTube examples', () => {
    it('parses typical video duration', () => {
      expect(parseISO8601Duration('PT12M34S')).toBe(754);
    });

    it('parses typical Short duration', () => {
      expect(parseISO8601Duration('PT58S')).toBe(58);
    });

    it('parses long video duration', () => {
      expect(parseISO8601Duration('PT2H15M30S')).toBe(8130);
    });

    it('parses livestream archive (very long)', () => {
      expect(parseISO8601Duration('PT12H30M')).toBe(45000);
    });
  });
});
