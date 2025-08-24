CREATE TABLE `content` (
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
	`creator_verified` integer DEFAULT false,
	`creator_subscriber_count` integer,
	`creator_follower_count` integer,
	`series_id` text,
	`series_name` text,
	`episode_number` integer,
	`season_number` integer,
	`total_episodes_in_series` integer,
	`is_latest_episode` integer DEFAULT false,
	`series_metadata` text,
	`content_type` text,
	`category` text,
	`subcategory` text,
	`language` text,
	`is_explicit` integer DEFAULT false,
	`age_restriction` text,
	`tags` text,
	`topics` text,
	`has_captions` integer DEFAULT false,
	`has_transcript` integer DEFAULT false,
	`has_hd` integer DEFAULT false,
	`has_4k` integer DEFAULT false,
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
--> statement-breakpoint
CREATE TABLE `content_matches` (
	`id` text PRIMARY KEY NOT NULL,
	`content_fingerprint` text NOT NULL,
	`platform_a` text NOT NULL,
	`content_id_a` text NOT NULL,
	`platform_b` text NOT NULL,
	`content_id_b` text NOT NULL,
	`match_confidence` real NOT NULL,
	`match_reasons` text NOT NULL,
	`verified` integer DEFAULT false,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `durable_object_metrics` (
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
--> statement-breakpoint
CREATE TABLE `durable_object_status` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`durable_object_id` text NOT NULL,
	`status` text NOT NULL,
	`last_poll_time` integer,
	`last_poll_success` integer DEFAULT true NOT NULL,
	`last_poll_error` text,
	`total_poll_count` integer DEFAULT 0 NOT NULL,
	`successful_poll_count` integer DEFAULT 0 NOT NULL,
	`failed_poll_count` integer DEFAULT 0 NOT NULL,
	`total_new_items` integer DEFAULT 0 NOT NULL,
	`last_health_check_time` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `publishers` (
	`id` text PRIMARY KEY NOT NULL,
	`canonical_name` text NOT NULL,
	`alternative_names` text,
	`verified` integer DEFAULT false,
	`primary_platform` text,
	`platform_identities` text NOT NULL,
	`metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
DROP TABLE `d1_migrations`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_bookmarks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`content_id` text NOT NULL,
	`notes` text,
	`user_tags` text,
	`collections` text,
	`status` text DEFAULT 'active' NOT NULL,
	`is_favorite` integer DEFAULT false,
	`read_progress` integer,
	`bookmarked_at` integer NOT NULL,
	`last_accessed_at` integer,
	`archived_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`content_id`) REFERENCES `content`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_bookmarks`("id", "user_id", "content_id", "notes", "user_tags", "collections", "status", "is_favorite", "read_progress", "bookmarked_at", "last_accessed_at", "archived_at") SELECT "id", "user_id", "content_id", "notes", "user_tags", "collections", "status", "is_favorite", "read_progress", "bookmarked_at", "last_accessed_at", "archived_at" FROM `bookmarks`;--> statement-breakpoint
DROP TABLE `bookmarks`;--> statement-breakpoint
ALTER TABLE `__new_bookmarks` RENAME TO `bookmarks`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_user_feed_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`feed_item_id` text NOT NULL,
	`is_read` integer DEFAULT false NOT NULL,
	`is_saved` integer DEFAULT false NOT NULL,
	`is_hidden` integer DEFAULT false NOT NULL,
	`read_at` integer,
	`saved_at` integer,
	`engagement_time` integer,
	`bookmark_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`feed_item_id`) REFERENCES `feed_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bookmark_id`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_user_feed_items`("id", "user_id", "feed_item_id", "is_read", "is_saved", "is_hidden", "read_at", "saved_at", "engagement_time", "bookmark_id", "created_at") SELECT "id", "user_id", "feed_item_id", "is_read", "is_saved", "is_hidden", "read_at", "saved_at", "engagement_time", "bookmark_id", "created_at" FROM `user_feed_items`;--> statement-breakpoint
DROP TABLE `user_feed_items`;--> statement-breakpoint
ALTER TABLE `__new_user_feed_items` RENAME TO `user_feed_items`;--> statement-breakpoint
ALTER TABLE `user_accounts` ADD `is_active` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `user_accounts` DROP COLUMN `access_token`;--> statement-breakpoint
ALTER TABLE `user_accounts` DROP COLUMN `refresh_token`;--> statement-breakpoint
ALTER TABLE `user_accounts` DROP COLUMN `expires_at`;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `video_count` integer;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `uploads_playlist_id` text;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `etag` text;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `last_polled_at` integer;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `subscriber_count` integer;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `is_verified` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `content_categories` text;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `primary_language` text;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `average_duration` integer;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `upload_frequency` text;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `last_content_date` integer;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `total_content_count` integer;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `channel_metadata` text;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `engagement_rate_avg` integer;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `popularity_avg` integer;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `upload_schedule` text;--> statement-breakpoint
ALTER TABLE `feed_items` ADD `content_id` text NOT NULL REFERENCES content(id);--> statement-breakpoint
ALTER TABLE `feed_items` ADD `added_to_feed_at` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `feed_items` ADD `position_in_feed` integer;--> statement-breakpoint
ALTER TABLE `feed_items` DROP COLUMN `external_id`;--> statement-breakpoint
ALTER TABLE `feed_items` DROP COLUMN `title`;--> statement-breakpoint
ALTER TABLE `feed_items` DROP COLUMN `description`;--> statement-breakpoint
ALTER TABLE `feed_items` DROP COLUMN `thumbnail_url`;--> statement-breakpoint
ALTER TABLE `feed_items` DROP COLUMN `published_at`;--> statement-breakpoint
ALTER TABLE `feed_items` DROP COLUMN `duration_seconds`;--> statement-breakpoint
ALTER TABLE `feed_items` DROP COLUMN `external_url`;--> statement-breakpoint
ALTER TABLE `feed_items` DROP COLUMN `created_at`;