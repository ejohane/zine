-- Add the content table for unified content model
CREATE TABLE IF NOT EXISTS `content` (
  `id` text PRIMARY KEY NOT NULL,
  `external_id` text NOT NULL,
  `provider` text NOT NULL,
  `url` text NOT NULL,
  `canonical_url` text,
  `title` text NOT NULL,
  `description` text,
  `thumbnail_url` text,
  `favicon_url` text,
  `published_at` integer,
  `duration_seconds` integer,
  `view_count` integer,
  `like_count` integer,
  `comment_count` integer,
  `share_count` integer,
  `save_count` integer,
  `popularity_score` integer,
  `engagement_rate` real,
  `trending_score` integer,
  `creator_id` text,
  `creator_name` text,
  `creator_handle` text,
  `creator_thumbnail` text,
  `creator_verified` integer DEFAULT 0,
  `creator_subscriber_count` integer,
  `creator_follower_count` integer,
  `series_id` text,
  `series_name` text,
  `episode_number` integer,
  `season_number` integer,
  `total_episodes_in_series` integer,
  `is_latest_episode` integer DEFAULT 0,
  `series_metadata` text,
  `content_type` text,
  `category` text,
  `subcategory` text,
  `language` text,
  `is_explicit` integer DEFAULT 0,
  `age_restriction` text,
  `tags` text,
  `topics` text,
  `has_captions` integer DEFAULT 0,
  `has_transcript` integer DEFAULT 0,
  `has_hd` integer DEFAULT 0,
  `has_4k` integer DEFAULT 0,
  `video_quality` text,
  `audio_quality` text,
  `audio_languages` text,
  `caption_languages` text,
  `content_fingerprint` text,
  `publisher_canonical_id` text,
  `normalized_title` text,
  `episode_identifier` text,
  `cross_platform_matches` text,
  `statistics_metadata` text,
  `technical_metadata` text,
  `enrichment_metadata` text,
  `extended_metadata` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `last_enriched_at` integer,
  `enrichment_version` integer DEFAULT 1,
  `enrichment_source` text
);

-- Drop and recreate bookmarks table with foreign key to content
DROP TABLE IF EXISTS `bookmarks`;
CREATE TABLE `bookmarks` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `content_id` text NOT NULL,
  `notes` text,
  `user_tags` text,
  `collections` text,
  `status` text NOT NULL DEFAULT 'active',
  `is_favorite` integer DEFAULT 0,
  `read_progress` integer,
  `bookmarked_at` integer NOT NULL,
  `last_accessed_at` integer,
  `archived_at` integer,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`content_id`) REFERENCES `content`(`id`) ON UPDATE no action ON DELETE no action
);

-- Drop and recreate feed_items table with foreign key to content
DROP TABLE IF EXISTS `feed_items`;
CREATE TABLE `feed_items` (
  `id` text PRIMARY KEY NOT NULL,
  `subscription_id` text NOT NULL,
  `content_id` text NOT NULL,
  `added_to_feed_at` integer NOT NULL,
  `position_in_feed` integer,
  FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`content_id`) REFERENCES `content`(`id`) ON UPDATE no action ON DELETE no action
);

-- Add new tables for Phase 4 content matching
CREATE TABLE IF NOT EXISTS `publishers` (
  `id` text PRIMARY KEY NOT NULL,
  `canonical_name` text NOT NULL,
  `alternative_names` text,
  `verified` integer DEFAULT 0,
  `primary_platform` text,
  `platform_identities` text NOT NULL,
  `metadata` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE TABLE IF NOT EXISTS `content_matches` (
  `id` text PRIMARY KEY NOT NULL,
  `content_fingerprint` text NOT NULL,
  `platform_a` text NOT NULL,
  `content_id_a` text NOT NULL,
  `platform_b` text NOT NULL,
  `content_id_b` text NOT NULL,
  `match_confidence` real NOT NULL,
  `match_reasons` text NOT NULL,
  `verified` integer DEFAULT 0,
  `created_at` integer NOT NULL
);

-- Add token migration and durable object tracking tables
CREATE TABLE IF NOT EXISTS `token_migration_status` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `provider` text NOT NULL,
  `status` text NOT NULL,
  `attempt_count` integer NOT NULL DEFAULT 0,
  `error` text,
  `started_at` integer,
  `completed_at` integer,
  `last_attempt_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE TABLE IF NOT EXISTS `durable_object_status` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `durable_object_id` text NOT NULL,
  `status` text NOT NULL,
  `last_poll_time` integer,
  `last_poll_success` integer NOT NULL DEFAULT 1,
  `last_poll_error` text,
  `total_poll_count` integer NOT NULL DEFAULT 0,
  `successful_poll_count` integer NOT NULL DEFAULT 0,
  `failed_poll_count` integer NOT NULL DEFAULT 0,
  `total_new_items` integer NOT NULL DEFAULT 0,
  `last_health_check_time` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE TABLE IF NOT EXISTS `durable_object_metrics` (
  `id` text PRIMARY KEY NOT NULL,
  `durable_object_id` text NOT NULL,
  `poll_timestamp` integer NOT NULL,
  `provider` text NOT NULL,
  `subscription_count` integer NOT NULL,
  `new_items_found` integer NOT NULL,
  `poll_duration_ms` integer NOT NULL,
  `errors` text,
  `created_at` integer NOT NULL
);