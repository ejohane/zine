CREATE TABLE `subscription_items` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`item_id` text NOT NULL,
	`provider_item_id` text NOT NULL,
	`published_at` integer,
	`fetched_at` integer NOT NULL,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_items_sub_provider_item_idx` ON `subscription_items` (`subscription_id`,`provider_item_id`);--> statement-breakpoint
CREATE INDEX `idx_subscription_items_sub` ON `subscription_items` (`subscription_id`);