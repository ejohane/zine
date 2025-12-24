/**
 * YouTube API Quota Tracking and Graceful Degradation
 *
 * Implements quota management for YouTube Data API v3 to prevent exceeding
 * the daily 10,000 unit limit and degrade gracefully when approaching limits.
 *
 * Key features:
 * - Per-day tracking (Pacific Time, when YouTube quota resets)
 * - Warning threshold at 80%, critical threshold at 95%
 * - Pre-flight quota checks before API calls
 * - Graceful degradation for non-essential operations
 *
 * YouTube API Quota Costs:
 * - channels.list: 1 unit
 * - playlistItems.list: 1 unit
 * - subscriptions.list: 1 unit
 * - search.list: 100 units (expensive!)
 *
 * See: features/subscriptions/backend-spec.md Section 3.6
 */

// ============================================================================
// Constants
// ============================================================================

/** YouTube's daily quota limit (default allocation) */
const DAILY_QUOTA = 10_000;

/** Percentage of quota at which to warn (80%) */
const WARNING_THRESHOLD = 0.8;

/** Percentage of quota at which to enter critical mode (95%) */
const CRITICAL_THRESHOLD = 0.95;

/** KV key prefix for quota tracking */
const QUOTA_KEY_PREFIX = 'youtube:quota:';

/** TTL for quota records (2 days to handle timezone edge cases) */
const QUOTA_TTL_SECONDS = 2 * 24 * 3600;

// ============================================================================
// Types
// ============================================================================

/**
 * Quota state persisted to KV storage
 */
interface QuotaState {
  /** Accumulated quota units used today */
  used: number;
  /** Date string in YYYY-MM-DD format (Pacific Time) */
  date: string;
  /** Unix timestamp of last update */
  lastUpdated: number;
}

/**
 * Current quota status with computed fields
 */
export interface QuotaStatus {
  /** Total units used today */
  used: number;
  /** Remaining units for today */
  remaining: number;
  /** Percentage of daily quota consumed (0-100) */
  percentUsed: number;
  /** True if quota is at or above warning threshold (80%) */
  isWarning: boolean;
  /** True if quota is at or above critical threshold (95%) */
  isCritical: boolean;
}

/**
 * Result of a quota pre-check
 */
export interface QuotaCheckResult {
  /** Whether the operation is allowed */
  allowed: boolean;
  /** Reason if not allowed */
  reason?: string;
}

/**
 * Common YouTube API operation costs
 */
export const YOUTUBE_QUOTA_COSTS = {
  /** channels.list - Get channel details */
  CHANNELS_LIST: 1,
  /** playlistItems.list - Get videos from playlist */
  PLAYLIST_ITEMS_LIST: 1,
  /** subscriptions.list - Get user subscriptions */
  SUBSCRIPTIONS_LIST: 1,
  /** search.list - Search for channels/videos (expensive!) */
  SEARCH_LIST: 100,
  /** videos.list - Get video details */
  VIDEOS_LIST: 1,
} as const;

// ============================================================================
// Custom Error
// ============================================================================

/**
 * Error thrown when YouTube API quota is exhausted
 *
 * Use this to signal to callers that they should stop making API calls
 * and potentially notify the user.
 */
export class QuotaExhaustedError extends Error {
  /** Whether the error is due to critical threshold (vs. actual exhaustion) */
  readonly isCriticalThreshold: boolean;
  /** Current quota status at time of error */
  readonly status: QuotaStatus;

  constructor(message: string, status: QuotaStatus, isCriticalThreshold = false) {
    super(message);
    this.name = 'QuotaExhaustedError';
    this.status = status;
    this.isCriticalThreshold = isCriticalThreshold;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get the current date string in Pacific Time (YYYY-MM-DD format)
 *
 * YouTube's quota resets at midnight Pacific Time, so we track usage
 * by Pacific Time date rather than UTC.
 *
 * @returns Date string like "2024-01-15"
 */
export function getPacificDateString(): string {
  return new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Los_Angeles',
  });
}

/**
 * Build the KV key for a given date's quota
 *
 * @param date - Pacific Time date string (YYYY-MM-DD)
 * @returns KV key like "youtube:quota:2024-01-15"
 */
function getQuotaKey(date: string): string {
  return `${QUOTA_KEY_PREFIX}${date}`;
}

/**
 * Create a default/empty quota state for today
 */
function createEmptyState(date: string): QuotaState {
  return {
    used: 0,
    date,
    lastUpdated: Date.now(),
  };
}

/**
 * Convert quota state to status with computed fields
 */
function stateToStatus(state: QuotaState): QuotaStatus {
  const percentUsed = (state.used / DAILY_QUOTA) * 100;
  return {
    used: state.used,
    remaining: Math.max(0, DAILY_QUOTA - state.used),
    percentUsed,
    isWarning: state.used / DAILY_QUOTA >= WARNING_THRESHOLD,
    isCritical: state.used / DAILY_QUOTA >= CRITICAL_THRESHOLD,
  };
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Track quota usage after making a YouTube API call
 *
 * Call this AFTER every successful YouTube API call to maintain accurate
 * quota tracking. The units consumed should match YouTube's documented costs.
 *
 * @param units - Number of quota units consumed by the API call
 * @param kv - KV namespace for persistence
 * @returns Updated quota status
 *
 * @example
 * ```typescript
 * // After fetching videos
 * const response = await client.api.playlistItems.list({ ... });
 * const status = await trackQuotaUsage(YOUTUBE_QUOTA_COSTS.PLAYLIST_ITEMS_LIST, env.OAUTH_STATE_KV);
 *
 * if (status.isWarning) {
 *   console.warn('YouTube quota warning level reached');
 * }
 * ```
 */
export async function trackQuotaUsage(units: number, kv: KVNamespace): Promise<QuotaStatus> {
  const today = getPacificDateString();
  const key = getQuotaKey(today);

  // Get current state
  const stateJson = await kv.get(key);
  const state: QuotaState = stateJson ? JSON.parse(stateJson) : createEmptyState(today);

  // Handle day rollover (if cached state is from a previous day)
  if (state.date !== today) {
    state.used = 0;
    state.date = today;
  }

  // Update usage
  state.used += units;
  state.lastUpdated = Date.now();

  // Persist with TTL (2 days to handle timezone edge cases safely)
  await kv.put(key, JSON.stringify(state), { expirationTtl: QUOTA_TTL_SECONDS });

  return stateToStatus(state);
}

/**
 * Get the current quota status without modifying it
 *
 * Use this to check quota levels before making decisions about
 * whether to proceed with API calls.
 *
 * @param kv - KV namespace for persistence
 * @returns Current quota status
 *
 * @example
 * ```typescript
 * const status = await getQuotaStatus(env.OAUTH_STATE_KV);
 * console.log(`Used ${status.percentUsed.toFixed(1)}% of daily quota`);
 *
 * if (status.isCritical) {
 *   // Skip non-essential operations
 * }
 * ```
 */
export async function getQuotaStatus(kv: KVNamespace): Promise<QuotaStatus> {
  const today = getPacificDateString();
  const key = getQuotaKey(today);

  const stateJson = await kv.get(key);
  const state: QuotaState = stateJson ? JSON.parse(stateJson) : createEmptyState(today);

  // Handle day rollover
  if (state.date !== today) {
    return stateToStatus(createEmptyState(today));
  }

  return stateToStatus(state);
}

/**
 * Check if an operation can proceed given current quota usage
 *
 * Call this BEFORE making a YouTube API call to prevent exceeding quota.
 * This implements graceful degradation:
 * - At critical threshold (95%+): Only essential operations (≤2 units) allowed
 * - At quota limit: All operations blocked
 *
 * @param estimatedUnits - Expected quota cost of the operation
 * @param kv - KV namespace for persistence
 * @returns Object indicating if operation is allowed, with reason if not
 *
 * @example
 * ```typescript
 * // Before making a search call (expensive!)
 * const check = await canUseQuota(YOUTUBE_QUOTA_COSTS.SEARCH_LIST, env.OAUTH_STATE_KV);
 * if (!check.allowed) {
 *   console.warn(`Search blocked: ${check.reason}`);
 *   return { results: [], quotaBlocked: true };
 * }
 *
 * const response = await client.api.search.list({ ... });
 * await trackQuotaUsage(YOUTUBE_QUOTA_COSTS.SEARCH_LIST, env.OAUTH_STATE_KV);
 * ```
 */
export async function canUseQuota(
  estimatedUnits: number,
  kv: KVNamespace
): Promise<QuotaCheckResult> {
  const status = await getQuotaStatus(kv);
  const projectedUsage = status.used + estimatedUnits;

  // Block if would exceed daily quota
  if (projectedUsage > DAILY_QUOTA) {
    return {
      allowed: false,
      reason: `Would exceed daily quota (used: ${status.used}, requested: ${estimatedUnits}, limit: ${DAILY_QUOTA})`,
    };
  }

  // At critical threshold, only allow essential operations (≤2 units)
  // This preserves quota for basic polling operations while blocking expensive searches
  if (status.isCritical && estimatedUnits > 2) {
    return {
      allowed: false,
      reason: `Critical quota level (${status.percentUsed.toFixed(1)}%), only essential operations (≤2 units) allowed`,
    };
  }

  return { allowed: true };
}

/**
 * Log current quota metrics for monitoring
 *
 * Call this periodically (e.g., at the start of polling batches) to
 * emit quota metrics for monitoring and alerting.
 *
 * @param kv - KV namespace for persistence
 *
 * @example
 * ```typescript
 * // At the start of cron job
 * await logQuotaMetrics(env.OAUTH_STATE_KV);
 * ```
 */
export async function logQuotaMetrics(kv: KVNamespace): Promise<void> {
  const status = await getQuotaStatus(kv);

  console.log(
    `YouTube Quota: ${status.used}/${DAILY_QUOTA} (${status.percentUsed.toFixed(1)}%) | ` +
      `Remaining: ${status.remaining}`
  );

  if (status.isCritical) {
    console.error(
      `[CRITICAL] YouTube quota at ${status.percentUsed.toFixed(1)}%! ` +
        `Only essential operations allowed. Quota resets at midnight Pacific.`
    );
  } else if (status.isWarning) {
    console.warn(
      `[WARNING] YouTube quota at ${status.percentUsed.toFixed(1)}%. ` +
        `Consider reducing polling frequency.`
    );
  }
}

/**
 * Assert that quota is available, throwing if not
 *
 * Convenience function that combines canUseQuota check with throwing
 * a QuotaExhaustedError if the operation is not allowed.
 *
 * @param estimatedUnits - Expected quota cost
 * @param kv - KV namespace
 * @throws QuotaExhaustedError if operation not allowed
 *
 * @example
 * ```typescript
 * try {
 *   await assertQuotaAvailable(YOUTUBE_QUOTA_COSTS.SEARCH_LIST, env.OAUTH_STATE_KV);
 *   const response = await client.api.search.list({ ... });
 *   await trackQuotaUsage(YOUTUBE_QUOTA_COSTS.SEARCH_LIST, env.OAUTH_STATE_KV);
 * } catch (err) {
 *   if (err instanceof QuotaExhaustedError) {
 *     // Handle quota exhaustion gracefully
 *   }
 *   throw err;
 * }
 * ```
 */
export async function assertQuotaAvailable(estimatedUnits: number, kv: KVNamespace): Promise<void> {
  const check = await canUseQuota(estimatedUnits, kv);

  if (!check.allowed) {
    const status = await getQuotaStatus(kv);
    throw new QuotaExhaustedError(check.reason!, status, status.isCritical);
  }
}

// ============================================================================
// Integration Helpers
// ============================================================================

/**
 * Wrapper for YouTube API calls with automatic quota tracking
 *
 * Use this to wrap API calls for automatic pre-check and post-tracking.
 *
 * @param units - Quota cost of the operation
 * @param kv - KV namespace
 * @param operation - Async function performing the API call
 * @returns Result of the operation
 * @throws QuotaExhaustedError if quota check fails
 *
 * @example
 * ```typescript
 * const videos = await withQuotaTracking(
 *   YOUTUBE_QUOTA_COSTS.PLAYLIST_ITEMS_LIST,
 *   env.OAUTH_STATE_KV,
 *   () => client.api.playlistItems.list({ ... })
 * );
 * ```
 */
export async function withQuotaTracking<T>(
  units: number,
  kv: KVNamespace,
  operation: () => Promise<T>
): Promise<T> {
  // Pre-check
  await assertQuotaAvailable(units, kv);

  // Execute operation
  const result = await operation();

  // Track usage
  await trackQuotaUsage(units, kv);

  return result;
}

/**
 * Get remaining quota capacity for planning batch operations
 *
 * Useful when deciding how many subscriptions to poll in a batch.
 *
 * @param kv - KV namespace
 * @returns Number of 1-unit operations that can be performed
 *
 * @example
 * ```typescript
 * const capacity = await getRemainingCapacity(env.OAUTH_STATE_KV);
 * const batchSize = Math.min(subscriptions.length, Math.floor(capacity / 2));
 * // Each subscription poll typically costs 2 units (channel lookup + playlist fetch)
 * ```
 */
export async function getRemainingCapacity(kv: KVNamespace): Promise<number> {
  const status = await getQuotaStatus(kv);

  // At critical threshold, report 0 capacity for non-essential work
  if (status.isCritical) {
    return 0;
  }

  return status.remaining;
}

/**
 * Check if we should skip batch processing due to quota constraints
 *
 * Use at the start of polling batches to decide whether to proceed.
 *
 * @param kv - KV namespace
 * @returns Object with skip decision and reason
 *
 * @example
 * ```typescript
 * const { shouldSkip, reason, status } = await shouldSkipBatchProcessing(env.OAUTH_STATE_KV);
 * if (shouldSkip) {
 *   console.warn(`Skipping YouTube batch: ${reason}`);
 *   return { processed: 0, skipped: subscriptions.length };
 * }
 * ```
 */
export async function shouldSkipBatchProcessing(
  kv: KVNamespace
): Promise<{ shouldSkip: boolean; reason?: string; status: QuotaStatus }> {
  const status = await getQuotaStatus(kv);

  if (status.isCritical) {
    return {
      shouldSkip: true,
      reason: `Quota critical (${status.percentUsed.toFixed(1)}%), skipping batch processing`,
      status,
    };
  }

  return { shouldSkip: false, status };
}

/**
 * Calculate the maximum safe batch size given current quota
 *
 * @param unitsPerItem - Quota units consumed per subscription (typically 2)
 * @param requestedSize - Desired batch size
 * @param kv - KV namespace
 * @returns Safe batch size (may be 0 if quota critical)
 *
 * @example
 * ```typescript
 * const safeBatchSize = await calculateSafeBatchSize(2, 50, env.OAUTH_STATE_KV);
 * const batch = subscriptions.slice(0, safeBatchSize);
 * ```
 */
export async function calculateSafeBatchSize(
  unitsPerItem: number,
  requestedSize: number,
  kv: KVNamespace
): Promise<number> {
  const status = await getQuotaStatus(kv);

  // At critical threshold, don't process batches
  if (status.isCritical) {
    return 0;
  }

  // At warning threshold, limit batch size to preserve quota
  if (status.isWarning) {
    const maxItems = Math.floor((status.remaining * 0.1) / unitsPerItem); // Use only 10% of remaining
    return Math.min(requestedSize, maxItems, 10); // Cap at 10 during warning
  }

  // Normal operation: ensure we don't exceed remaining quota
  const maxItems = Math.floor(status.remaining / unitsPerItem);
  return Math.min(requestedSize, maxItems);
}
