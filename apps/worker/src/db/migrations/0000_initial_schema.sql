-- Initial clean schema for Zine
-- Created: 2025-01-19
--
-- This is a clean slate migration with normalized schema:
-- - creators table is the single source of truth for creator data
-- - items.creatorId references creators (no denormalized creator/creatorImageUrl fields)
-- - subscriptions.creatorId references creators (no denormalized name/imageUrl fields)

-- ============================================================================
-- Users
-- ============================================================================
CREATE TABLE IF NOT EXISTS `users` (
  `id` text PRIMARY KEY NOT NULL,
  `email` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);

-- ============================================================================
-- Creators (Canonical Creator Entities)
-- ============================================================================
-- Must be created before items and subscriptions due to foreign key references
CREATE TABLE IF NOT EXISTS `creators` (
  `id` text PRIMARY KEY NOT NULL,
  `provider` text NOT NULL,
  `provider_creator_id` text NOT NULL,
  `name` text NOT NULL,
  `normalized_name` text NOT NULL,
  `image_url` text,
  `description` text,
  `external_url` text,
  `handle` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `idx_creators_provider_creator` ON `creators` (`provider`, `provider_creator_id`);
CREATE INDEX IF NOT EXISTS `idx_creators_normalized_name` ON `creators` (`normalized_name`);

-- ============================================================================
-- Items (Canonical Content)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `items` (
  `id` text PRIMARY KEY NOT NULL,
  `content_type` text NOT NULL,
  `provider` text NOT NULL,
  `provider_id` text NOT NULL,
  `canonical_url` text NOT NULL,
  `title` text NOT NULL,
  `thumbnail_url` text,
  `creator_id` text REFERENCES `creators`(`id`),
  `publisher` text,
  `summary` text,
  `duration` integer,
  `published_at` text,
  `raw_metadata` text,
  `word_count` integer,
  `reading_time_minutes` integer,
  `article_content_key` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `items_provider_provider_id_idx` ON `items` (`provider`, `provider_id`);
CREATE INDEX IF NOT EXISTS `idx_items_creator_id` ON `items` (`creator_id`);

-- ============================================================================
-- User Items (User's relationship to content)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `user_items` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `item_id` text NOT NULL REFERENCES `items`(`id`),
  `state` text NOT NULL,
  `ingested_at` text NOT NULL,
  `bookmarked_at` text,
  `archived_at` text,
  `progress_position` integer,
  `progress_duration` integer,
  `progress_updated_at` text,
  `is_finished` integer NOT NULL DEFAULT 0,
  `finished_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `user_items_user_id_item_id_idx` ON `user_items` (`user_id`, `item_id`);
CREATE INDEX IF NOT EXISTS `user_items_inbox_idx` ON `user_items` (`user_id`, `state`, `ingested_at`);
CREATE INDEX IF NOT EXISTS `user_items_library_idx` ON `user_items` (`user_id`, `state`, `bookmarked_at`);

-- ============================================================================
-- Sources (Legacy user subscriptions - being phased out)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `sources` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `provider` text NOT NULL,
  `provider_id` text NOT NULL,
  `feed_url` text NOT NULL,
  `name` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `deleted_at` text
);

CREATE UNIQUE INDEX IF NOT EXISTS `sources_user_provider_feed_idx` ON `sources` (`user_id`, `provider`, `feed_url`);
CREATE INDEX IF NOT EXISTS `sources_user_id_idx` ON `sources` (`user_id`);

-- ============================================================================
-- Provider Connections (OAuth tokens per provider)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `provider_connections` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `provider` text NOT NULL,
  `provider_user_id` text,
  `access_token` text NOT NULL,
  `refresh_token` text NOT NULL,
  `token_expires_at` integer NOT NULL,
  `scopes` text,
  `status` text NOT NULL DEFAULT 'ACTIVE',
  `connected_at` integer NOT NULL,
  `last_refreshed_at` integer
);

CREATE UNIQUE INDEX IF NOT EXISTS `provider_connections_user_provider_idx` ON `provider_connections` (`user_id`, `provider`);
CREATE INDEX IF NOT EXISTS `provider_connections_status_idx` ON `provider_connections` (`status`);

-- ============================================================================
-- Subscriptions (User subscriptions to specific channels/shows)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `subscriptions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `provider` text NOT NULL,
  `provider_channel_id` text NOT NULL,
  `creator_id` text REFERENCES `creators`(`id`),
  `total_items` integer DEFAULT 0,
  `last_published_at` integer,
  `last_polled_at` integer,
  `poll_interval_seconds` integer DEFAULT 3600,
  `status` text NOT NULL DEFAULT 'ACTIVE',
  `disconnected_at` integer,
  `disconnected_reason` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `subscriptions_user_provider_channel_idx` ON `subscriptions` (`user_id`, `provider`, `provider_channel_id`);
CREATE INDEX IF NOT EXISTS `subscriptions_poll_idx` ON `subscriptions` (`status`, `last_polled_at`);
CREATE INDEX IF NOT EXISTS `subscriptions_user_idx` ON `subscriptions` (`user_id`, `status`);
CREATE INDEX IF NOT EXISTS `subscriptions_creator_idx` ON `subscriptions` (`creator_id`);

-- ============================================================================
-- Subscription Items (Track which items came from which subscription)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `subscription_items` (
  `id` text PRIMARY KEY NOT NULL,
  `subscription_id` text NOT NULL REFERENCES `subscriptions`(`id`),
  `item_id` text NOT NULL REFERENCES `items`(`id`),
  `provider_item_id` text NOT NULL,
  `published_at` integer,
  `fetched_at` integer NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `subscription_items_sub_provider_item_idx` ON `subscription_items` (`subscription_id`, `provider_item_id`);
CREATE INDEX IF NOT EXISTS `subscription_items_item_idx` ON `subscription_items` (`item_id`);

-- ============================================================================
-- Dead Letter Queue (Failed Ingestion Tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `dead_letter_queue` (
  `id` text PRIMARY KEY NOT NULL,
  `subscription_id` text REFERENCES `subscriptions`(`id`),
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `provider` text NOT NULL,
  `provider_id` text NOT NULL,
  `raw_data` text NOT NULL,
  `error_message` text NOT NULL,
  `error_type` text,
  `error_stack` text,
  `retry_count` integer NOT NULL DEFAULT 0,
  `last_retry_at` integer,
  `status` text NOT NULL DEFAULT 'pending',
  `created_at` integer NOT NULL
);

CREATE INDEX IF NOT EXISTS `dlq_status_idx` ON `dead_letter_queue` (`status`);
CREATE INDEX IF NOT EXISTS `dlq_user_idx` ON `dead_letter_queue` (`user_id`);
CREATE INDEX IF NOT EXISTS `dlq_provider_item_idx` ON `dead_letter_queue` (`provider`, `provider_id`, `user_id`);

-- ============================================================================
-- Provider Items Seen (Ingestion Idempotency)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `provider_items_seen` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `provider` text NOT NULL,
  `provider_item_id` text NOT NULL,
  `source_id` text REFERENCES `sources`(`id`),
  `first_seen_at` text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `provider_items_seen_user_provider_item_idx` ON `provider_items_seen` (`user_id`, `provider`, `provider_item_id`);
