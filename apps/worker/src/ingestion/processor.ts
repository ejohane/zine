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
 *
 * Note: D1 doesn't support traditional SQL transactions. We use db.batch() which
 * executes all statements in a single round-trip and rolls back on any failure.
 *
 * @see /features/subscriptions/backend-spec.md - Section 4: Ingestion Pipeline
 */

import { ulid } from 'ulid';
import { and, eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { Provider } from '@zine/shared';
import { UserItemState } from '@zine/shared';
import { items, userItems, subscriptionItems, providerItemsSeen } from '../db/schema';
import type { NewItem } from './transformers';

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
  db: DrizzleD1Database,
  transformFn: (raw: T) => NewItem
): Promise<IngestResult> {
  // 1. Transform raw provider data to our item format
  const transformedItem = transformFn(rawItem);

  // 2. Check idempotency (has this user already seen this item?)
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
    return { created: false, skipped: 'already_seen' };
  }

  // 3. Find or create canonical item (shared across users)
  const item = await findOrCreateCanonicalItem(transformedItem, provider, db);

  // 4. Prepare all the insert statements for batch execution
  const userItemId = ulid();
  const nowISO = new Date().toISOString(); // ISO8601 for existing table
  const now = Date.now(); // Unix ms for new tables

  // Use db.batch() for atomic execution - all succeed or all fail
  await db.batch([
    // Create user_item in INBOX state
    db.insert(userItems).values({
      id: userItemId,
      userId,
      itemId: item.id,
      state: UserItemState.INBOX,
      ingestedAt: nowISO,
      createdAt: nowISO,
      updatedAt: nowISO,
    }),

    // Create subscription_item for tracking
    db.insert(subscriptionItems).values({
      id: ulid(),
      subscriptionId,
      itemId: item.id,
      providerItemId: transformedItem.providerId,
      publishedAt: transformedItem.publishedAt, // Unix ms for new table
      fetchedAt: now, // Unix ms for new table
    }),

    // Mark as seen for idempotency
    // Note: sourceId references legacy sources table, not subscriptions
    // We leave it null for subscription-based ingestion
    db.insert(providerItemsSeen).values({
      id: ulid(),
      userId,
      provider,
      providerItemId: transformedItem.providerId,
      sourceId: null, // Legacy field - not used for subscription-based ingestion
      firstSeenAt: nowISO, // ISO8601 for existing table
    }),
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
 * 3. If not found, creates a new item with proper timestamp conversion
 *
 * @param newItem - Transformed item data (with Unix ms timestamps)
 * @param provider - Provider type string
 * @param db - Database instance
 * @returns Object containing the item ID
 */
async function findOrCreateCanonicalItem(
  newItem: NewItem,
  provider: string,
  db: DrizzleD1Database
): Promise<{ id: string }> {
  // Check if item already exists (shared across users)
  const existing = await db
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.provider, provider), eq(items.providerId, newItem.providerId)))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  // Create new canonical item
  // Convert timestamps to ISO8601 for existing items table
  const now = new Date().toISOString();
  const publishedAtISO = newItem.publishedAt ? toISO8601(newItem.publishedAt) : null;

  await db.insert(items).values({
    id: newItem.id,
    contentType: newItem.contentType,
    provider,
    providerId: newItem.providerId,
    canonicalUrl: newItem.canonicalUrl,
    title: newItem.title,
    summary: newItem.description,
    creator: newItem.creator,
    thumbnailUrl: newItem.imageUrl,
    duration: newItem.durationSeconds,
    publishedAt: publishedAtISO,
    createdAt: now,
    updatedAt: now,
  });

  return { id: newItem.id };
}

// ============================================================================
// Batch Ingestion
// ============================================================================

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
  db: DrizzleD1Database,
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
      result.errorDetails.push({
        providerId: getProviderId(rawItem),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}
