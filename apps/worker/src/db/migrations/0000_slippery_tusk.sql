CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`content_type` text NOT NULL,
	`provider` text NOT NULL,
	`provider_id` text NOT NULL,
	`canonical_url` text NOT NULL,
	`title` text NOT NULL,
	`thumbnail_url` text,
	`creator` text NOT NULL,
	`publisher` text,
	`summary` text,
	`duration` integer,
	`published_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `items_provider_provider_id_idx` ON `items` (`provider`,`provider_id`);--> statement-breakpoint
CREATE TABLE `provider_items_seen` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_item_id` text NOT NULL,
	`source_id` text,
	`first_seen_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_items_seen_user_provider_item_idx` ON `provider_items_seen` (`user_id`,`provider`,`provider_item_id`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_id` text NOT NULL,
	`feed_url` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sources_user_provider_feed_idx` ON `sources` (`user_id`,`provider`,`feed_url`);--> statement-breakpoint
CREATE INDEX `sources_user_id_idx` ON `sources` (`user_id`);--> statement-breakpoint
CREATE TABLE `user_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`item_id` text NOT NULL,
	`state` text NOT NULL,
	`ingested_at` text NOT NULL,
	`bookmarked_at` text,
	`archived_at` text,
	`progress_position` integer,
	`progress_duration` integer,
	`progress_updated_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_items_user_id_item_id_idx` ON `user_items` (`user_id`,`item_id`);--> statement-breakpoint
CREATE INDEX `user_items_inbox_idx` ON `user_items` (`user_id`,`state`,`ingested_at`);--> statement-breakpoint
CREATE INDEX `user_items_library_idx` ON `user_items` (`user_id`,`state`,`bookmarked_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
