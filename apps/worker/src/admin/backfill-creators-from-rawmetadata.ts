/**
 * Backfill Creators from Item rawMetadata
 *
 * Creates creator records by parsing rawMetadata from existing items that were
 * not created from subscriptions. This handles items that were ingested before
 * creator tracking was implemented.
 *
 * ## Field Mapping by Provider
 *
 * | Provider | rawMetadata Path | Creator Field |
 * |----------|------------------|---------------|
 * | YOUTUBE | snippet.channelId | providerCreatorId |
 * | YOUTUBE | snippet.channelTitle | name |
 * | SPOTIFY | show.id | providerCreatorId |
 * | SPOTIFY | show.name | name |
 * | SPOTIFY | show.images[0].url | imageUrl |
 * | X | author.id | providerCreatorId |
 * | X | author.name | name |
 * | X | author.username | handle |
 *
 * ## Notes
 * - Uses extractCreatorFromMetadata from creators.ts helper
 * - Skips items that already have creatorId set
 * - Skips items without rawMetadata
 * - Handles malformed JSON gracefully
 *
 * @module admin/backfill-creators-from-rawmetadata
 * @see zine-zknl
 */

import { isNull, eq } from 'drizzle-orm';
import { items } from '../db/schema';
import {
  findOrCreateCreator,
  extractCreatorFromMetadata,
  type DbContext,
} from '../db/helpers/creators';
import { logger } from '../lib/logger';
import type { Database } from '../db/index';

// ============================================================================
// Types
// ============================================================================

/**
 * Result for a single item backfill
 */
export interface ItemBackfillResult {
  /** Item ID */
  itemId: string;
  /** Item title (truncated) */
  itemTitle: string;
  /** Provider (YOUTUBE | SPOTIFY | X) */
  provider: string;
  /** Whether a new creator was created (false = already existed) */
  created: boolean;
  /** Creator ID (if successful) */
  creatorId?: string;
  /** Whether the item was linked to a creator */
  linked: boolean;
  /** Reason for skip if not processed */
  skipReason?: 'no_rawmetadata' | 'already_has_creator' | 'extraction_failed' | 'json_parse_error';
  /** Error message if backfill failed */
  error?: string;
}

/**
 * Result of the entire backfill operation
 */
export interface BackfillCreatorsFromRawMetadataResult {
  /** Whether this was a dry run */
  dryRun: boolean;
  /** Total items processed */
  totalProcessed: number;
  /** Number of items linked to creators */
  itemsLinked: number;
  /** Number of new creators created */
  creatorsCreated: number;
  /** Number of creators that already existed */
  creatorsExisted: number;
  /** Number of items skipped */
  skipped: number;
  /** Number of errors */
  errorCount: number;
  /** Details for each item */
  results: ItemBackfillResult[];
  /** Summary by provider */
  byProvider: Record<
    string,
    {
      processed: number;
      linked: number;
      created: number;
      existed: number;
      skipped: number;
      errors: number;
    }
  >;
}

// ============================================================================
// Constants
// ============================================================================

const backfillLogger = logger.child('admin:backfill-creators-rawmetadata');

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Backfill creator records from item rawMetadata
 *
 * Iterates through all items without creatorId and extracts creator info
 * from their rawMetadata. Uses findOrCreateCreator helper to create creators
 * and links items to them.
 *
 * @param db - Drizzle D1 database instance
 * @param options - Backfill options
 * @returns Backfill operation result
 */
export async function backfillCreatorsFromRawMetadata(
  db: Database,
  options?: {
    /** If true, only report what would be done without making changes */
    dryRun?: boolean;
    /** Filter by provider (YOUTUBE | SPOTIFY | X) */
    provider?: string;
    /** Limit number of items to process (for testing) */
    limit?: number;
  }
): Promise<BackfillCreatorsFromRawMetadataResult> {
  const dryRun = options?.dryRun ?? true;

  backfillLogger.info('Starting creator backfill from rawMetadata', {
    dryRun,
    provider: options?.provider,
    limit: options?.limit,
  });

  // Get all items without creatorId that have rawMetadata
  const allItems = await db
    .select({
      id: items.id,
      title: items.title,
      provider: items.provider,
      rawMetadata: items.rawMetadata,
      creatorId: items.creatorId,
    })
    .from(items)
    .where(isNull(items.creatorId));

  // Apply filters in memory (D1 compatibility)
  let filteredItems = allItems;
  if (options?.provider) {
    filteredItems = filteredItems.filter((i) => i.provider === options.provider);
  }
  if (options?.limit && options.limit > 0) {
    filteredItems = filteredItems.slice(0, options.limit);
  }

  backfillLogger.info('Found items to process', {
    total: allItems.length,
    filtered: filteredItems.length,
  });

  const results: ItemBackfillResult[] = [];
  const byProvider: Record<
    string,
    {
      processed: number;
      linked: number;
      created: number;
      existed: number;
      skipped: number;
      errors: number;
    }
  > = {};
  let itemsLinked = 0;
  let creatorsCreated = 0;
  let creatorsExisted = 0;
  let skipped = 0;
  let errorCount = 0;

  // Create db context for findOrCreateCreator
  const ctx: DbContext = { db };

  for (const item of filteredItems) {
    // Initialize provider stats
    if (!byProvider[item.provider]) {
      byProvider[item.provider] = {
        processed: 0,
        linked: 0,
        created: 0,
        existed: 0,
        skipped: 0,
        errors: 0,
      };
    }
    byProvider[item.provider].processed++;

    const truncatedTitle =
      item.title.length > 50 ? `${item.title.substring(0, 47)}...` : item.title;

    // Skip items that already have a creator (shouldn't happen due to query, but defensive)
    if (item.creatorId) {
      results.push({
        itemId: item.id,
        itemTitle: truncatedTitle,
        provider: item.provider,
        created: false,
        linked: false,
        skipReason: 'already_has_creator',
      });
      skipped++;
      byProvider[item.provider].skipped++;
      continue;
    }

    // Skip items without rawMetadata
    if (!item.rawMetadata) {
      results.push({
        itemId: item.id,
        itemTitle: truncatedTitle,
        provider: item.provider,
        created: false,
        linked: false,
        skipReason: 'no_rawmetadata',
      });
      skipped++;
      byProvider[item.provider].skipped++;
      continue;
    }

    // Parse rawMetadata
    let metadata: unknown;
    try {
      metadata = JSON.parse(item.rawMetadata);
    } catch (parseError) {
      results.push({
        itemId: item.id,
        itemTitle: truncatedTitle,
        provider: item.provider,
        created: false,
        linked: false,
        skipReason: 'json_parse_error',
        error: parseError instanceof Error ? parseError.message : 'Failed to parse JSON',
      });
      skipped++;
      byProvider[item.provider].skipped++;
      backfillLogger.warn('Failed to parse rawMetadata JSON', {
        itemId: item.id,
        provider: item.provider,
        error: parseError,
      });
      continue;
    }

    // Extract creator info from metadata
    const creatorParams = extractCreatorFromMetadata(item.provider, metadata);

    if (!creatorParams) {
      results.push({
        itemId: item.id,
        itemTitle: truncatedTitle,
        provider: item.provider,
        created: false,
        linked: false,
        skipReason: 'extraction_failed',
      });
      skipped++;
      byProvider[item.provider].skipped++;
      backfillLogger.debug('Could not extract creator from metadata', {
        itemId: item.id,
        provider: item.provider,
      });
      continue;
    }

    if (dryRun) {
      // In dry run, check if creator exists but don't create/link
      const existing = await ctx.db.query.creators.findFirst({
        where: (creators, { eq, and }) =>
          and(
            eq(creators.provider, creatorParams.provider),
            eq(creators.providerCreatorId, creatorParams.providerCreatorId)
          ),
      });

      const wouldCreate = !existing;

      results.push({
        itemId: item.id,
        itemTitle: truncatedTitle,
        provider: item.provider,
        created: wouldCreate,
        creatorId: existing?.id ?? '(would create)',
        linked: true,
      });

      itemsLinked++;
      byProvider[item.provider].linked++;
      if (wouldCreate) {
        creatorsCreated++;
        byProvider[item.provider].created++;
      } else {
        creatorsExisted++;
        byProvider[item.provider].existed++;
      }

      backfillLogger.debug('Dry run: would link item to creator', {
        itemId: item.id,
        provider: item.provider,
        creatorName: creatorParams.name,
        wouldCreate,
      });
    } else {
      // Actually create/find creator and link item
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

        // Link item to creator
        await db.update(items).set({ creatorId: creator.id }).where(eq(items.id, item.id));

        results.push({
          itemId: item.id,
          itemTitle: truncatedTitle,
          provider: item.provider,
          created: wasCreated,
          creatorId: creator.id,
          linked: true,
        });

        itemsLinked++;
        byProvider[item.provider].linked++;
        if (wasCreated) {
          creatorsCreated++;
          byProvider[item.provider].created++;
          backfillLogger.info('Created creator and linked item', {
            itemId: item.id,
            creatorId: creator.id,
            creatorName: creatorParams.name,
            provider: item.provider,
          });
        } else {
          creatorsExisted++;
          byProvider[item.provider].existed++;
          backfillLogger.debug('Linked item to existing creator', {
            itemId: item.id,
            creatorId: creator.id,
            provider: item.provider,
          });
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        errorCount++;
        byProvider[item.provider].errors++;

        results.push({
          itemId: item.id,
          itemTitle: truncatedTitle,
          provider: item.provider,
          created: false,
          linked: false,
          error: errorMsg,
        });

        backfillLogger.error('Failed to create/link creator for item', {
          itemId: item.id,
          provider: item.provider,
          error: err,
        });
      }
    }
  }

  const result: BackfillCreatorsFromRawMetadataResult = {
    dryRun,
    totalProcessed: filteredItems.length,
    itemsLinked,
    creatorsCreated,
    creatorsExisted,
    skipped,
    errorCount,
    results,
    byProvider,
  };

  backfillLogger.info('Backfill from rawMetadata complete', {
    dryRun,
    totalProcessed: result.totalProcessed,
    itemsLinked: result.itemsLinked,
    creatorsCreated: result.creatorsCreated,
    creatorsExisted: result.creatorsExisted,
    skipped: result.skipped,
    errorCount: result.errorCount,
    byProvider: result.byProvider,
  });

  return result;
}

/**
 * Generate a human-readable report of the backfill results
 *
 * @param result - Output from backfillCreatorsFromRawMetadata
 * @returns Formatted report string
 */
export function generateBackfillReport(result: BackfillCreatorsFromRawMetadataResult): string {
  const lines: string[] = [
    '=== CREATOR BACKFILL FROM RAWMETADATA REPORT ===',
    '',
    `Mode: ${result.dryRun ? 'DRY RUN' : 'EXECUTED'}`,
    '',
    '--- Summary ---',
    `Total items processed: ${result.totalProcessed}`,
    `Items linked to creators: ${result.itemsLinked}`,
    `New creators created: ${result.creatorsCreated}`,
    `Creators already existed: ${result.creatorsExisted}`,
    `Skipped: ${result.skipped}`,
    `Errors: ${result.errorCount}`,
    '',
    '--- By Provider ---',
  ];

  for (const [provider, stats] of Object.entries(result.byProvider)) {
    lines.push(`${provider}:`);
    lines.push(`  Processed: ${stats.processed}`);
    lines.push(`  Linked: ${stats.linked}`);
    lines.push(`  Created: ${stats.created}`);
    lines.push(`  Existed: ${stats.existed}`);
    lines.push(`  Skipped: ${stats.skipped}`);
    lines.push(`  Errors: ${stats.errors}`);
  }

  // Group skipped items by reason
  const skipReasons: Record<string, number> = {};
  for (const r of result.results.filter((r) => r.skipReason)) {
    skipReasons[r.skipReason!] = (skipReasons[r.skipReason!] || 0) + 1;
  }

  if (Object.keys(skipReasons).length > 0) {
    lines.push('');
    lines.push('--- Skip Reasons ---');
    for (const [reason, count] of Object.entries(skipReasons)) {
      lines.push(`${reason}: ${count}`);
    }
  }

  if (result.errorCount > 0) {
    lines.push('');
    lines.push('--- Errors ---');
    for (const r of result.results.filter((r) => r.error && !r.skipReason)) {
      lines.push(`${r.itemTitle} (${r.provider}): ${r.error}`);
    }
  }

  return lines.join('\n');
}
