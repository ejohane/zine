/**
 * Adaptive Polling Interval Adjustment
 *
 * Adjusts polling intervals based on channel publishing frequency to optimize
 * API quota usage. High-activity channels are polled more frequently, while
 * inactive channels are polled less often.
 *
 * Interval Tiers:
 * - Very active (7+ items in 7 days): 1 hour
 * - Active (1-6 items in 7 days): 4 hours
 * - Moderate (1-4 items in 30 days): 12 hours
 * - Inactive (no items in 30+ days): 24 hours
 *
 * @see /features/subscriptions/backend-spec.md - Section 3.3: Adaptive Polling Intervals
 */

import { desc, eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type * as schema from '../db/schema';
import { subscriptions, subscriptionItems } from '../db/schema';

/**
 * Database type with full schema inference
 */
type DrizzleDB = DrizzleD1Database<typeof schema>;

// ============================================================================
// Types
// ============================================================================

/**
 * Activity metrics used to calculate optimal polling interval
 */
export interface ActivityMetrics {
  /** Number of items published in the last 7 days */
  itemsLast7Days: number;
  /** Number of items published in the last 30 days */
  itemsLast30Days: number;
  /** Days since the most recent item was published (null if no items) */
  daysSinceLastItem: number | null;
}

/**
 * Subscription record shape expected by shouldAdjustInterval
 * Matches the subscriptions table schema
 */
export interface Subscription {
  id: string;
  createdAt: number; // Unix ms
  pollIntervalSeconds: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Polling interval for very active channels (7+ items/week): 1 hour */
export const INTERVAL_VERY_ACTIVE = 3600;

/** Polling interval for active channels (1-6 items/week): 4 hours */
export const INTERVAL_ACTIVE = 4 * 3600;

/** Polling interval for moderate channels (1-4 items/month): 12 hours */
export const INTERVAL_MODERATE = 12 * 3600;

/** Polling interval for inactive channels (no items in 30+ days): 24 hours */
export const INTERVAL_INACTIVE = 24 * 3600;

/** Minimum change threshold (50%) to trigger interval update */
export const MIN_CHANGE_THRESHOLD = 0.5;

/** How often to check for interval adjustments (every ~24 polls) */
export const ADJUSTMENT_POLL_FREQUENCY = 24;

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Calculate the optimal polling interval based on activity metrics
 *
 * Tier breakdown:
 * - Very active: 7+ items in last 7 days → 1 hour (3600s)
 * - Active: 1-6 items in last 7 days → 4 hours (14400s)
 * - Moderate: 1+ items in last 30 days → 12 hours (43200s)
 * - Inactive: no items in 30+ days → 24 hours (86400s)
 *
 * @param metrics - Activity metrics for the subscription
 * @returns Optimal polling interval in seconds
 *
 * @example
 * ```typescript
 * // Daily vlogger
 * calculateOptimalInterval({ itemsLast7Days: 7, itemsLast30Days: 28, daysSinceLastItem: 0 });
 * // Returns: 3600 (1 hour)
 *
 * // Monthly podcaster
 * calculateOptimalInterval({ itemsLast7Days: 0, itemsLast30Days: 2, daysSinceLastItem: 10 });
 * // Returns: 43200 (12 hours)
 *
 * // Inactive channel
 * calculateOptimalInterval({ itemsLast7Days: 0, itemsLast30Days: 0, daysSinceLastItem: 45 });
 * // Returns: 86400 (24 hours)
 * ```
 */
export function calculateOptimalInterval(metrics: ActivityMetrics): number {
  // Very active: 7+ items in last week → poll every hour
  if (metrics.itemsLast7Days >= 7) {
    return INTERVAL_VERY_ACTIVE;
  }

  // Active: at least 1 item in last week → poll every 4 hours
  if (metrics.itemsLast7Days >= 1) {
    return INTERVAL_ACTIVE;
  }

  // Moderate: at least 1 item in last 30 days → poll every 12 hours
  if (metrics.itemsLast30Days >= 1) {
    return INTERVAL_MODERATE;
  }

  // Inactive: no items in 30+ days → poll every 24 hours
  return INTERVAL_INACTIVE;
}

/**
 * Get activity metrics for a subscription by analyzing recent items
 *
 * Queries subscription_items to count items published in the last 7 and 30 days,
 * and calculates days since the most recent item.
 *
 * @param subscriptionId - The subscription ID to analyze
 * @param db - Drizzle database instance
 * @returns Activity metrics for the subscription
 *
 * @example
 * ```typescript
 * const metrics = await getActivityMetrics('01ARZ3NDEKTSV4RRFFQ69G5FAV', db);
 * // Returns: { itemsLast7Days: 3, itemsLast30Days: 12, daysSinceLastItem: 1 }
 * ```
 */
export async function getActivityMetrics(
  subscriptionId: string,
  db: DrizzleDB
): Promise<ActivityMetrics> {
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 3600 * 1000;
  const thirtyDaysAgo = now - 30 * 24 * 3600 * 1000;

  // Get items from this subscription, ordered by publish date (newest first)
  // Limit to 100 to avoid excessive queries while still getting accurate counts
  const items = await db.query.subscriptionItems.findMany({
    where: eq(subscriptionItems.subscriptionId, subscriptionId),
    columns: { publishedAt: true },
    orderBy: [desc(subscriptionItems.publishedAt)],
    limit: 100,
  });

  // Count items in each time window
  // Note: publishedAt is stored as Unix ms (integer) in subscription_items
  const itemsLast7Days = items.filter(
    (i) => i.publishedAt !== null && i.publishedAt > sevenDaysAgo
  ).length;

  const itemsLast30Days = items.filter(
    (i) => i.publishedAt !== null && i.publishedAt > thirtyDaysAgo
  ).length;

  // Calculate days since most recent item
  const latestItem = items[0];
  const daysSinceLastItem =
    latestItem?.publishedAt !== null
      ? Math.floor((now - latestItem.publishedAt!) / (24 * 3600 * 1000))
      : null;

  return { itemsLast7Days, itemsLast30Days, daysSinceLastItem };
}

/**
 * Update subscription poll interval if it has changed significantly
 *
 * Only updates the interval if the change is >= 50% to avoid frequent
 * small adjustments that could cause database churn.
 *
 * @param subscriptionId - The subscription ID to potentially update
 * @param db - Drizzle database instance
 * @returns void
 *
 * @example
 * ```typescript
 * // After a successful poll in scheduler.ts:
 * if (shouldAdjustInterval(subscription)) {
 *   await maybeUpdatePollInterval(subscription.id, db);
 * }
 * ```
 */
export async function maybeUpdatePollInterval(
  subscriptionId: string,
  db: DrizzleDB
): Promise<void> {
  // Get activity metrics and calculate optimal interval
  const metrics = await getActivityMetrics(subscriptionId, db);
  const optimalInterval = calculateOptimalInterval(metrics);

  // Get current subscription interval
  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.id, subscriptionId),
    columns: { pollIntervalSeconds: true },
  });

  if (!subscription) {
    return;
  }

  const currentInterval = subscription.pollIntervalSeconds ?? INTERVAL_ACTIVE;

  // Calculate relative change
  const change = Math.abs(optimalInterval - currentInterval) / currentInterval;

  // Only update if change is significant (50%+)
  if (change >= MIN_CHANGE_THRESHOLD) {
    await db
      .update(subscriptions)
      .set({
        pollIntervalSeconds: optimalInterval,
        updatedAt: Date.now(),
      })
      .where(eq(subscriptions.id, subscriptionId));

    console.log(
      `[adaptive-polling] Adjusted interval for ${subscriptionId}: ${currentInterval}s -> ${optimalInterval}s (${(change * 100).toFixed(0)}% change)`
    );
  }
}

/**
 * Check if it's time to adjust the polling interval for a subscription
 *
 * Adjustments happen roughly once per day to avoid excessive recalculation.
 * Uses a simple heuristic: adjust every ~24 polls based on subscription age.
 *
 * @param subscription - The subscription to check
 * @returns true if interval should be evaluated for adjustment
 *
 * @example
 * ```typescript
 * // In scheduler.ts after successful poll:
 * if (shouldAdjustInterval(subscription)) {
 *   await maybeUpdatePollInterval(subscription.id, db);
 * }
 * ```
 */
export function shouldAdjustInterval(subscription: Subscription): boolean {
  const timeSinceCreation = Date.now() - subscription.createdAt;

  // Estimate how many polls have occurred since creation
  // This is an approximation since interval can change
  const estimatedPollCount = Math.floor(
    timeSinceCreation / (subscription.pollIntervalSeconds * 1000)
  );

  // Adjust roughly every 24 polls (approximately once per day for hourly polling)
  // Returns true when poll count is a multiple of 24 (but not 0)
  return estimatedPollCount > 0 && estimatedPollCount % ADJUSTMENT_POLL_FREQUENCY === 0;
}
