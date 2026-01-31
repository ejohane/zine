import { and, eq } from 'drizzle-orm';

import type { Database } from '../../db';
import { items } from '../../db/schema';
import type { NewItem } from '../transformers';

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
// Canonical Item Helpers
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
export async function findOrCreateCanonicalItem(
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
