/**
 * Idempotent Ingestion Processor
 *
 * This module handles the core ingestion logic for transforming raw provider data
 * into canonical items and user items with D1 batch operations for atomicity.
 *
 * Key responsibilities:
 * - Check idempotency via provider_items_seen before processing
 * - Use D1 batch API for atomic writes (items, user_items, subscription_items, provider_items_seen)
 * - Share canonical items across users
 * - Bridge timestamp formats between new tables (Unix ms) and existing tables (ISO8601)
 * - Store failed items in dead-letter queue for later retry
 *
 * Note: D1 doesn't support traditional SQL transactions. We use db.batch() which
 * executes all statements in a single round-trip and rolls back on any failure.
 *
 * @see /features/subscriptions/backend-spec.md - Section 4: Ingestion Pipeline
 */

import { ulid } from 'ulid';
import { and, eq } from 'drizzle-orm';
import type { Provider } from '@zine/shared';
import type { Database } from '../db';
import { UserItemState } from '@zine/shared';
import {
  items,
  userItems,
  subscriptionItems,
  providerItemsSeen,
  deadLetterQueue,
} from '../db/schema';
import type { NewItem } from './transformers';
import { TransformError } from './transformers';
import { serializeError } from '../utils/error-utils';
import { validateCanonicalItem, isValidationError } from './validation';
import {
  extractCreatorFromMetadata,
  findOrCreateCreator,
  generateSyntheticCreatorId,
  type CreatorParams,
} from '../db/helpers/creators';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of an ingestion attempt.
 */
export interface IngestResult {
  /** Whether a new user_item was created */
  created: boolean;
  /** ID of the canonical item (if created or found) */
  itemId?: string;
  /** ID of the user_item (if created) */
  userItemId?: string;
  /** Reason for skipping (if not created) */
  skipped?: 'already_seen';
}

// ============================================================================
// Error Classification
// ============================================================================

/**
 * Error types for dead-letter queue classification.
 * Helps with understanding failure patterns and retry strategies.
 */
export type DLQErrorType = 'transform' | 'database' | 'validation' | 'timeout' | 'unknown';

/**
 * Classify an error into a category for dead-letter queue tracking.
 * This helps with understanding failure patterns and determining retry strategies:
 * - transform: Data transformation failed (likely needs manual fix)
 * - database: DB operation failed (often transient, safe to retry)
 * - validation: Data validation failed (likely needs manual fix)
 * - timeout: Operation timed out (transient, safe to retry)
 * - unknown: Unclassified error
 *
 * @param error - The error to classify
 * @returns The error type classification
 */
export function classifyError(error: unknown): DLQErrorType {
  if (error instanceof TransformError) {
    return 'transform';
  }

  if (isValidationError(error)) {
    return 'validation';
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    // Database errors (D1, SQLite, Drizzle)
    if (
      name.includes('database') ||
      name.includes('sql') ||
      name.includes('d1') ||
      message.includes('database') ||
      message.includes('sqlite') ||
      message.includes('constraint') ||
      message.includes('unique') ||
      message.includes('foreign key')
    ) {
      return 'database';
    }

    // Timeout errors
    if (
      name.includes('timeout') ||
      message.includes('timeout') ||
      message.includes('timed out') ||
      message.includes('deadline exceeded')
    ) {
      return 'timeout';
    }

    // Validation errors
    if (
      name.includes('validation') ||
      message.includes('validation') ||
      message.includes('invalid') ||
      message.includes('required field') ||
      message.includes('missing')
    ) {
      return 'validation';
    }
  }

  return 'unknown';
}

// ============================================================================
// Creator Extraction Helpers
// ============================================================================

/**
 * Providers that have native creator IDs from their APIs.
 * For these, we use extractCreatorFromMetadata to parse the raw API response.
 */
const PROVIDERS_WITH_NATIVE_CREATOR_IDS = ['YOUTUBE', 'SPOTIFY', 'X'];

/**
 * Providers that require synthetic creator IDs.
 * For these, we generate a deterministic ID from provider + creator name.
 */
const PROVIDERS_WITH_SYNTHETIC_CREATOR_IDS = ['RSS', 'WEB', 'SUBSTACK'];

/**
 * Extract or create creator parameters from a raw provider item.
 *
 * This function handles two cases:
 * 1. Providers with native IDs (YouTube, Spotify, X): Extract from raw API metadata
 * 2. Providers without native IDs (RSS, WEB, SUBSTACK): Generate synthetic ID from creator name
 *
 * @param provider - The provider type
 * @param rawItem - Raw item data from the provider API
 * @param transformedItem - The transformed NewItem (for fallback creator name)
 * @returns CreatorParams if extraction succeeded, null otherwise
 */
function extractCreatorParams(
  provider: string,
  rawItem: unknown,
  transformedItem: NewItem
): CreatorParams | null {
  // Case 1: Providers with native creator IDs
  if (PROVIDERS_WITH_NATIVE_CREATOR_IDS.includes(provider)) {
    return extractCreatorFromMetadata(provider, rawItem);
  }

  // Case 2: Providers with synthetic creator IDs
  if (PROVIDERS_WITH_SYNTHETIC_CREATOR_IDS.includes(provider) && transformedItem.creator) {
    const syntheticId = generateSyntheticCreatorId(provider, transformedItem.creator);
    return {
      provider,
      providerCreatorId: syntheticId,
      name: transformedItem.creator,
      imageUrl: transformedItem.creatorImageUrl,
    };
  }

  return null;
}

/**
 * Find or create a creator from raw item data.
 *
 * Uses extractCreatorParams to get creator info, then calls findOrCreateCreator
 * to get the internal creator ID.
 *
 * @param db - Database instance
 * @param provider - Provider type
 * @param rawItem - Raw item data from provider API
 * @param transformedItem - Transformed item data (for fallback creator name)
 * @returns Internal creator ID if successful, null otherwise
 */
async function getOrCreateCreator(
  db: Database,
  provider: string,
  rawItem: unknown,
  transformedItem: NewItem
): Promise<string | null> {
  try {
    const creatorParams = extractCreatorParams(provider, rawItem, transformedItem);

    if (!creatorParams) {
      return null;
    }

    // findOrCreateCreator expects ctx with db property
    const ctx = { db };
    const creator = await findOrCreateCreator(ctx, creatorParams);
    return creator.id;
  } catch (error) {
    // Log but don't fail ingestion if creator extraction fails
    console.error('Failed to extract/create creator:', {
      provider,
      error: serializeError(error),
    });
    return null;
  }
}

/**
 * Backfill creatorId for an existing canonical item if it's missing.
 * This handles items created before the schema normalization.
 *
 * Called when an item is "already seen" to ensure we still update
 * the canonical item's creatorId even though we skip creating user_item.
 */
async function backfillCreatorIdIfMissing<T>(
  db: Database,
  provider: string,
  rawItem: T,
  transformedItem: NewItem
): Promise<void> {
  try {
    // Check if canonical item exists and is missing creatorId
    const existing = await db
      .select({ id: items.id, creatorId: items.creatorId })
      .from(items)
      .where(and(eq(items.provider, provider), eq(items.providerId, transformedItem.providerId)))
      .limit(1);

    if (existing.length === 0 || existing[0].creatorId) {
      // Item doesn't exist or already has creatorId - nothing to backfill
      return;
    }

    // Extract creator from raw item
    const creatorId = await getOrCreateCreator(db, provider, rawItem, transformedItem);
    if (!creatorId) {
      return;
    }

    // Update the canonical item with the creatorId
    await db
      .update(items)
      .set({ creatorId, updatedAt: new Date().toISOString() })
      .where(eq(items.id, existing[0].id));

    console.log('Backfilled creatorId for item', {
      itemId: existing[0].id,
      provider,
      providerId: transformedItem.providerId,
      creatorId,
    });
  } catch (error) {
    // Log but don't fail - backfill is best-effort
    console.error('Failed to backfill creatorId:', {
      provider,
      providerId: transformedItem.providerId,
      error: serializeError(error),
    });
  }
}

// ============================================================================
// Timestamp Conversion Helpers
// ============================================================================

/**
 * Convert Unix milliseconds to ISO8601 string.
 *
 * CRITICAL: This function bridges the timestamp gap between:
 * - New tables (subscriptions, subscription_items): Unix milliseconds (INTEGER)
 * - Existing tables (items, user_items, provider_items_seen): ISO8601 strings (TEXT)
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @returns ISO8601 formatted string (e.g., "2024-01-15T10:00:00.000Z")
 */
function toISO8601(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

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
  // 1. Transform raw provider data to our item format
  const transformedItem = transformFn(rawItem);

  // 2. Validate transformed item before any DB operations
  // This catches missing required fields, invalid URLs, out-of-range values, etc.
  validateCanonicalItem(transformedItem, rawItem);

  // 3. Check idempotency (has this user already seen this item?)
  // This query is safe outside the transaction since it's a read-only check
  // and the transaction will handle the actual write atomicity
  const seen = await db
    .select()
    .from(providerItemsSeen)
    .where(
      and(
        eq(providerItemsSeen.userId, userId),
        eq(providerItemsSeen.provider, provider),
        eq(providerItemsSeen.providerItemId, transformedItem.providerId)
      )
    )
    .limit(1);

  if (seen.length > 0) {
    // Even though user already saw this item, we should still backfill creatorId
    // if the canonical item is missing it (migration from denormalized schema)
    await backfillCreatorIdIfMissing(db, provider, rawItem, transformedItem);
    return { created: false, skipped: 'already_seen' };
  }

  // 4. Extract or create creator from raw item metadata
  const creatorId = await getOrCreateCreator(db, provider, rawItem, transformedItem);

  // 5. Find or create canonical item (shared across users)
  const item = await findOrCreateCanonicalItem(transformedItem, provider, db, creatorId);

  // 6. Prepare all the insert statements for batch execution
  const userItemId = ulid();
  const nowISO = new Date().toISOString(); // ISO8601 for existing table
  const now = Date.now(); // Unix ms for new tables

  // Use db.batch() for atomic execution - all succeed or all fail
  // Use onConflictDoNothing() on all inserts to handle race conditions:
  // If two workers concurrently process the same item, both pass the idempotency check,
  // but only one will succeed in inserting - the other will silently skip due to unique constraints.
  await db.batch([
    // Create user_item in INBOX state
    // Unique constraint: (userId, itemId)
    db
      .insert(userItems)
      .values({
        id: userItemId,
        userId,
        itemId: item.id,
        state: UserItemState.INBOX,
        ingestedAt: nowISO,
        createdAt: nowISO,
        updatedAt: nowISO,
      })
      .onConflictDoNothing(),

    // Create subscription_item for tracking
    // Unique constraint: (subscriptionId, providerItemId)
    db
      .insert(subscriptionItems)
      .values({
        id: ulid(),
        subscriptionId,
        itemId: item.id,
        providerItemId: transformedItem.providerId,
        publishedAt: transformedItem.publishedAt, // Unix ms for new table
        fetchedAt: now, // Unix ms for new table
      })
      .onConflictDoNothing(),

    // Mark as seen for idempotency
    // Note: sourceId references legacy sources table, not subscriptions
    // We leave it null for subscription-based ingestion
    // Unique constraint: (userId, provider, providerItemId)
    db
      .insert(providerItemsSeen)
      .values({
        id: ulid(),
        userId,
        provider,
        providerItemId: transformedItem.providerId,
        sourceId: null, // Legacy field - not used for subscription-based ingestion
        firstSeenAt: nowISO, // ISO8601 for existing table
      })
      .onConflictDoNothing(),
  ]);

  return {
    created: true,
    itemId: item.id,
    userItemId,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Find an existing canonical item or create a new one.
 *
 * Canonical items are shared across users - if User A and User B both subscribe
 * to the same YouTube channel, they share the same item record but have separate
 * user_item records.
 *
 * This function:
 * 1. Looks up existing item by provider + providerId
 * 2. If found, returns the existing item ID
 * 3. If not found, creates a new item with proper timestamp conversion and creatorId
 *
 * @param newItem - Transformed item data (with Unix ms timestamps)
 * @param provider - Provider type string
 * @param db - Database instance
 * @param creatorId - Optional internal creator ID (from creators table)
 * @returns Object containing the item ID
 */
async function findOrCreateCanonicalItem(
  newItem: NewItem,
  provider: string,
  db: Database,
  creatorId?: string | null
): Promise<{ id: string }> {
  // Check if item already exists (shared across users)
  const existing = await db
    .select({ id: items.id, creatorId: items.creatorId })
    .from(items)
    .where(and(eq(items.provider, provider), eq(items.providerId, newItem.providerId)))
    .limit(1);

  if (existing.length > 0) {
    // Backfill creatorId if the existing item doesn't have one but we have one now
    if (!existing[0].creatorId && creatorId) {
      await db
        .update(items)
        .set({ creatorId, updatedAt: new Date().toISOString() })
        .where(eq(items.id, existing[0].id));
    }
    return { id: existing[0].id };
  }

  // Create new canonical item
  // Convert timestamps to ISO8601 for existing items table
  const now = new Date().toISOString();
  const publishedAtISO = newItem.publishedAt ? toISO8601(newItem.publishedAt) : null;

  // Use onConflictDoNothing() to handle race conditions where another worker
  // creates the same canonical item concurrently. The unique constraint on
  // (provider, providerId) ensures only one item is created.
  // Note: creator and creatorImageUrl are now sourced from creators table via creatorId join.
  await db
    .insert(items)
    .values({
      id: newItem.id,
      contentType: newItem.contentType,
      provider,
      providerId: newItem.providerId,
      canonicalUrl: newItem.canonicalUrl,
      title: newItem.title,
      summary: newItem.description,
      creatorId: creatorId ?? null,
      thumbnailUrl: newItem.imageUrl,
      duration: newItem.durationSeconds,
      publishedAt: publishedAtISO,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

  return { id: newItem.id };
}

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
 * Result of a batch ingestion operation.
 */
export interface BatchIngestResult {
  /** Total number of items processed */
  total: number;
  /** Number of items successfully created */
  created: number;
  /** Number of items skipped (already seen) */
  skipped: number;
  /** Number of items that failed to process */
  errors: number;
  /** Details of any errors that occurred */
  errorDetails: Array<{ providerId: string; error: string }>;
}

/**
 * Extended result for consolidated batch ingestion with metrics.
 */
export interface ConsolidatedBatchIngestResult extends BatchIngestResult {
  /** Number of batch chunks executed */
  batchCount: number;
  /** Number of items that required individual fallback */
  fallbackCount: number;
  /** Total duration in milliseconds */
  durationMs: number;
}

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
      try {
        await db.insert(deadLetterQueue).values({
          id: ulid(),
          subscriptionId,
          userId,
          provider,
          providerId,
          rawData: JSON.stringify(rawItem),
          errorMessage,
          errorType: classifyError(error),
          errorStack: serialized.stack,
          createdAt: Date.now(),
        });
      } catch (dlqError) {
        // Log but don't fail the batch if DLQ storage fails
        // This is a best-effort operation
        const dlqSerialized = serializeError(dlqError);
        console.error('Failed to store item in dead-letter queue:', {
          error: dlqSerialized,
          providerId,
        });
      }
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
 * Prepared item ready for batch insertion.
 * Contains all the data needed for the insert statements.
 */
interface PreparedItem {
  /** Transformed item data */
  newItem: NewItem;
  /** Raw provider data (for DLQ on failure) */
  rawItem: unknown;
  /** Provider ID (for logging and DLQ) */
  providerId: string;
  /** Canonical item ID (existing or new) */
  canonicalItemId: string;
  /** Whether the canonical item already exists */
  canonicalItemExists: boolean;
  /** User item ID for this ingestion */
  userItemId: string;
  /** Internal creator ID (from creators table) */
  creatorId: string | null;
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
  const preparedItems: PreparedItem[] = [];

  for (const rawItem of rawItems) {
    const providerId = getProviderId(rawItem);

    try {
      // Transform
      const newItem = transformFn(rawItem);

      // Validate before any DB operations
      validateCanonicalItem(newItem, rawItem);

      // Check idempotency
      const seen = await db
        .select()
        .from(providerItemsSeen)
        .where(
          and(
            eq(providerItemsSeen.userId, userId),
            eq(providerItemsSeen.provider, provider),
            eq(providerItemsSeen.providerItemId, newItem.providerId)
          )
        )
        .limit(1);

      if (seen.length > 0) {
        result.skipped++;
        continue;
      }

      // Find or check canonical item existence
      const existingCanonical = await db
        .select({ id: items.id, creatorId: items.creatorId })
        .from(items)
        .where(and(eq(items.provider, provider), eq(items.providerId, newItem.providerId)))
        .limit(1);

      // Extract or create creator from raw metadata
      const creatorId = await getOrCreateCreator(db, provider, rawItem, newItem);

      // Backfill creatorId if the existing item doesn't have one but we have one now
      if (existingCanonical.length > 0 && !existingCanonical[0].creatorId && creatorId) {
        await db
          .update(items)
          .set({ creatorId, updatedAt: new Date().toISOString() })
          .where(eq(items.id, existingCanonical[0].id));
      }

      preparedItems.push({
        newItem,
        rawItem,
        providerId,
        canonicalItemId: existingCanonical.length > 0 ? existingCanonical[0].id : newItem.id,
        canonicalItemExists: existingCanonical.length > 0,
        userItemId: ulid(),
        creatorId,
      });
    } catch (error) {
      // Transformation or validation failed
      result.errors++;
      const serialized = serializeError(error);
      const errorMessage = `[${serialized.type}] ${serialized.message}`;
      result.errorDetails.push({ providerId, error: errorMessage });

      // Store in DLQ
      await storeToDLQ(db, subscriptionId, userId, provider, providerId, rawItem, error);
    }
  }

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

    // Build all insert statements for this chunk
    // Using unknown[] because Drizzle's batch types are complex when dynamically building statements
    const statements: unknown[] = [];

    for (const prepared of itemChunk) {
      // 1. Create canonical item (if it doesn't exist)
      // Use onConflictDoNothing() to handle race conditions where another worker
      // creates the same canonical item concurrently.
      // Note: creator and creatorImageUrl are now sourced from creators table via creatorId join.
      if (!prepared.canonicalItemExists) {
        const publishedAtISO = prepared.newItem.publishedAt
          ? new Date(prepared.newItem.publishedAt).toISOString()
          : null;

        statements.push(
          db
            .insert(items)
            .values({
              id: prepared.newItem.id,
              contentType: prepared.newItem.contentType,
              provider,
              providerId: prepared.newItem.providerId,
              canonicalUrl: prepared.newItem.canonicalUrl,
              title: prepared.newItem.title,
              summary: prepared.newItem.description,
              creatorId: prepared.creatorId,
              thumbnailUrl: prepared.newItem.imageUrl,
              duration: prepared.newItem.durationSeconds,
              publishedAt: publishedAtISO,
              createdAt: nowISO,
              updatedAt: nowISO,
            })
            .onConflictDoNothing()
        );
      }

      // 2. Create user_item
      // Unique constraint: (userId, itemId)
      statements.push(
        db
          .insert(userItems)
          .values({
            id: prepared.userItemId,
            userId,
            itemId: prepared.canonicalItemId,
            state: UserItemState.INBOX,
            ingestedAt: nowISO,
            createdAt: nowISO,
            updatedAt: nowISO,
          })
          .onConflictDoNothing()
      );

      // 3. Create subscription_item
      // Unique constraint: (subscriptionId, providerItemId)
      statements.push(
        db
          .insert(subscriptionItems)
          .values({
            id: ulid(),
            subscriptionId,
            itemId: prepared.canonicalItemId,
            providerItemId: prepared.newItem.providerId,
            publishedAt: prepared.newItem.publishedAt,
            fetchedAt: now,
          })
          .onConflictDoNothing()
      );

      // 4. Mark as seen for idempotency
      // Unique constraint: (userId, provider, providerItemId)
      statements.push(
        db
          .insert(providerItemsSeen)
          .values({
            id: ulid(),
            userId,
            provider,
            providerItemId: prepared.newItem.providerId,
            sourceId: null,
            firstSeenAt: nowISO,
          })
          .onConflictDoNothing()
      );
    }

    // Execute all statements in a single batch
    // D1's batch() executes all statements in one round-trip and rolls back on any failure
    // Type assertion needed because we build statements dynamically
    await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);

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

    // Using unknown[] because Drizzle's batch types are complex when dynamically building statements
    const statements: unknown[] = [];

    // 1. Create canonical item (if it doesn't exist)
    // Use onConflictDoNothing() to handle race conditions.
    // Note: creator and creatorImageUrl are now sourced from creators table via creatorId join.
    if (!prepared.canonicalItemExists) {
      const publishedAtISO = prepared.newItem.publishedAt
        ? new Date(prepared.newItem.publishedAt).toISOString()
        : null;

      statements.push(
        db
          .insert(items)
          .values({
            id: prepared.newItem.id,
            contentType: prepared.newItem.contentType,
            provider,
            providerId: prepared.newItem.providerId,
            canonicalUrl: prepared.newItem.canonicalUrl,
            title: prepared.newItem.title,
            summary: prepared.newItem.description,
            creatorId: prepared.creatorId,
            thumbnailUrl: prepared.newItem.imageUrl,
            duration: prepared.newItem.durationSeconds,
            publishedAt: publishedAtISO,
            createdAt: nowISO,
            updatedAt: nowISO,
          })
          .onConflictDoNothing()
      );
    }

    // 2. Create user_item
    // Unique constraint: (userId, itemId)
    statements.push(
      db
        .insert(userItems)
        .values({
          id: prepared.userItemId,
          userId,
          itemId: prepared.canonicalItemId,
          state: UserItemState.INBOX,
          ingestedAt: nowISO,
          createdAt: nowISO,
          updatedAt: nowISO,
        })
        .onConflictDoNothing()
    );

    // 3. Create subscription_item
    // Unique constraint: (subscriptionId, providerItemId)
    statements.push(
      db
        .insert(subscriptionItems)
        .values({
          id: ulid(),
          subscriptionId,
          itemId: prepared.canonicalItemId,
          providerItemId: prepared.newItem.providerId,
          publishedAt: prepared.newItem.publishedAt,
          fetchedAt: now,
        })
        .onConflictDoNothing()
    );

    // 4. Mark as seen
    // Unique constraint: (userId, provider, providerItemId)
    statements.push(
      db
        .insert(providerItemsSeen)
        .values({
          id: ulid(),
          userId,
          provider,
          providerItemId: prepared.newItem.providerId,
          sourceId: null,
          firstSeenAt: nowISO,
        })
        .onConflictDoNothing()
    );

    // Type assertion needed because we build statements dynamically
    await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);
    return true;
  } catch (error) {
    console.error('Individual insert failed', {
      providerId: prepared.providerId,
      error: serializeError(error),
    });
    return false;
  }
}

/**
 * Store a failed item in the dead-letter queue.
 */
async function storeToDLQ(
  db: Database,
  subscriptionId: string,
  userId: string,
  provider: Provider,
  providerId: string,
  rawItem: unknown,
  error: unknown
): Promise<void> {
  try {
    const serialized = serializeError(error);
    const errorMessage = `[${serialized.type}] ${serialized.message}`;

    await db.insert(deadLetterQueue).values({
      id: ulid(),
      subscriptionId,
      userId,
      provider,
      providerId,
      rawData: JSON.stringify(rawItem),
      errorMessage,
      errorType: classifyError(error),
      errorStack: serialized.stack,
      createdAt: Date.now(),
    });
  } catch (dlqError) {
    // Best-effort - log but don't fail
    console.error('Failed to store item in dead-letter queue:', {
      error: serializeError(dlqError),
      providerId,
    });
  }
}

// ============================================================================
// Re-exports
// ============================================================================

// Re-export validation utilities for external use
export { ValidationError, isValidationError } from './validation';
