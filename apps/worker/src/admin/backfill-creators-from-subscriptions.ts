/**
 * Backfill Creators from Subscriptions
 *
 * Creates creator records from existing subscriptions. The subscriptions table
 * is the cleanest data source since it has verified provider IDs from YouTube
 * and Spotify OAuth imports.
 *
 * ## Field Mapping
 * | Subscription Field | Creator Field |
 * |-------------------|---------------|
 * | providerChannelId | providerCreatorId |
 * | name | name |
 * | name.toLowerCase().trim() | normalizedName |
 * | imageUrl | imageUrl |
 * | description | description |
 * | externalUrl | externalUrl |
 * | provider | provider |
 *
 * ## Notes
 * - This backfill only creates creators, it doesn't link items
 * - Handle is not available from subscriptions (remains null)
 * - Uses findOrCreateCreator to respect unique constraints
 *
 * @module admin/backfill-creators-from-subscriptions
 * @see zine-qnck
 */

import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { subscriptions } from '../db/schema';
import { findOrCreateCreator, type DbContext, type CreatorParams } from '../db/helpers/creators';
import { logger } from '../lib/logger';
import type { Database } from '../db/index';

// ============================================================================
// Types
// ============================================================================

/**
 * Result for a single subscription backfill
 */
export interface SubscriptionBackfillResult {
  /** Subscription ID */
  subscriptionId: string;
  /** Subscription name */
  subscriptionName: string;
  /** Provider (YOUTUBE | SPOTIFY) */
  provider: string;
  /** Provider channel/show ID */
  providerChannelId: string;
  /** Whether a new creator was created (false = already existed) */
  created: boolean;
  /** Creator ID */
  creatorId: string;
  /** Error message if backfill failed */
  error?: string;
}

/**
 * Result of the entire backfill operation
 */
export interface BackfillCreatorsResult {
  /** Whether this was a dry run */
  dryRun: boolean;
  /** Total subscriptions processed */
  totalProcessed: number;
  /** Number of new creators created */
  creatorsCreated: number;
  /** Number of creators that already existed */
  creatorsExisted: number;
  /** Number of errors */
  errorCount: number;
  /** Details for each subscription */
  results: SubscriptionBackfillResult[];
  /** Summary by provider */
  byProvider: Record<
    string,
    { processed: number; created: number; existed: number; errors: number }
  >;
}

// ============================================================================
// Constants
// ============================================================================

const backfillLogger = logger.child('admin:backfill-creators');

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Backfill creator records from subscriptions
 *
 * Iterates through all subscriptions and creates corresponding creator records
 * using the findOrCreateCreator helper to respect unique constraints.
 *
 * @param db - Drizzle D1 database instance
 * @param options - Backfill options
 * @returns Backfill operation result
 */
export async function backfillCreatorsFromSubscriptions(
  db: DrizzleD1Database | Database,
  options?: {
    /** If true, only report what would be done without making changes */
    dryRun?: boolean;
    /** Filter to a specific user */
    userId?: string;
    /** Filter by provider (YOUTUBE | SPOTIFY) */
    provider?: string;
    /** Limit number of subscriptions to process (for testing) */
    limit?: number;
  }
): Promise<BackfillCreatorsResult> {
  const dryRun = options?.dryRun ?? true;

  backfillLogger.info('Starting creator backfill from subscriptions', {
    dryRun,
    userId: options?.userId,
    provider: options?.provider,
    limit: options?.limit,
  });

  // Build query
  const query = db.select().from(subscriptions).$dynamic();

  // Get all subscriptions (filters applied in-memory for simplicity with D1)
  const allSubs = await query;

  // Apply filters
  let subs = allSubs;
  if (options?.userId) {
    subs = subs.filter((s) => s.userId === options.userId);
  }
  if (options?.provider) {
    subs = subs.filter((s) => s.provider === options.provider);
  }
  if (options?.limit && options.limit > 0) {
    subs = subs.slice(0, options.limit);
  }

  backfillLogger.info('Found subscriptions to process', {
    total: allSubs.length,
    filtered: subs.length,
  });

  const results: SubscriptionBackfillResult[] = [];
  const byProvider: Record<
    string,
    { processed: number; created: number; existed: number; errors: number }
  > = {};
  let creatorsCreated = 0;
  let creatorsExisted = 0;
  let errorCount = 0;

  // Create db context for findOrCreateCreator
  const ctx: DbContext = { db: db as Database };

  for (const sub of subs) {
    // Initialize provider stats
    if (!byProvider[sub.provider]) {
      byProvider[sub.provider] = { processed: 0, created: 0, existed: 0, errors: 0 };
    }
    byProvider[sub.provider].processed++;

    const creatorParams: CreatorParams = {
      provider: sub.provider,
      providerCreatorId: sub.providerChannelId,
      name: sub.name,
      imageUrl: sub.imageUrl ?? undefined,
      description: sub.description ?? undefined,
      externalUrl: sub.externalUrl ?? undefined,
      // handle is not available from subscriptions
    };

    if (dryRun) {
      // In dry run, just check if creator exists
      const existing = await ctx.db.query.creators.findFirst({
        where: (creators, { eq, and }) =>
          and(
            eq(creators.provider, creatorParams.provider),
            eq(creators.providerCreatorId, creatorParams.providerCreatorId)
          ),
      });

      const wouldCreate = !existing;

      results.push({
        subscriptionId: sub.id,
        subscriptionName: sub.name,
        provider: sub.provider,
        providerChannelId: sub.providerChannelId,
        created: wouldCreate,
        creatorId: existing?.id ?? '(would create)',
      });

      if (wouldCreate) {
        creatorsCreated++;
        byProvider[sub.provider].created++;
      } else {
        creatorsExisted++;
        byProvider[sub.provider].existed++;
      }

      backfillLogger.debug('Dry run: would process subscription', {
        subscriptionId: sub.id,
        name: sub.name,
        provider: sub.provider,
        wouldCreate,
      });
    } else {
      // Actually create/update the creator
      try {
        // Check if creator already exists to determine if we're creating
        const existingBefore = await ctx.db.query.creators.findFirst({
          where: (creators, { eq, and }) =>
            and(
              eq(creators.provider, creatorParams.provider),
              eq(creators.providerCreatorId, creatorParams.providerCreatorId)
            ),
        });

        const creator = await findOrCreateCreator(ctx, creatorParams);
        const wasCreated = !existingBefore;

        results.push({
          subscriptionId: sub.id,
          subscriptionName: sub.name,
          provider: sub.provider,
          providerChannelId: sub.providerChannelId,
          created: wasCreated,
          creatorId: creator.id,
        });

        if (wasCreated) {
          creatorsCreated++;
          byProvider[sub.provider].created++;
          backfillLogger.info('Created creator from subscription', {
            subscriptionId: sub.id,
            subscriptionName: sub.name,
            creatorId: creator.id,
            provider: sub.provider,
          });
        } else {
          creatorsExisted++;
          byProvider[sub.provider].existed++;
          backfillLogger.debug('Creator already existed', {
            subscriptionId: sub.id,
            creatorId: creator.id,
          });
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        errorCount++;
        byProvider[sub.provider].errors++;

        results.push({
          subscriptionId: sub.id,
          subscriptionName: sub.name,
          provider: sub.provider,
          providerChannelId: sub.providerChannelId,
          created: false,
          creatorId: '',
          error: errorMsg,
        });

        backfillLogger.error('Failed to create creator from subscription', {
          subscriptionId: sub.id,
          subscriptionName: sub.name,
          provider: sub.provider,
          error: err,
        });
      }
    }
  }

  const result: BackfillCreatorsResult = {
    dryRun,
    totalProcessed: subs.length,
    creatorsCreated,
    creatorsExisted,
    errorCount,
    results,
    byProvider,
  };

  backfillLogger.info('Backfill operation complete', {
    dryRun,
    totalProcessed: result.totalProcessed,
    creatorsCreated: result.creatorsCreated,
    creatorsExisted: result.creatorsExisted,
    errorCount: result.errorCount,
    byProvider: result.byProvider,
  });

  return result;
}

/**
 * Generate a human-readable report of the backfill results
 *
 * @param result - Output from backfillCreatorsFromSubscriptions
 * @returns Formatted report string
 */
export function generateBackfillReport(result: BackfillCreatorsResult): string {
  const lines: string[] = [
    '=== CREATOR BACKFILL FROM SUBSCRIPTIONS REPORT ===',
    '',
    `Mode: ${result.dryRun ? 'DRY RUN' : 'EXECUTED'}`,
    '',
    '--- Summary ---',
    `Total subscriptions processed: ${result.totalProcessed}`,
    `Creators created: ${result.creatorsCreated}`,
    `Creators already existed: ${result.creatorsExisted}`,
    `Errors: ${result.errorCount}`,
    '',
    '--- By Provider ---',
  ];

  for (const [provider, stats] of Object.entries(result.byProvider)) {
    lines.push(`${provider}:`);
    lines.push(`  Processed: ${stats.processed}`);
    lines.push(`  Created: ${stats.created}`);
    lines.push(`  Existed: ${stats.existed}`);
    lines.push(`  Errors: ${stats.errors}`);
  }

  if (result.errorCount > 0) {
    lines.push('');
    lines.push('--- Errors ---');
    for (const r of result.results.filter((r) => r.error)) {
      lines.push(`${r.subscriptionName} (${r.provider}): ${r.error}`);
    }
  }

  return lines.join('\n');
}
