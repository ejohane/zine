import type { Provider } from '@zine/shared';

import type { Database } from '../../db';
import type { NewItem } from '../transformers';
import { serializeError } from '../../utils/error-utils';
import { storeToDLQ } from './dlq';
import { ingestItem } from './ingest';
import { prepareBatch } from './prepare';
import type { BatchIngestResult, ConsolidatedBatchIngestResult, PreparedItem } from './types';
import { buildIngestionStatements, executeBatchStatements } from './write';

// ============================================================================
// Batch Ingestion
// ============================================================================

/**
 * Default chunk size for consolidated batch inserts.
 * Each chunk is inserted in a single db.batch() call.
 * Configurable via the `chunkSize` parameter.
 */
export const DEFAULT_BATCH_CHUNK_SIZE = 10;

/**
 * Ingest multiple items from a provider in sequence.
 *
 * Processes items one by one to maintain atomicity per item.
 * If one item fails, others continue processing.
 *
 * @typeParam T - The raw provider item type
 * @param userId - User ID
 * @param subscriptionId - Subscription ID
 * @param rawItems - Array of raw items from provider
 * @param provider - Provider type
 * @param db - Database instance
 * @param transformFn - Transform function
 * @param getProviderId - Function to extract provider ID from raw item (for error reporting)
 * @returns Batch result with counts and error details
 *
 * @example
 * ```typescript
 * const result = await ingestBatch(
 *   userId,
 *   subscriptionId,
 *   youtubeVideos,
 *   Provider.YOUTUBE,
 *   db,
 *   transformYouTubeVideo,
 *   (item) => item.contentDetails?.videoId || 'unknown'
 * );
 *
 * console.log(`Created ${result.created}/${result.total} items`);
 * ```
 */
export async function ingestBatch<T>(
  userId: string,
  subscriptionId: string,
  rawItems: T[],
  provider: Provider,
  db: Database,
  transformFn: (raw: T) => NewItem,
  getProviderId: (raw: T) => string
): Promise<BatchIngestResult> {
  const result: BatchIngestResult = {
    total: rawItems.length,
    created: 0,
    skipped: 0,
    errors: 0,
    errorDetails: [],
  };

  for (const rawItem of rawItems) {
    try {
      const ingestResult = await ingestItem(
        userId,
        subscriptionId,
        rawItem,
        provider,
        db,
        transformFn
      );

      if (ingestResult.created) {
        result.created++;
      } else {
        result.skipped++;
      }
    } catch (error) {
      result.errors++;
      const providerId = getProviderId(rawItem);
      const serialized = serializeError(error);
      // Build a richer error message that includes type and context
      const errorMessage = `[${serialized.type}] ${serialized.message}`;
      result.errorDetails.push({
        providerId,
        error: errorMessage,
      });

      // Store failed item in dead-letter queue for later retry
      await storeToDLQ(db, subscriptionId, userId, provider, providerId, rawItem, error);
    }
  }

  return result;
}

// ============================================================================
// Consolidated Batch Ingestion
// ============================================================================

/**
 * Split an array into chunks of the specified size.
 */
function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Ingest multiple items in consolidated batches with chunking and fallback.
 *
 * This optimized function:
 * 1. Transforms and validates all items upfront
 * 2. Checks idempotency (skips already-seen items)
 * 3. Groups insert statements into configurable chunks
 * 4. Executes each chunk as a single db.batch() call
 * 5. Falls back to individual inserts if a chunk fails
 * 6. Stores failed items in the dead-letter queue
 *
 * Performance improvement: For 10 items with default chunk size of 10:
 * - Old: 10 separate db.batch() calls → 10 round-trips
 * - New: 1 consolidated db.batch() call → 1 round-trip (10x faster)
 *
 * @typeParam T - The raw provider item type
 * @param userId - User ID
 * @param subscriptionId - Subscription ID
 * @param rawItems - Array of raw items from provider
 * @param provider - Provider type
 * @param db - Database instance
 * @param transformFn - Transform function
 * @param getProviderId - Function to extract provider ID from raw item
 * @param chunkSize - Number of items per batch chunk (default: 10)
 * @returns ConsolidatedBatchIngestResult with counts, metrics, and error details
 *
 * @example
 * ```typescript
 * const result = await ingestBatchConsolidated(
 *   userId,
 *   subscriptionId,
 *   spotifyEpisodes,
 *   Provider.SPOTIFY,
 *   db,
 *   transformSpotifyEpisode,
 *   (item) => item.id,
 *   10 // chunk size
 * );
 *
 * console.log(`Created ${result.created}/${result.total} items in ${result.batchCount} batches`);
 * console.log(`Duration: ${result.durationMs}ms`);
 * ```
 */
export async function ingestBatchConsolidated<T>(
  userId: string,
  subscriptionId: string,
  rawItems: T[],
  provider: Provider,
  db: Database,
  transformFn: (raw: T) => NewItem,
  getProviderId: (raw: T) => string,
  chunkSize: number = DEFAULT_BATCH_CHUNK_SIZE
): Promise<ConsolidatedBatchIngestResult> {
  const startTime = Date.now();

  const result: ConsolidatedBatchIngestResult = {
    total: rawItems.length,
    created: 0,
    skipped: 0,
    errors: 0,
    errorDetails: [],
    batchCount: 0,
    fallbackCount: 0,
    durationMs: 0,
  };

  if (rawItems.length === 0) {
    result.durationMs = Date.now() - startTime;
    return result;
  }

  // Phase 1: Transform, validate, and check idempotency for all items
  const { preparedItems, skippedCount, errors, errorDetails } = await prepareBatch({
    userId,
    subscriptionId,
    rawItems,
    provider,
    db,
    transformFn,
    getProviderId,
  });

  result.skipped += skippedCount;
  result.errors += errors;
  result.errorDetails.push(...errorDetails);

  // Phase 2: Execute chunked batch inserts
  if (preparedItems.length > 0) {
    const chunks = chunk(preparedItems, chunkSize);
    result.batchCount = chunks.length;

    for (const itemChunk of chunks) {
      const chunkSuccess = await executeChunkBatch(itemChunk, userId, subscriptionId, provider, db);

      if (chunkSuccess) {
        result.created += itemChunk.length;
      } else {
        // Fallback: try items individually
        for (const prepared of itemChunk) {
          const itemSuccess = await executeIndividualInsert(
            prepared,
            userId,
            subscriptionId,
            provider,
            db
          );

          if (itemSuccess) {
            result.created++;
            result.fallbackCount++;
          } else {
            result.errors++;
            result.errorDetails.push({
              providerId: prepared.providerId,
              error: 'Failed in batch and individual fallback',
            });

            // Store in DLQ
            await storeToDLQ(
              db,
              subscriptionId,
              userId,
              provider,
              prepared.providerId,
              prepared.rawItem,
              new Error('Failed in batch and individual fallback')
            );
          }
        }
      }
    }
  }

  result.durationMs = Date.now() - startTime;

  // Log metrics
  console.log('Consolidated batch ingestion completed', {
    totalItems: result.total,
    created: result.created,
    skipped: result.skipped,
    errors: result.errors,
    batchCount: result.batchCount,
    fallbackCount: result.fallbackCount,
    durationMs: result.durationMs,
    avgMsPerItem: result.total > 0 ? Math.round(result.durationMs / result.total) : 0,
  });

  return result;
}

/**
 * Execute a batch insert for a chunk of prepared items.
 * Returns true if successful, false if the batch failed.
 */
async function executeChunkBatch(
  itemChunk: PreparedItem[],
  userId: string,
  subscriptionId: string,
  provider: Provider,
  db: Database
): Promise<boolean> {
  try {
    const nowISO = new Date().toISOString();
    const now = Date.now();
    const context = { db, userId, subscriptionId, provider, nowISO, now };
    const statements = itemChunk.flatMap((prepared) => buildIngestionStatements(prepared, context));

    await executeBatchStatements(statements, db);

    return true;
  } catch (error) {
    console.error('Batch chunk failed, will fallback to individual inserts', {
      chunkSize: itemChunk.length,
      error: serializeError(error),
    });
    return false;
  }
}

/**
 * Execute an individual insert for a single item (fallback when batch fails).
 * Returns true if successful, false if it failed.
 */
async function executeIndividualInsert(
  prepared: PreparedItem,
  userId: string,
  subscriptionId: string,
  provider: Provider,
  db: Database
): Promise<boolean> {
  try {
    const nowISO = new Date().toISOString();
    const now = Date.now();
    const context = { db, userId, subscriptionId, provider, nowISO, now };
    const statements = buildIngestionStatements(prepared, context);

    await executeBatchStatements(statements, db);
    return true;
  } catch (error) {
    console.error('Individual insert failed', {
      providerId: prepared.providerId,
      error: serializeError(error),
    });
    return false;
  }
}
