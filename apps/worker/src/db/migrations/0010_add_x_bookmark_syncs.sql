CREATE TABLE `x_bookmark_syncs` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `provider_connection_id` text NOT NULL,
  `status` text DEFAULT 'IDLE' NOT NULL,
  `daily_sync_enabled` integer DEFAULT 0 NOT NULL,
  `last_cursor` text,
  `last_sync_at` integer,
  `last_success_at` integer,
  `last_error_at` integer,
  `last_error` text,
  `rate_limited_until` integer,
  `last_estimated_billable_reads` integer DEFAULT 0 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`provider_connection_id`) REFERENCES `provider_connections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `x_bookmark_syncs_user_connection_idx` ON `x_bookmark_syncs` (`user_id`,`provider_connection_id`);
--> statement-breakpoint
CREATE INDEX `x_bookmark_syncs_daily_idx` ON `x_bookmark_syncs` (`daily_sync_enabled`,`status`,`last_sync_at`);
--> statement-breakpoint
CREATE TABLE `x_bookmark_items` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `item_id` text NOT NULL,
  `tweet_id` text NOT NULL,
  `first_seen_at` integer NOT NULL,
  `last_seen_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `x_bookmark_items_user_tweet_idx` ON `x_bookmark_items` (`user_id`,`tweet_id`);
--> statement-breakpoint
CREATE INDEX `x_bookmark_items_user_seen_idx` ON `x_bookmark_items` (`user_id`,`last_seen_at`);
--> statement-breakpoint
CREATE INDEX `x_bookmark_items_item_idx` ON `x_bookmark_items` (`item_id`);
