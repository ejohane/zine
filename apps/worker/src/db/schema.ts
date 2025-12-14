import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

// ============================================================================
// Users
// ============================================================================
export const users = sqliteTable('users', {
  id: text('id').primaryKey(), // Clerk user ID
  email: text('email'),
  createdAt: text('created_at').notNull(), // ISO8601
  updatedAt: text('updated_at').notNull(),
});

// ============================================================================
// Items (Canonical Content)
// ============================================================================
export const items = sqliteTable(
  'items',
  {
    id: text('id').primaryKey(), // ULID

    // Classification - values stored as UPPERCASE to match existing enums
    contentType: text('content_type').notNull(), // VIDEO | PODCAST | ARTICLE | POST
    provider: text('provider').notNull(), // YOUTUBE | SPOTIFY | SUBSTACK | RSS
    providerId: text('provider_id').notNull(), // External ID
    canonicalUrl: text('canonical_url').notNull(),

    // Display
    title: text('title').notNull(),
    thumbnailUrl: text('thumbnail_url'),

    // Attribution
    creator: text('creator').notNull(), // Channel/author/podcast name
    publisher: text('publisher'), // Optional: network

    // Metadata
    summary: text('summary'),
    duration: integer('duration'), // Seconds
    publishedAt: text('published_at'), // ISO8601

    // System
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    // Prevent duplicate content from same provider
    uniqueIndex('items_provider_provider_id_idx').on(table.provider, table.providerId),
  ]
);

// ============================================================================
// User Items (User's relationship to content)
// ============================================================================
export const userItems = sqliteTable(
  'user_items',
  {
    id: text('id').primaryKey(), // ULID
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    itemId: text('item_id')
      .notNull()
      .references(() => items.id),

    // State - stored as UPPERCASE to match UserItemState enum
    state: text('state').notNull(), // INBOX | BOOKMARKED | ARCHIVED

    // Timestamps
    ingestedAt: text('ingested_at').notNull(), // ISO8601
    bookmarkedAt: text('bookmarked_at'),
    archivedAt: text('archived_at'),

    // Progress tracking
    progressPosition: integer('progress_position'), // Seconds
    progressDuration: integer('progress_duration'), // Seconds
    progressUpdatedAt: text('progress_updated_at'),

    // System
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    // Prevent duplicate user-item relationships
    uniqueIndex('user_items_user_id_item_id_idx').on(table.userId, table.itemId),

    // Fast inbox queries: WHERE userId = ? AND state = 'INBOX' ORDER BY ingestedAt DESC
    index('user_items_inbox_idx').on(table.userId, table.state, table.ingestedAt),

    // Fast library queries: WHERE userId = ? AND state = 'BOOKMARKED' ORDER BY bookmarkedAt DESC
    index('user_items_library_idx').on(table.userId, table.state, table.bookmarkedAt),
  ]
);

// ============================================================================
// Sources (User subscriptions)
// ============================================================================
export const sources = sqliteTable(
  'sources',
  {
    id: text('id').primaryKey(), // ULID
    userId: text('user_id')
      .notNull()
      .references(() => users.id),

    // Provider info - stored as UPPERCASE
    provider: text('provider').notNull(), // YOUTUBE | SPOTIFY | SUBSTACK | RSS
    providerId: text('provider_id').notNull(), // Provider-specific ID (channel ID, etc.)
    feedUrl: text('feed_url').notNull(), // Actual subscription URL
    name: text('name').notNull(),

    // System
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'), // Soft delete
  },
  (table) => [
    // Prevent duplicate subscriptions (same user, same provider, same feed)
    uniqueIndex('sources_user_provider_feed_idx').on(table.userId, table.provider, table.feedUrl),

    // Fast list queries for user's sources
    index('sources_user_id_idx').on(table.userId),
  ]
);

// ============================================================================
// Provider Items Seen (Ingestion Idempotency)
// ============================================================================
// This table is CRITICAL for preventing duplicate inbox items during ingestion.
// See: docs/zine-ingestion-pipeline.md
export const providerItemsSeen = sqliteTable(
  'provider_items_seen',
  {
    id: text('id').primaryKey(), // ULID
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    provider: text('provider').notNull(), // YOUTUBE | SPOTIFY | SUBSTACK | RSS
    providerItemId: text('provider_item_id').notNull(), // External item ID
    sourceId: text('source_id').references(() => sources.id), // Which source ingested this
    firstSeenAt: text('first_seen_at').notNull(), // ISO8601
  },
  (table) => [
    // Idempotency key - prevents re-ingesting the same item for a user
    uniqueIndex('provider_items_seen_user_provider_item_idx').on(
      table.userId,
      table.provider,
      table.providerItemId
    ),
  ]
);
