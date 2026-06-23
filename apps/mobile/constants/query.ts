/**
 * React Query Timing Constants
 *
 * Centralized timing values for React Query staleTime and gcTime.
 * Consistent values across hooks ensure predictable caching behavior.
 */

// Time Constants (in milliseconds)

/**
 * 5 minutes in milliseconds.
 * Used as default staleTime for most queries.
 *
 * Stale time determines how long data is considered "fresh".
 * During this window, React Query returns cached data without refetching.
 */
export const FIVE_MINUTES_MS = 5 * 60 * 1000;

/**
 * 15 seconds in milliseconds.
 * Used by inbox queries so newly synced feed items appear without tab navigation.
 */
export const LIVE_INBOX_REFETCH_INTERVAL_MS = 15 * 1000;

/**
 * 24 hours in milliseconds.
 * Used as default gcTime (garbage collection time) for queries.
 *
 * GC time determines how long unused data stays in cache.
 * After this period, inactive queries are garbage collected.
 */
export const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

// React Query Defaults

/**
 * Default query options for most data queries.
 *
 * - staleTime: 5 minutes - data is "fresh" for 5 minutes
 * - gcTime: 24 hours - unused queries stay in cache for a day
 * - retry: 2 - retry failed requests twice
 */
export const DEFAULT_QUERY_OPTIONS = {
  staleTime: FIVE_MINUTES_MS,
  gcTime: TWENTY_FOUR_HOURS_MS,
  retry: 2,
} as const;
