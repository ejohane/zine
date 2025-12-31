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
 * Convert ISO 8601 string to Unix milliseconds.
 *
 * @param iso - ISO 8601 date string (e.g., "2024-01-15T10:00:00.000Z")
 * @returns Unix timestamp in milliseconds
 *
 * @example
 * isoToUnix("2024-01-15T10:00:00.000Z") // 1705312800000
 */
export function isoToUnix(iso: string): number {
  return new Date(iso).getTime();
}

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
// Current Timestamp Functions
// ============================================================================

/**
 * Get current timestamp as Unix milliseconds.
 *
 * Use this for new subscription-related tables.
 *
 * @returns Current Unix timestamp in milliseconds
 *
 * @example
 * const createdAt = nowUnix(); // 1705312800000
 */
export function nowUnix(): number {
  return Date.now();
}

/**
 * Get current timestamp as ISO 8601 string.
 *
 * Use this for legacy tables (users, items, user_items, sources).
 *
 * @returns Current ISO 8601 date string
 *
 * @example
 * const createdAt = nowIso(); // "2024-01-15T10:00:00.000Z"
 */
export function nowIso(): string {
  return new Date().toISOString();
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Check if a value is a valid Unix timestamp in milliseconds.
 *
 * @param value - Value to check
 * @returns true if value is a valid Unix timestamp
 */
export function isUnixTimestamp(value: unknown): value is number {
  if (typeof value !== 'number') return false;
  // Reasonable range: 2000-01-01 to 2100-01-01
  const MIN_TIMESTAMP = 946684800000; // 2000-01-01
  const MAX_TIMESTAMP = 4102444800000; // 2100-01-01
  return value >= MIN_TIMESTAMP && value <= MAX_TIMESTAMP;
}

/**
 * Check if a value is a valid ISO 8601 date string.
 *
 * @param value - Value to check
 * @returns true if value is a valid ISO 8601 string
 */
export function isIsoString(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !isNaN(date.getTime()) && value.includes('T');
}

// ============================================================================
// Optional/Nullable Helpers
// ============================================================================

/**
 * Convert optional ISO string to Unix, returning null if input is null/undefined.
 *
 * @param iso - Optional ISO 8601 date string
 * @returns Unix timestamp or null
 */
export function isoToUnixOptional(iso: string | null | undefined): number | null {
  if (iso == null) return null;
  return isoToUnix(iso);
}

/**
 * Convert optional Unix timestamp to ISO, returning null if input is null/undefined.
 *
 * @param unix - Optional Unix timestamp
 * @returns ISO 8601 string or null
 */
export function unixToIsoOptional(unix: number | null | undefined): string | null {
  if (unix == null) return null;
  return unixToIso(unix);
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
