-- Created: 2026-02-18
-- Add RSS feed source tables for feed management and ingestion mapping.

CREATE TABLE `rss_feeds` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `feed_url` text NOT NULL,
  `feed_url_hash` text NOT NULL,
  `title` text,
  `description` text,
  `site_url` text,
  `image_url` text,
  `etag` text,
  `last_modified` text,
  `last_polled_at` integer,
  `last_success_at` integer,
  `last_error_at` integer,
  `last_error` text,
  `error_count` integer DEFAULT 0 NOT NULL,
  `status` text DEFAULT 'ACTIVE' NOT NULL,
  `poll_interval_seconds` integer DEFAULT 3600 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rss_feeds_user_feed_url_idx` ON `rss_feeds` (`user_id`, `feed_url`);
--> statement-breakpoint
CREATE INDEX `rss_feeds_poll_idx` ON `rss_feeds` (`status`, `last_polled_at`);
--> statement-breakpoint
CREATE INDEX `rss_feeds_user_status_idx` ON `rss_feeds` (`user_id`, `status`, `updated_at`);
--> statement-breakpoint
CREATE INDEX `rss_feeds_url_hash_idx` ON `rss_feeds` (`feed_url_hash`);
--> statement-breakpoint

CREATE TABLE `rss_feed_items` (
  `id` text PRIMARY KEY NOT NULL,
  `rss_feed_id` text NOT NULL,
  `item_id` text NOT NULL,
  `entry_id` text NOT NULL,
  `entry_url` text,
  `published_at` integer,
  `fetched_at` integer NOT NULL,
  FOREIGN KEY (`rss_feed_id`) REFERENCES `rss_feeds`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rss_feed_items_feed_entry_idx` ON `rss_feed_items` (`rss_feed_id`, `entry_id`);
--> statement-breakpoint
CREATE INDEX `rss_feed_items_feed_published_idx` ON `rss_feed_items` (`rss_feed_id`, `published_at`);
--> statement-breakpoint
CREATE INDEX `rss_feed_items_item_idx` ON `rss_feed_items` (`item_id`);
