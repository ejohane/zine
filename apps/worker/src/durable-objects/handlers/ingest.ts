/**
 * /ingest Handler for User Durable Object
 *
 * Handles provider content ingestion with idempotency.
 * Called by the ingestion pipeline to add new items from subscribed sources.
 */

import { UserItemState, ContentType } from '@zine/shared';

// ============================================================================
// Types
// ============================================================================

export interface IngestRequest {
  /** Source ID the items are from */
  sourceId: string;
  /** Items to ingest */
  items: IngestItem[];
}

export interface IngestItem {
  /** Provider-specific ID for idempotency */
  providerItemId: string;
  /** Content type */
  contentType: ContentType;
  /** Provider-specific ID */
  providerId?: string;
  /** Canonical URL */
  canonicalUrl?: string;
  /** Title */
  title?: string;
  /** Summary/description */
  summary?: string;
  /** Author name */
  author?: string;
  /** Publisher/channel name */
  publisher?: string;
  /** When content was published */
  publishedAt?: string;
  /** Thumbnail URL */
  thumbnailUrl?: string;
  /** Duration in seconds */
  duration?: number;
}

export interface IngestResponse {
  /** Number of items successfully ingested */
  ingested: number;
  /** Number of items skipped (already seen) */
  skipped: number;
  /** Any errors that occurred */
  errors: string[];
}

// ============================================================================
// Handler
// ============================================================================

/**
 * Handle an ingestion request
 *
 * @param sql - The SQLite storage API
 * @param request - The ingest request with items
 * @returns IngestResponse with counts and errors
 */
export function handleIngest(sql: SqlStorage, request: IngestRequest): IngestResponse {
  const { sourceId, items } = request;
  const now = new Date().toISOString();
  let ingested = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Verify source exists
  const sourceCheck = sql.exec('SELECT id FROM sources WHERE id = ?', sourceId).toArray();

  if (sourceCheck.length === 0) {
    return {
      ingested: 0,
      skipped: items.length,
      errors: [`Source ${sourceId} not found`],
    };
  }

  for (const item of items) {
    try {
      // Check if we've already seen this provider item
      const seen = sql
        .exec(
          'SELECT 1 FROM provider_items_seen WHERE source_id = ? AND provider_item_id = ?',
          sourceId,
          item.providerItemId
        )
        .toArray();

      if (seen.length > 0) {
        skipped++;
        continue;
      }

      // Generate IDs for the new records
      const itemId = crypto.randomUUID();
      const userItemId = crypto.randomUUID();

      // Insert canonical item
      sql.exec(
        `INSERT INTO canonical_items (
          id, content_type, provider_id, canonical_url, title, summary,
          author, publisher, published_at, thumbnail_url, duration,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        itemId,
        item.contentType,
        item.providerId ?? null,
        item.canonicalUrl ?? null,
        item.title ?? null,
        item.summary ?? null,
        item.author ?? null,
        item.publisher ?? null,
        item.publishedAt ?? null,
        item.thumbnailUrl ?? null,
        item.duration ?? null,
        now,
        now
      );

      // Insert user item (in INBOX state)
      sql.exec(
        `INSERT INTO user_items (id, item_id, state, ingested_at)
         VALUES (?, ?, ?, ?)`,
        userItemId,
        itemId,
        UserItemState.INBOX,
        now
      );

      // Mark provider item as seen
      sql.exec(
        `INSERT INTO provider_items_seen (source_id, provider_item_id, seen_at)
         VALUES (?, ?, ?)`,
        sourceId,
        item.providerItemId,
        now
      );

      // Increment global version for Replicache sync
      sql.exec(
        `UPDATE replicache_meta 
         SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) 
         WHERE key = 'version'`
      );

      ingested++;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to ingest ${item.providerItemId}: ${errorMsg}`);
    }
  }

  return { ingested, skipped, errors };
}

// ============================================================================
// Cleanup Handler
// ============================================================================

export interface CleanupResponse {
  /** Whether cleanup was successful */
  success: boolean;
  /** Tables cleared */
  tablesCleared: string[];
}

/**
 * Handle a cleanup/deletion request
 *
 * Removes all user data from the Durable Object.
 * This is called when a user deletes their account.
 *
 * @param sql - The SQLite storage API
 * @returns CleanupResponse
 */
export function handleCleanup(sql: SqlStorage): CleanupResponse {
  const tables = [
    'provider_items_seen',
    'user_items',
    'canonical_items',
    'sources',
    'replicache_clients',
    'user_profile',
  ];

  for (const table of tables) {
    sql.exec(`DELETE FROM ${table}`);
  }

  // Reset version counter
  sql.exec("UPDATE replicache_meta SET value = '0' WHERE key = 'version'");

  return {
    success: true,
    tablesCleared: tables,
  };
}
