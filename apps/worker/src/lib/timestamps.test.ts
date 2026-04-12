/**
 * Tests for timestamp utilities
 *
 * Verifies shared helpers used across ingestion, polling, and router layers.
 * Focused on parseSpotifyDate which replaced local copies in multiple files.
 */

import { describe, it, expect } from 'vitest';
import { parseSpotifyDate } from './timestamps';

describe('parseSpotifyDate', () => {
  it('parses YYYY-MM-DD (full date) as UTC midnight', () => {
    expect(parseSpotifyDate('2024-01-15')).toBe(new Date('2024-01-15T00:00:00Z').getTime());
  });

  it('parses YYYY-MM (month precision) as first of month UTC midnight', () => {
    expect(parseSpotifyDate('2024-06')).toBe(new Date('2024-06-01T00:00:00Z').getTime());
  });

  it('parses YYYY (year only) as January 1st UTC midnight', () => {
    expect(parseSpotifyDate('2024')).toBe(new Date('2024-01-01T00:00:00Z').getTime());
  });

  it('returns fallback for null', () => {
    const fallback = 1704067200000;
    expect(parseSpotifyDate(null, fallback)).toBe(fallback);
  });

  it('returns fallback for undefined', () => {
    const fallback = 1704067200000;
    expect(parseSpotifyDate(undefined, fallback)).toBe(fallback);
  });

  it('returns fallback for empty string', () => {
    const fallback = 1704067200000;
    expect(parseSpotifyDate('', fallback)).toBe(fallback);
  });

  it('returns fallback for an invalid date string', () => {
    const fallback = 1704067200000;
    expect(parseSpotifyDate('not-a-date', fallback)).toBe(fallback);
  });
});
