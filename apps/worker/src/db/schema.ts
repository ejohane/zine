import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

// ============================================================================
// Users
// ============================================================================
// NOTE: Legacy table using ISO8601 TEXT timestamps. New tables should use Unix ms INTEGER.
// See docs/zine-tech-stack.md for timestamp standard.
export const users = sqliteTable('users', {
  id: text('id').primaryKey(), // Clerk user ID
  email: text('email'),
  createdAt: text('created_at').notNull(), // ISO8601 (legacy)
  updatedAt: text('updated_at').notNull(), // ISO8601 (legacy)
});

// ============================================================================
// Items (Canonical Content)
// ============================================================================
// NOTE: Legacy table using ISO8601 TEXT timestamps. New tables should use Unix ms INTEGER.
// See docs/zine-tech-stack.md for timestamp standard.
export const items = sqliteTable(
  'items',
  {
    id: text('id').primaryKey(), // ULID

    // Classification - values stored as UPPERCASE to match existing enums
    contentType: text('content_type').notNull(), // VIDEO | PODCAST | ARTICLE | POST
    provider: text('provider').notNull(), // YOUTUBE | SPOTIFY | SUBSTACK | RSS | X
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
    publishedAt: text('published_at'), // ISO8601 (legacy)
    rawMetadata: text('raw_metadata'), // JSON string of provider API response

    // Article-specific metadata
    wordCount: integer('word_count'),
    readingTimeMinutes: integer('reading_time_minutes'),
    articleContentKey: text('article_content_key'), // R2 object key for full article content

    // System
    createdAt: text('created_at').notNull(), // ISO8601 (legacy)
    updatedAt: text('updated_at').notNull(), // ISO8601 (legacy)
  },
  (table) => [
    // Prevent duplicate content from same provider
    uniqueIndex('items_provider_provider_id_idx').on(table.provider, table.providerId),
  ]
);

// ============================================================================
// User Items (User's relationship to content)
// ============================================================================
// NOTE: Legacy table using ISO8601 TEXT timestamps. New tables should use Unix ms INTEGER.
// See docs/zine-tech-stack.md for timestamp standard.
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

    // Timestamps (ISO8601 legacy format)
    ingestedAt: text('ingested_at').notNull(), // ISO8601 (legacy)
    bookmarkedAt: text('bookmarked_at'), // ISO8601 (legacy)
    archivedAt: text('archived_at'), // ISO8601 (legacy)

    // Progress tracking
    progressPosition: integer('progress_position'), // Seconds
    progressDuration: integer('progress_duration'), // Seconds
    progressUpdatedAt: text('progress_updated_at'), // ISO8601 (legacy)

    // Consumption tracking
    isFinished: integer('is_finished', { mode: 'boolean' }).notNull().default(false),
    finishedAt: text('finished_at'), // ISO8601 (legacy), null when not finished

    // System
    createdAt: text('created_at').notNull(), // ISO8601 (legacy)
    updatedAt: text('updated_at').notNull(), // ISO8601 (legacy)
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
// NOTE: Legacy table using ISO8601 TEXT timestamps. New tables should use Unix ms INTEGER.
// See docs/zine-tech-stack.md for timestamp standard.
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

    // System (ISO8601 legacy format)
    createdAt: text('created_at').notNull(), // ISO8601 (legacy)
    updatedAt: text('updated_at').notNull(), // ISO8601 (legacy)
    deletedAt: text('deleted_at'), // ISO8601 (legacy), soft delete
  },
  (table) => [
    // Prevent duplicate subscriptions (same user, same provider, same feed)
    uniqueIndex('sources_user_provider_feed_idx').on(table.userId, table.provider, table.feedUrl),

    // Fast list queries for user's sources
    index('sources_user_id_idx').on(table.userId),
  ]
);

// ============================================================================
// Provider Connections (OAuth tokens per provider)
// ============================================================================
// Stores encrypted OAuth credentials for connected providers (YouTube, Spotify)
// Uses Unix ms INTEGER timestamps (new standard). See docs/zine-tech-stack.md.
export const providerConnections = sqliteTable(
  'provider_connections',
  {
    id: text('id').primaryKey(), // ULID
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    provider: text('provider').notNull(), // YOUTUBE | SPOTIFY
    providerUserId: text('provider_user_id'), // Provider's user ID

    // Encrypted OAuth tokens (AES-256-GCM encrypted)
    accessToken: text('access_token').notNull(),
    refreshToken: text('refresh_token').notNull(),
    tokenExpiresAt: integer('token_expires_at').notNull(), // Unix ms

    // Connection metadata
    scopes: text('scopes'), // Comma-separated granted scopes
    status: text('status').notNull().default('ACTIVE'), // ACTIVE | EXPIRED | REVOKED
    connectedAt: integer('connected_at').notNull(), // Unix ms
    lastRefreshedAt: integer('last_refreshed_at'), // Unix ms
  },
  (table) => [
    // One connection per provider per user
    uniqueIndex('provider_connections_user_provider_idx').on(table.userId, table.provider),
    index('provider_connections_status_idx').on(table.status),
  ]
);

// ============================================================================
// Subscriptions (User subscriptions to specific channels/shows)
// ============================================================================
// Uses Unix ms INTEGER timestamps (new standard). See docs/zine-tech-stack.md.
export const subscriptions = sqliteTable(
  'subscriptions',
  {
    id: text('id').primaryKey(), // ULID
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    provider: text('provider').notNull(), // YOUTUBE | SPOTIFY
    providerChannelId: text('provider_channel_id').notNull(), // YouTube channel ID or Spotify show ID

    // Display info
    name: text('name').notNull(), // Channel/show name
    description: text('description'),
    imageUrl: text('image_url'),
    externalUrl: text('external_url'), // Link to channel/show on provider

    // Polling metadata
    totalItems: integer('total_items').default(0), // Total videos/episodes (cached)
    lastPublishedAt: integer('last_published_at'), // Unix ms
    lastPolledAt: integer('last_polled_at'), // Unix ms
    pollIntervalSeconds: integer('poll_interval_seconds').default(3600), // Polling frequency

    // Status
    status: text('status').notNull().default('ACTIVE'), // ACTIVE | PAUSED | DISCONNECTED | UNSUBSCRIBED

    // Timestamps
    createdAt: integer('created_at').notNull(), // Unix ms
    updatedAt: integer('updated_at').notNull(), // Unix ms
  },
  (table) => [
    // Prevent duplicate subscriptions
    uniqueIndex('subscriptions_user_provider_channel_idx').on(
      table.userId,
      table.provider,
      table.providerChannelId
    ),
    // Fast polling queries
    index('subscriptions_poll_idx').on(table.status, table.lastPolledAt),
    index('subscriptions_user_idx').on(table.userId, table.status),
  ]
);

// ============================================================================
// Subscription Items (Track which items came from which subscription)
// ============================================================================
// Uses Unix ms INTEGER timestamps (new standard). See docs/zine-tech-stack.md.
export const subscriptionItems = sqliteTable(
  'subscription_items',
  {
    id: text('id').primaryKey(), // ULID
    subscriptionId: text('subscription_id')
      .notNull()
      .references(() => subscriptions.id),
    itemId: text('item_id')
      .notNull()
      .references(() => items.id),
    providerItemId: text('provider_item_id').notNull(), // YouTube video ID or Spotify episode ID
    publishedAt: integer('published_at'), // Unix ms
    fetchedAt: integer('fetched_at').notNull(), // Unix ms
  },
  (table) => [
    // Prevent duplicate tracking
    uniqueIndex('subscription_items_sub_provider_item_idx').on(
      table.subscriptionId,
      table.providerItemId
    ),
    index('subscription_items_item_idx').on(table.itemId),
  ]
);

// ============================================================================
// Provider Items Seen (Ingestion Idempotency)
// ============================================================================
// This table is CRITICAL for preventing duplicate inbox items during ingestion.
// See: docs/zine-ingestion-pipeline.md
// NOTE: Legacy table using ISO8601 TEXT timestamps. New tables should use Unix ms INTEGER.
// See docs/zine-tech-stack.md for timestamp standard.
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
    firstSeenAt: text('first_seen_at').notNull(), // ISO8601 (legacy)
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
