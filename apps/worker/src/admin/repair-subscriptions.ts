/**
 * Subscription Data Repair Module
 *
 * Repairs corrupted subscription lastPublishedAt watermarks.
 *
 * ## Problem
 * The lastPublishedAt corruption bug (zine-ej0) caused subscriptions to have
 * watermarks ahead of their actual newest item. This prevents new episodes
 * from being ingested since they appear "already seen".
 *
 * ## Detection Logic
 * A subscription is considered corrupted if:
 * 1. It has a lastPublishedAt timestamp, AND
 * 2. Either:
 *    a. It has no items at all (watermark but nothing ingested), OR
 *    b. lastPublishedAt is more than 1 day ahead of the newest actual item
 *
 * ## Repair Strategy
 * Reset lastPublishedAt to match the newest item actually in the user's inbox.
 * If no items exist, reset to NULL to allow full backfill on next poll.
 *
 * @module admin/repair-subscriptions
 */

import { eq, sql, and } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { subscriptions, subscriptionItems, items } from '../db/schema';
import { logger } from '../lib/logger';

// ============================================================================
// Types
// ============================================================================

/**
 * A subscription with corruption detection data
 */
export interface CorruptedSubscription {
  /** Subscription ID (ULID) */
  id: string;
  /** User ID */
  userId: string;
  /** Provider channel ID (YouTube channel ID or Spotify show ID) */
  providerChannelId: string;
  /** Provider (YOUTUBE | SPOTIFY) */
  provider: string;
  /** Current lastPublishedAt watermark (Unix ms) */
  lastPublishedAt: number;
  /** Newest item's publishedAt (Unix ms), null if no items */
  newestItemAt: number | null;
  /** Gap in milliseconds between watermark and newest item */
  gapMs: number | null;
  /** Gap in days for readability */
  gapDays: number | null;
}

/**
 * Result of finding corrupted subscriptions
 */
export interface FindCorruptedResult {
  /** List of corrupted subscriptions with details */
  corrupted: CorruptedSubscription[];
  /** Total subscriptions scanned */
  totalScanned: number;
  /** Subscriptions with no watermark (healthy) */
  noWatermark: number;
  /** Subscriptions with items newer than watermark (healthy) */
  healthy: number;
}

/**
 * Result of a single subscription repair
 */
export interface RepairResult {
  /** Subscription ID */
  subscriptionId: string;
  /** Old watermark value */
  oldWatermark: number;
  /** New watermark value (null means reset for full repoll) */
  newWatermark: number | null;
  /** Whether the repair was actually executed (false in dry run) */
  executed: boolean;
}

/**
 * Result of the repair operation
 */
export interface RepairOperationResult {
  /** Whether this was a dry run */
  dryRun: boolean;
  /** Number of subscriptions that would be / were repaired */
  repairCount: number;
  /** Details of each repair */
  repairs: RepairResult[];
  /** Any errors encountered */
  errors: { subscriptionId: string; error: string }[];
}

// ============================================================================
// Constants
// ============================================================================

/** Gap threshold for considering a subscription corrupted (1 day in ms) */
const CORRUPTION_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/** Create a logger for repair operations */
const repairLogger = logger.child('admin:repair');

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Find all corrupted Spotify subscriptions
 *
 * A subscription is corrupted if:
 * 1. It has a lastPublishedAt watermark, AND
 * 2. Either has no items, or watermark is > 1 day ahead of newest item
 *
 * @param db - Drizzle D1 database instance
 * @param options - Optional filters (provider, userId)
 * @returns List of corrupted subscriptions with diagnosis info
 */
export async function findCorruptedSubscriptions(
  db: DrizzleD1Database,
  options?: {
    /** Filter by provider (default: 'SPOTIFY') */
    provider?: string;
    /** Filter to a specific user */
    userId?: string;
  }
): Promise<FindCorruptedResult> {
  const provider = options?.provider ?? 'SPOTIFY';

  repairLogger.info('Finding corrupted subscriptions', { provider, userId: options?.userId });

  // Build conditions
  const conditions = [eq(subscriptions.provider, provider)];
  if (options?.userId) {
    conditions.push(eq(subscriptions.userId, options.userId));
  }

  // Query subscriptions with their newest item timestamp
  // We join through subscriptionItems → items to get the actual publishedAt
  // Note: items.publishedAt is ISO8601 string, need to convert for comparison
  const results = await db
    .select({
      id: subscriptions.id,
      userId: subscriptions.userId,
      providerChannelId: subscriptions.providerChannelId,
      provider: subscriptions.provider,
      lastPublishedAt: subscriptions.lastPublishedAt,
      // Get newest item timestamp - items.publishedAt is ISO8601 string
      // Convert to Unix ms using strftime for SQLite
      newestItemAt: sql<number | null>`(
        SELECT MAX(strftime('%s', ${items.publishedAt}) * 1000)
        FROM ${subscriptionItems}
        INNER JOIN ${items} ON ${items.id} = ${subscriptionItems.itemId}
        WHERE ${subscriptionItems.subscriptionId} = ${subscriptions.id}
      )`.as('newestItemAt'),
    })
    .from(subscriptions)
    .where(and(...conditions));

  // Process results to identify corrupted subscriptions
  const corrupted: CorruptedSubscription[] = [];
  let noWatermark = 0;
  let healthy = 0;

  for (const sub of results) {
    // No watermark = nothing to repair
    if (sub.lastPublishedAt === null) {
      noWatermark++;
      continue;
    }

    // Has watermark - check if corrupted
    if (sub.newestItemAt === null) {
      // Has watermark but no items = definitely corrupted
      corrupted.push({
        id: sub.id,
        userId: sub.userId,
        providerChannelId: sub.providerChannelId,
        provider: sub.provider,
        lastPublishedAt: sub.lastPublishedAt,
        newestItemAt: null,
        gapMs: null,
        gapDays: null,
      });
    } else {
      // Has both watermark and items - check gap
      const gapMs = sub.lastPublishedAt - sub.newestItemAt;

      if (gapMs > CORRUPTION_THRESHOLD_MS) {
        // Watermark is significantly ahead = corrupted
        corrupted.push({
          id: sub.id,
          userId: sub.userId,
          providerChannelId: sub.providerChannelId,
          provider: sub.provider,
          lastPublishedAt: sub.lastPublishedAt,
          newestItemAt: sub.newestItemAt,
          gapMs,
          gapDays: Math.round(gapMs / (24 * 60 * 60 * 1000)),
        });
      } else {
        // Gap is acceptable
        healthy++;
      }
    }
  }

  repairLogger.info('Corruption scan complete', {
    totalScanned: results.length,
    corrupted: corrupted.length,
    noWatermark,
    healthy,
  });

  return {
    corrupted,
    totalScanned: results.length,
    noWatermark,
    healthy,
  };
}

/**
 * Generate a human-readable report of corrupted subscriptions
 *
 * @param result - Output from findCorruptedSubscriptions
 * @returns Formatted report string
 */
export function generateRepairReport(result: FindCorruptedResult): string {
  const lines: string[] = [
    '=== CORRUPTED SUBSCRIPTIONS REPORT ===',
    '',
    `Total scanned: ${result.totalScanned}`,
    `Corrupted: ${result.corrupted.length}`,
    `Healthy (no watermark): ${result.noWatermark}`,
    `Healthy (watermark ok): ${result.healthy}`,
    '',
  ];

  if (result.corrupted.length === 0) {
    lines.push('No corrupted subscriptions found.');
    return lines.join('\n');
  }

  lines.push('Corrupted Subscriptions:');
  lines.push('');

  for (const sub of result.corrupted) {
    lines.push(`Subscription: ${sub.id}`);
    lines.push(`  Name: ${sub.providerChannelId}`);
    lines.push(`  User: ${sub.userId}`);
    lines.push(`  Provider: ${sub.provider}`);
    lines.push(`  lastPublishedAt: ${new Date(sub.lastPublishedAt).toISOString()}`);
    lines.push(
      `  newestItemAt: ${sub.newestItemAt ? new Date(sub.newestItemAt).toISOString() : 'NULL (no items)'}`
    );
    lines.push(`  Gap: ${sub.gapDays !== null ? `${sub.gapDays} days` : 'N/A (no items)'}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Repair corrupted subscriptions by resetting their lastPublishedAt watermark
 *
 * For each corrupted subscription:
 * - If it has items: reset to the newest item's publishedAt
 * - If it has no items: reset to NULL for full backfill
 *
 * @param db - Drizzle D1 database instance
 * @param options - Repair options
 * @returns Repair operation result
 */
export async function repairCorruptedSubscriptions(
  db: DrizzleD1Database,
  options?: {
    /** If true, only report what would be done without making changes */
    dryRun?: boolean;
    /** Filter by provider (default: 'SPOTIFY') */
    provider?: string;
    /** Filter to a specific user */
    userId?: string;
    /** Repair only specific subscription IDs */
    subscriptionIds?: string[];
  }
): Promise<RepairOperationResult> {
  const dryRun = options?.dryRun ?? true;

  repairLogger.info('Starting subscription repair', {
    dryRun,
    provider: options?.provider,
    userId: options?.userId,
    specificIds: options?.subscriptionIds?.length,
  });

  // Find corrupted subscriptions
  const findResult = await findCorruptedSubscriptions(db, {
    provider: options?.provider,
    userId: options?.userId,
  });

  // Filter to specific IDs if provided
  let toRepair = findResult.corrupted;
  if (options?.subscriptionIds && options.subscriptionIds.length > 0) {
    const idSet = new Set(options.subscriptionIds);
    toRepair = toRepair.filter((sub) => idSet.has(sub.id));
  }

  if (toRepair.length === 0) {
    repairLogger.info('No subscriptions to repair');
    return {
      dryRun,
      repairCount: 0,
      repairs: [],
      errors: [],
    };
  }

  repairLogger.info(dryRun ? 'DRY RUN - would repair:' : 'Repairing subscriptions:', {
    count: toRepair.length,
    ids: toRepair.map((s) => s.id),
  });

  const repairs: RepairResult[] = [];
  const errors: { subscriptionId: string; error: string }[] = [];

  for (const sub of toRepair) {
    const newWatermark = sub.newestItemAt;

    if (dryRun) {
      // Dry run - just record what would happen
      repairs.push({
        subscriptionId: sub.id,
        oldWatermark: sub.lastPublishedAt,
        newWatermark,
        executed: false,
      });

      repairLogger.debug('Would repair subscription', {
        subscriptionId: sub.id,
        providerChannelId: sub.providerChannelId,
        oldWatermark: new Date(sub.lastPublishedAt).toISOString(),
        newWatermark: newWatermark ? new Date(newWatermark).toISOString() : 'NULL',
      });
    } else {
      // Execute the repair
      try {
        await db
          .update(subscriptions)
          .set({
            lastPublishedAt: newWatermark,
            updatedAt: Date.now(),
          })
          .where(eq(subscriptions.id, sub.id));

        repairs.push({
          subscriptionId: sub.id,
          oldWatermark: sub.lastPublishedAt,
          newWatermark,
          executed: true,
        });

        repairLogger.info('Repaired subscription', {
          subscriptionId: sub.id,
          providerChannelId: sub.providerChannelId,
          oldWatermark: new Date(sub.lastPublishedAt).toISOString(),
          newWatermark: newWatermark ? new Date(newWatermark).toISOString() : 'NULL',
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        errors.push({ subscriptionId: sub.id, error: errorMsg });

        repairLogger.error('Failed to repair subscription', {
          subscriptionId: sub.id,
          error: err,
        });
      }
    }
  }

  const result: RepairOperationResult = {
    dryRun,
    repairCount: repairs.length,
    repairs,
    errors,
  };

  repairLogger.info('Repair operation complete', {
    dryRun,
    repaired: repairs.length,
    errors: errors.length,
  });

  return result;
}

/**
 * Verify that repairs were successful
 *
 * Re-runs the corruption detection to confirm no corrupted subscriptions remain.
 *
 * @param db - Drizzle D1 database instance
 * @param options - Optional filters
 * @returns Verification result
 */
export async function verifyRepairs(
  db: DrizzleD1Database,
  options?: {
    provider?: string;
    userId?: string;
  }
): Promise<{ success: boolean; remainingCorrupted: number; details: CorruptedSubscription[] }> {
  const result = await findCorruptedSubscriptions(db, options);

  const success = result.corrupted.length === 0;

  repairLogger.info('Repair verification', {
    success,
    remainingCorrupted: result.corrupted.length,
  });

  return {
    success,
    remainingCorrupted: result.corrupted.length,
    details: result.corrupted,
  };
}
