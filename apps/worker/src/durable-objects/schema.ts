/**
 * SQLite Schema for User Durable Objects
 *
 * Version-tracked migrations for per-user SQLite storage.
 * Each migration is idempotent and tracked in the _migrations table.
 */

// ============================================================================
// Types
// ============================================================================

export interface Migration {
  /** Unique migration name */
  name: string;
  /** Migration version (for ordering) */
  version: number;
  /** SQL statements to execute */
  up: string;
}

// ============================================================================
// Migrations
// ============================================================================

/**
 * Array of migrations in version order.
 * NEVER modify existing migrations - only add new ones.
 */
export const migrations: Migration[] = [
  {
    name: '001_initial_schema',
    version: 1,
    up: `
      -- =====================================================================
      -- User Profile
      -- Synced from Clerk via webhook
      -- =====================================================================
      CREATE TABLE IF NOT EXISTS user_profile (
        id TEXT PRIMARY KEY,
        email TEXT,
        first_name TEXT,
        last_name TEXT,
        image_url TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- =====================================================================
      -- Canonical Items
      -- Content entities shared across the system (videos, articles, etc.)
      -- =====================================================================
      CREATE TABLE IF NOT EXISTS canonical_items (
        id TEXT PRIMARY KEY,
        content_type TEXT NOT NULL,
        provider_id TEXT,
        canonical_url TEXT,
        title TEXT,
        summary TEXT,
        author TEXT,
        publisher TEXT,
        published_at TEXT,
        thumbnail_url TEXT,
        duration INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_canonical_items_provider_id 
        ON canonical_items(provider_id) WHERE provider_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_canonical_items_content_type 
        ON canonical_items(content_type);

      -- =====================================================================
      -- User Items
      -- User-specific relationship with canonical items
      -- =====================================================================
      CREATE TABLE IF NOT EXISTS user_items (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'INBOX',
        ingested_at TEXT NOT NULL DEFAULT (datetime('now')),
        bookmarked_at TEXT,
        archived_at TEXT,
        FOREIGN KEY (item_id) REFERENCES canonical_items(id)
      );

      CREATE INDEX IF NOT EXISTS idx_user_items_item_id ON user_items(item_id);
      CREATE INDEX IF NOT EXISTS idx_user_items_state ON user_items(state);
      CREATE INDEX IF NOT EXISTS idx_user_items_ingested_at ON user_items(ingested_at);

      -- =====================================================================
      -- Sources
      -- User subscriptions to content providers
      -- =====================================================================
      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        name TEXT NOT NULL,
        config TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(provider, provider_id)
      );

      CREATE INDEX IF NOT EXISTS idx_sources_provider ON sources(provider);

      -- =====================================================================
      -- Provider Items Seen
      -- Track which items from each source have been processed (idempotency)
      -- =====================================================================
      CREATE TABLE IF NOT EXISTS provider_items_seen (
        source_id TEXT NOT NULL,
        provider_item_id TEXT NOT NULL,
        seen_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (source_id, provider_item_id),
        FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
      );

      -- =====================================================================
      -- Replicache Clients
      -- Track client mutation IDs for deduplication
      -- =====================================================================
      CREATE TABLE IF NOT EXISTS replicache_clients (
        id TEXT PRIMARY KEY,
        client_group_id TEXT NOT NULL,
        last_mutation_id INTEGER NOT NULL DEFAULT 0,
        last_modified TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_replicache_clients_group 
        ON replicache_clients(client_group_id);

      -- =====================================================================
      -- Replicache Meta
      -- Global sync state
      -- =====================================================================
      CREATE TABLE IF NOT EXISTS replicache_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      -- Initialize global version counter
      INSERT OR IGNORE INTO replicache_meta (key, value) VALUES ('version', '0');
    `,
  },
];

// ============================================================================
// Schema Version
// ============================================================================

/**
 * Current schema version (highest migration version)
 */
export const CURRENT_SCHEMA_VERSION = migrations.reduce((max, m) => Math.max(max, m.version), 0);
