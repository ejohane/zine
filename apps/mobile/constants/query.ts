/**
 * React Query Timing Constants
 *
 * Centralized timing values for React Query staleTime and gcTime.
 * Consistent values across hooks ensure predictable caching behavior.
 */

// ============================================================================
// Time Constants (in milliseconds)
// ============================================================================

/**
 * 5 minutes in milliseconds.
 * Used as default staleTime for most queries.
 *
 * Stale time determines how long data is considered "fresh".
 * During this window, React Query returns cached data without refetching.
 */
export const FIVE_MINUTES_MS = 5 * 60 * 1000;

/**
 * 24 hours in milliseconds.
 * Used as default gcTime (garbage collection time) for queries.
 *
 * GC time determines how long unused data stays in cache.
 * After this period, inactive queries are garbage collected.
 */
export const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * 30 seconds in milliseconds.
 * Used for sync debouncing to prevent rapid re-syncs.
 */
export const THIRTY_SECONDS_MS = 30 * 1000;

/**
 * 1 second in milliseconds.
 * Used for UI countdowns and short delays.
 */
export const ONE_SECOND_MS = 1000;

// ============================================================================
// React Query Defaults
// ============================================================================

/**
 * Default query options for most data queries.
 *
 * - staleTime: 5 minutes - data is "fresh" for 5 minutes
 * - gcTime: 24 hours - unused queries stay in cache for a day
 */
export const DEFAULT_QUERY_OPTIONS = {
  staleTime: FIVE_MINUTES_MS,
  gcTime: TWENTY_FOUR_HOURS_MS,
} as const;

// ============================================================================
// Sync & Retry Constants
// ============================================================================

/**
 * Default cooldown between manual sync attempts (in seconds).
 * Prevents users from hammering the sync button.
 */
export const DEFAULT_SYNC_COOLDOWN_SECONDS = 300; // 5 minutes

/**
 * Maximum retry attempts for offline actions before giving up.
 */
export const MAX_OFFLINE_RETRIES = 3;

/**
 * Maximum auth refresh retries before requiring re-login.
 * Only one retry after token refresh to avoid infinite loops.
 */
export const MAX_AUTH_RETRIES = 1;
