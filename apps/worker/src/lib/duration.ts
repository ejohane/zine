/**
 * Duration Parsing Utilities
 *
 * Provides functions for parsing various duration formats,
 * particularly ISO 8601 durations used by YouTube and other APIs.
 */

/**
 * Parse ISO 8601 duration format (e.g., "PT1M30S") into seconds.
 * Returns 0 for invalid/empty input (graceful degradation).
 *
 * @param duration - ISO 8601 duration string (e.g., "PT1H30M45S")
 * @returns Duration in seconds, or 0 if invalid
 *
 * @example
 * ```typescript
 * parseISO8601Duration("PT1M30S")  // 90
 * parseISO8601Duration("PT60S")    // 60
 * parseISO8601Duration("PT1H")     // 3600
 * parseISO8601Duration("PT1H30M45S") // 5445
 * parseISO8601Duration("")         // 0 (graceful degradation)
 * ```
 */
export function parseISO8601Duration(duration: string): number {
  if (!duration) {
    return 0;
  }

  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) {
    return 0;
  }

  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);

  return hours * 3600 + minutes * 60 + seconds;
}
