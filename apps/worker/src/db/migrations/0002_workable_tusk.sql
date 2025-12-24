CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_channel_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`image_url` text,
	`external_url` text,
	`total_items` integer,
	`last_published_at` integer,
	`last_polled_at` integer,
	`poll_interval_seconds` integer DEFAULT 3600 NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_user_provider_channel_idx` ON `subscriptions` (`user_id`,`provider`,`provider_channel_id`);--> statement-breakpoint
CREATE INDEX `idx_subscriptions_poll` ON `subscriptions` (`status`,`last_polled_at`);--> statement-breakpoint
CREATE INDEX `idx_subscriptions_user` ON `subscriptions` (`user_id`,`status`);