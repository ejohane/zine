/**
 * Backfill Synthetic Creators for RSS, WEB, SUBSTACK Items
 *
 * Creates synthetic creator records for items that don't have provider-specific
 * creator IDs. These providers (RSS, WEB, SUBSTACK) typically don't have native
 * creator IDs in their data, so we generate synthetic IDs using a hash of
 * (provider, normalizedName).
 *
 * ## Synthetic ID Generation
 *
 * Uses SHA-256 hash of `{provider}:{normalizedName}` truncated to 32 chars.
 * This ensures:
 * - "Netflix" → hash of "rss:netflix" → consistent ID
 * - "netflix" → hash of "rss:netflix" → same ID (deduplication)
 * - Different spellings won't auto-merge (acceptable tradeoff)
 *
 * ## Deduplication Strategy
 *
 * Items are grouped by (provider, normalizedCreatorName) before processing.
 * All items in a group get linked to the same creator, ensuring consistent
 * attribution even if the same creator appears across multiple items.
 *
 * ## Edge Cases
 *
 * 1. **No creator name**: Items with null/empty creator field are skipped
 * 2. **Name variations**: "The New York Times" vs "New York Times" create separate creators
 * 3. **Existing creatorId**: Items already linked are skipped
 *
 * @module admin/backfill-synthetic-creators
 * @see zine-5e45
 */

import { isNull, isNotNull, inArray, and } from 'drizzle-orm';
import { items } from '../db/schema';
import {
  findOrCreateCreator,
  generateSyntheticCreatorId,
  normalizeCreatorName,
  type DbContext,
} from '../db/helpers/creators';
import { logger } from '../lib/logger';
import type { Database } from '../db/index';

// ============================================================================
// Types
// ============================================================================

/**
 * Providers that require synthetic creator IDs
 */
export const SYNTHETIC_PROVIDERS = ['RSS', 'WEB', 'SUBSTACK'] as const;
export type SyntheticProvider = (typeof SYNTHETIC_PROVIDERS)[number];

/**
 * Result for a single item backfill
 */
export interface ItemBackfillResult {
  /** Item ID */
  itemId: string;
  /** Item title (truncated) */
  itemTitle: string;
  /** Provider (RSS | WEB | SUBSTACK) */
  provider: string;
  /** Whether a new creator was created (false = already existed) */
  created: boolean;
  /** Creator ID (if successful) */
  creatorId?: string;
  /** Whether the item was linked to a creator */
  linked: boolean;
  /** Reason for skip if not processed */
  skipReason?: 'no_creator_name' | 'already_has_creator' | 'empty_creator_name';
  /** Error message if backfill failed */
  error?: string;
}

/**
 * Result for a creator group (all items with same provider + normalized name)
 */
export interface CreatorGroupResult {
  /** Provider */
  provider: string;
  /** Original creator name (first item's creator field) */
  displayName: string;
  /** Normalized name used for dedup */
  normalizedName: string;
  /** Generated synthetic ID */
  syntheticId: string;
  /** Whether the creator was newly created */
  created: boolean;
  /** Creator ID (internal ULID) */
  creatorId: string;
  /** Number of items linked to this creator */
  itemCount: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Result of the entire backfill operation
 */
export interface BackfillSyntheticCreatorsResult {
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
  /** Details for each creator group */
  creatorGroups: CreatorGroupResult[];
  /** Details for each item (only if includeItemDetails is true) */
  itemResults?: ItemBackfillResult[];
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
      uniqueCreators: number;
    }
  >;
}

// ============================================================================
// Constants
// ============================================================================

const backfillLogger = logger.child('admin:backfill-synthetic-creators');

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Group items by (provider, normalizedCreatorName)
 */
function groupItemsByCreator<T extends { provider: string; creator: string }>(
  items: T[]
): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const normalizedName = normalizeCreatorName(item.creator);
    const key = `${item.provider}:${normalizedName}`;

    const existing = groups.get(key);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  return groups;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Backfill synthetic creator records for RSS, WEB, SUBSTACK items
 *
 * Iterates through items without creatorId from supported providers,
 * groups them by normalized creator name, creates synthetic creators,
 * and links all items in each group to their creator.
 *
 * @param db - Drizzle D1 database instance
 * @param options - Backfill options
 * @returns Backfill operation result
 */
export async function backfillSyntheticCreators(
  db: Database,
  options?: {
    /** If true, only report what would be done without making changes */
    dryRun?: boolean;
    /** Filter by provider (RSS | WEB | SUBSTACK) */
    provider?: SyntheticProvider;
    /** Limit number of items to process (for testing) */
    limit?: number;
    /** Include individual item results (can be large) */
    includeItemDetails?: boolean;
  }
): Promise<BackfillSyntheticCreatorsResult> {
  const dryRun = options?.dryRun ?? true;
  const includeItemDetails = options?.includeItemDetails ?? false;

  backfillLogger.info('Starting synthetic creator backfill', {
    dryRun,
    provider: options?.provider,
    limit: options?.limit,
  });

  // Get items without creatorId that have a creator name, from supported providers
  const targetProviders = options?.provider ? [options.provider] : [...SYNTHETIC_PROVIDERS];

  const allItems = await db
    .select({
      id: items.id,
      title: items.title,
      provider: items.provider,
      creator: items.creator,
      creatorId: items.creatorId,
    })
    .from(items)
    .where(
      and(
        isNull(items.creatorId),
        isNotNull(items.creator),
        inArray(items.provider, targetProviders)
      )
    );

  // Filter out items with empty creator names and apply limit
  let filteredItems = allItems.filter((item) => item.creator && item.creator.trim().length > 0);

  if (options?.limit && options.limit > 0) {
    filteredItems = filteredItems.slice(0, options.limit);
  }

  backfillLogger.info('Found items to process', {
    total: allItems.length,
    afterEmptyFilter: filteredItems.length,
    afterLimit: filteredItems.length,
  });

  // Initialize tracking
  const creatorGroups: CreatorGroupResult[] = [];
  const itemResults: ItemBackfillResult[] = [];
  const byProvider: Record<
    string,
    {
      processed: number;
      linked: number;
      created: number;
      existed: number;
      skipped: number;
      errors: number;
      uniqueCreators: number;
    }
  > = {};
  let itemsLinked = 0;
  let creatorsCreated = 0;
  let creatorsExisted = 0;
  let skipped = 0;
  let errorCount = 0;

  // Track skipped items (empty creator names from initial query)
  const skippedEmpty = allItems.filter((item) => !item.creator || item.creator.trim().length === 0);
  for (const item of skippedEmpty) {
    if (includeItemDetails) {
      const truncatedTitle =
        item.title.length > 50 ? `${item.title.substring(0, 47)}...` : item.title;
      itemResults.push({
        itemId: item.id,
        itemTitle: truncatedTitle,
        provider: item.provider,
        created: false,
        linked: false,
        skipReason: item.creator === null ? 'no_creator_name' : 'empty_creator_name',
      });
    }

    if (!byProvider[item.provider]) {
      byProvider[item.provider] = {
        processed: 0,
        linked: 0,
        created: 0,
        existed: 0,
        skipped: 0,
        errors: 0,
        uniqueCreators: 0,
      };
    }
    byProvider[item.provider].skipped++;
    skipped++;
  }

  // Group items by (provider, normalizedCreatorName)
  const groupedItems = groupItemsByCreator(filteredItems);

  backfillLogger.info('Grouped items by creator', {
    uniqueCreators: groupedItems.size,
  });

  // Create db context for findOrCreateCreator
  const ctx: DbContext = { db };

  // Process each creator group
  for (const [key, itemGroup] of groupedItems) {
    const [provider, normalizedName] = [key.split(':')[0], key.substring(key.indexOf(':') + 1)];
    const displayName = itemGroup[0].creator.trim(); // Use first item's name (trimmed) as display
    const syntheticId = generateSyntheticCreatorId(provider, displayName);

    // Initialize provider stats
    if (!byProvider[provider]) {
      byProvider[provider] = {
        processed: 0,
        linked: 0,
        created: 0,
        existed: 0,
        skipped: 0,
        errors: 0,
        uniqueCreators: 0,
      };
    }
    byProvider[provider].processed += itemGroup.length;
    byProvider[provider].uniqueCreators++;

    if (dryRun) {
      // Check if creator exists without making changes
      const existing = await ctx.db.query.creators.findFirst({
        where: (creators, { eq, and }) =>
          and(eq(creators.provider, provider), eq(creators.providerCreatorId, syntheticId)),
      });

      const wouldCreate = !existing;

      creatorGroups.push({
        provider,
        displayName,
        normalizedName,
        syntheticId,
        created: wouldCreate,
        creatorId: existing?.id ?? '(would create)',
        itemCount: itemGroup.length,
      });

      if (wouldCreate) {
        creatorsCreated++;
        byProvider[provider].created++;
      } else {
        creatorsExisted++;
        byProvider[provider].existed++;
      }

      itemsLinked += itemGroup.length;
      byProvider[provider].linked += itemGroup.length;

      // Track individual items if requested
      if (includeItemDetails) {
        for (const item of itemGroup) {
          const truncatedTitle =
            item.title.length > 50 ? `${item.title.substring(0, 47)}...` : item.title;
          itemResults.push({
            itemId: item.id,
            itemTitle: truncatedTitle,
            provider: item.provider,
            created: wouldCreate,
            creatorId: existing?.id ?? '(would create)',
            linked: true,
          });
        }
      }

      backfillLogger.debug('Dry run: would create/link creator group', {
        provider,
        displayName,
        normalizedName,
        syntheticId,
        wouldCreate,
        itemCount: itemGroup.length,
      });
    } else {
      // Actually create/find creator and link items
      try {
        // Check if creator already exists
        const existingBefore = await ctx.db.query.creators.findFirst({
          where: (creators, { eq, and }) =>
            and(eq(creators.provider, provider), eq(creators.providerCreatorId, syntheticId)),
        });

        const creator = await findOrCreateCreator(ctx, {
          provider,
          providerCreatorId: syntheticId,
          name: displayName,
        });
        const wasCreated = !existingBefore;

        // Link all items in group to this creator
        const itemIds = itemGroup.map((item) => item.id);
        await db.update(items).set({ creatorId: creator.id }).where(inArray(items.id, itemIds));

        creatorGroups.push({
          provider,
          displayName,
          normalizedName,
          syntheticId,
          created: wasCreated,
          creatorId: creator.id,
          itemCount: itemGroup.length,
        });

        if (wasCreated) {
          creatorsCreated++;
          byProvider[provider].created++;
          backfillLogger.info('Created synthetic creator and linked items', {
            provider,
            displayName,
            creatorId: creator.id,
            syntheticId,
            itemCount: itemGroup.length,
          });
        } else {
          creatorsExisted++;
          byProvider[provider].existed++;
          backfillLogger.debug('Linked items to existing synthetic creator', {
            provider,
            displayName,
            creatorId: creator.id,
            itemCount: itemGroup.length,
          });
        }

        itemsLinked += itemGroup.length;
        byProvider[provider].linked += itemGroup.length;

        // Track individual items if requested
        if (includeItemDetails) {
          for (const item of itemGroup) {
            const truncatedTitle =
              item.title.length > 50 ? `${item.title.substring(0, 47)}...` : item.title;
            itemResults.push({
              itemId: item.id,
              itemTitle: truncatedTitle,
              provider: item.provider,
              created: wasCreated,
              creatorId: creator.id,
              linked: true,
            });
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        errorCount++;
        byProvider[provider].errors++;

        creatorGroups.push({
          provider,
          displayName,
          normalizedName,
          syntheticId,
          created: false,
          creatorId: '',
          itemCount: itemGroup.length,
          error: errorMsg,
        });

        // Track individual items as errored if requested
        if (includeItemDetails) {
          for (const item of itemGroup) {
            const truncatedTitle =
              item.title.length > 50 ? `${item.title.substring(0, 47)}...` : item.title;
            itemResults.push({
              itemId: item.id,
              itemTitle: truncatedTitle,
              provider: item.provider,
              created: false,
              linked: false,
              error: errorMsg,
            });
          }
        }

        backfillLogger.error('Failed to create/link synthetic creator', {
          provider,
          displayName,
          syntheticId,
          itemCount: itemGroup.length,
          error: err,
        });
      }
    }
  }

  const result: BackfillSyntheticCreatorsResult = {
    dryRun,
    totalProcessed: filteredItems.length + skippedEmpty.length,
    itemsLinked,
    creatorsCreated,
    creatorsExisted,
    skipped,
    errorCount,
    creatorGroups,
    byProvider,
  };

  if (includeItemDetails) {
    result.itemResults = itemResults;
  }

  backfillLogger.info('Synthetic creator backfill complete', {
    dryRun,
    totalProcessed: result.totalProcessed,
    itemsLinked: result.itemsLinked,
    creatorsCreated: result.creatorsCreated,
    creatorsExisted: result.creatorsExisted,
    skipped: result.skipped,
    errorCount: result.errorCount,
    uniqueCreatorGroups: result.creatorGroups.length,
    byProvider: result.byProvider,
  });

  return result;
}

/**
 * Generate a human-readable report of the backfill results
 *
 * @param result - Output from backfillSyntheticCreators
 * @returns Formatted report string
 */
export function generateBackfillReport(result: BackfillSyntheticCreatorsResult): string {
  const lines: string[] = [
    '=== SYNTHETIC CREATOR BACKFILL REPORT ===',
    '',
    `Mode: ${result.dryRun ? 'DRY RUN' : 'EXECUTED'}`,
    '',
    '--- Summary ---',
    `Total items processed: ${result.totalProcessed}`,
    `Items linked to creators: ${result.itemsLinked}`,
    `New creators created: ${result.creatorsCreated}`,
    `Creators already existed: ${result.creatorsExisted}`,
    `Unique creator groups: ${result.creatorGroups.length}`,
    `Skipped (no/empty creator name): ${result.skipped}`,
    `Errors: ${result.errorCount}`,
    '',
    '--- By Provider ---',
  ];

  for (const [provider, stats] of Object.entries(result.byProvider)) {
    lines.push(`${provider}:`);
    lines.push(`  Processed: ${stats.processed}`);
    lines.push(`  Linked: ${stats.linked}`);
    lines.push(`  Unique Creators: ${stats.uniqueCreators}`);
    lines.push(`  Created: ${stats.created}`);
    lines.push(`  Existed: ${stats.existed}`);
    lines.push(`  Skipped: ${stats.skipped}`);
    lines.push(`  Errors: ${stats.errors}`);
  }

  // Show top creator groups by item count
  const sortedGroups = [...result.creatorGroups].sort((a, b) => b.itemCount - a.itemCount);
  const topGroups = sortedGroups.slice(0, 10);

  if (topGroups.length > 0) {
    lines.push('');
    lines.push('--- Top Creator Groups (by item count) ---');
    for (const group of topGroups) {
      const status = group.error ? `ERROR: ${group.error}` : group.created ? 'NEW' : 'EXISTS';
      lines.push(`${group.displayName} (${group.provider}): ${group.itemCount} items [${status}]`);
    }
  }

  // Show errors
  const errorGroups = result.creatorGroups.filter((g) => g.error);
  if (errorGroups.length > 0) {
    lines.push('');
    lines.push('--- Errors ---');
    for (const group of errorGroups) {
      lines.push(`${group.displayName} (${group.provider}): ${group.error}`);
    }
  }

  return lines.join('\n');
}
