/**
 * Timestamp Conversion Utilities
 *
 * This module provides consistent timestamp conversions between:
 * - ISO 8601 strings (legacy tables: users, items, user_items, sources)
 * - Unix milliseconds (new tables: subscriptions, provider_connections)
 *
 * CONVENTION:
 * - Legacy tables use ISO 8601: "2024-01-15T10:00:00.000Z"
 * - New subscription tables use Unix ms: 1705312800000
 *
 * Always use these helpers instead of inline Date conversions to ensure
 * consistent handling across the codebase.
 */

// ============================================================================
// Conversion Functions
// ============================================================================

/**
 * Convert Unix milliseconds to ISO 8601 string.
 *
 * @param unix - Unix timestamp in milliseconds
 * @returns ISO 8601 date string
 *
 * @example
 * unixToIso(1705312800000) // "2024-01-15T10:00:00.000Z"
 */
export function unixToIso(unix: number): string {
  return new Date(unix).toISOString();
}

// ============================================================================
// Provider-Specific Parsers
// ============================================================================

/**
 * Parse Spotify's variable date format into Unix milliseconds.
 *
 * Spotify release_date can be one of three formats:
 * - YYYY (just year) → normalizes to YYYY-01-01
 * - YYYY-MM (year-month) → normalizes to YYYY-MM-01
 * - YYYY-MM-DD (full date) → used as-is
 *
 * All dates are interpreted as UTC midnight.
 *
 * @param dateStr - Spotify date string (or null/undefined)
 * @param fallback - Fallback if date is null/undefined/invalid (default: Date.now())
 * @returns Unix timestamp in milliseconds
 *
 * @example
 * parseSpotifyDate("2024") // 1704067200000 (2024-01-01T00:00:00Z)
 * parseSpotifyDate("2024-06") // 1717200000000 (2024-06-01T00:00:00Z)
 * parseSpotifyDate("2024-06-15") // 1718409600000 (2024-06-15T00:00:00Z)
 * parseSpotifyDate(null) // Date.now()
 */
export function parseSpotifyDate(
  dateStr: string | null | undefined,
  fallback: number = Date.now()
): number {
  if (!dateStr) return fallback;

  // Normalize to YYYY-MM-DD format
  const normalized =
    dateStr.length === 4
      ? `${dateStr}-01-01` // YYYY → YYYY-01-01
      : dateStr.length === 7
        ? `${dateStr}-01` // YYYY-MM → YYYY-MM-01
        : dateStr; // YYYY-MM-DD → unchanged

  const timestamp = new Date(`${normalized}T00:00:00Z`).getTime();
  return isNaN(timestamp) ? fallback : timestamp;
}
