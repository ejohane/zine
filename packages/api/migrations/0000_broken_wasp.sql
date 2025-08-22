CREATE TABLE `bookmarks` (
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
CREATE TABLE `creators` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`handle` text,
	`avatar_url` text,
	`bio` text,
	`url` text,
	`platforms` text,
	`external_links` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
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
CREATE TABLE `feed_items` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`content_id` text NOT NULL,
	`added_to_feed_at` integer NOT NULL,
	`position_in_feed` integer,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`content_id`) REFERENCES `content`(`id`) ON UPDATE no action ON DELETE no action
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
CREATE TABLE `subscription_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`oauth_config` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`external_id` text NOT NULL,
	`title` text NOT NULL,
	`creator_name` text NOT NULL,
	`description` text,
	`thumbnail_url` text,
	`subscription_url` text,
	`total_episodes` integer,
	`video_count` integer,
	`uploads_playlist_id` text,
	`etag` text,
	`last_polled_at` integer,
	`subscriber_count` integer,
	`is_verified` integer DEFAULT false,
	`content_categories` text,
	`primary_language` text,
	`average_duration` integer,
	`upload_frequency` text,
	`last_content_date` integer,
	`total_content_count` integer,
	`channel_metadata` text,
	`engagement_rate_avg` integer,
	`popularity_avg` integer,
	`upload_schedule` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `subscription_providers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `token_migration_status` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`status` text NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`error` text,
	`started_at` integer,
	`completed_at` integer,
	`last_attempt_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`external_account_id` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`provider_id`) REFERENCES `subscription_providers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user_feed_items` (
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
CREATE TABLE `user_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`subscription_id` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`first_name` text,
	`last_name` text,
	`image_url` text,
	`durable_object_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
