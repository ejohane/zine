import type { Provider } from '@zine/shared';

import type { Database } from '../../db';
import type { NewItem } from '../transformers';
import type { IngestResult } from './types';
import { prepareItem } from './prepare';
import { buildIngestionStatements, executeBatchStatements } from './write';

// ============================================================================
// Main Ingestion Function
// ============================================================================

/**
 * Ingest a single item from a provider into the user's inbox.
 *
 * This is the core ingestion function that handles:
 * 1. Idempotency check - skip if user has already seen this item
 * 2. Atomic transaction for all database writes
 * 3. Canonical item sharing - reuse existing items across users
 * 4. Timestamp format bridging between new and existing tables
 *
 * @typeParam T - The raw provider item type (YouTube playlist item, Spotify episode, etc.)
 * @param userId - User ID (Clerk user ID)
 * @param subscriptionId - ID of the subscription that triggered this ingestion
 * @param rawItem - Raw item data from the provider API
 * @param provider - Provider type (YOUTUBE or SPOTIFY)
 * @param db - Drizzle D1 database instance
 * @param transformFn - Function to transform raw provider data into NewItem
 * @returns IngestResult indicating whether the item was created or skipped
 *
 * @example
 * ```typescript
 * const result = await ingestItem(
 *   userId,
 *   subscriptionId,
 *   youtubePlaylistItem,
 *   Provider.YOUTUBE,
 *   db,
 *   transformYouTubeVideo
 * );
 *
 * if (result.created) {
 *   console.log(`Created item ${result.itemId} for user`);
 * } else {
 *   console.log(`Skipped: ${result.skipped}`);
 * }
 * ```
 */
export async function ingestItem<T>(
  userId: string,
  subscriptionId: string,
  rawItem: T,
  provider: Provider,
  db: Database,
  transformFn: (raw: T) => NewItem
): Promise<IngestResult> {
  const prepared = await prepareItem({
    context: { userId, provider, db },
    rawItem,
    transformFn,
    backfillOnSeen: true,
  });

  if (prepared.status === 'skipped') {
    return { created: false, skipped: prepared.reason };
  }

  const nowISO = new Date().toISOString();
  const now = Date.now();

  const statements = buildIngestionStatements(prepared.item, {
    db,
    userId,
    subscriptionId,
    provider,
    nowISO,
    now,
  });

  await executeBatchStatements(statements, db);

  return {
    created: true,
    itemId: prepared.item.canonicalItemId,
    userItemId: prepared.item.userItemId,
  };
}
