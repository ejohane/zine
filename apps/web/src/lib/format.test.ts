import { describe, expect, test } from 'vitest';

import {
  formatDisplayText,
  formatDuration,
  formatEstimatedMinutes,
  formatPlainText,
  formatRelativeDate,
  isValidUrl,
} from './format';

describe('format utilities', () => {
  test('strips markup and preserves basic entities', () => {
    expect(
      formatPlainText(
        '<style>body{}</style><script>alert(1)</script><p>Hello&nbsp;<strong>world</strong> &amp; friends</p>'
      )
    ).toBe('Hello world & friends');
  });

  test('formats display text without leaking markup or entities', () => {
    expect(formatDisplayText('Joy &amp; Curiosity #89')).toBe('Joy & Curiosity #89');
    expect(formatDisplayText('<span></span>', 'Fallback')).toBe('Fallback');
  });

  test('formats durations across minute and hour boundaries', () => {
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3723)).toBe('1:02:03');
    expect(formatDuration(-1)).toBeUndefined();
  });

  test('formats estimated minutes safely', () => {
    expect(formatEstimatedMinutes(0)).toBe('0m');
    expect(formatEstimatedMinutes(60)).toBe('1h');
    expect(formatEstimatedMinutes(135)).toBe('2h 15m');
  });

  test('returns a relative fallback for missing dates', () => {
    expect(formatRelativeDate(null)).toBe('Recently');
  });

  test('accepts only http and https URLs', () => {
    expect(isValidUrl('https://zine.example')).toBe(true);
    expect(isValidUrl('http://zine.example')).toBe(true);
    expect(isValidUrl('mailto:test@example.com')).toBe(false);
    expect(isValidUrl('')).toBe(false);
  });
});
