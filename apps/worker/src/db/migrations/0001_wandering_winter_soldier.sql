CREATE TABLE `provider_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_user_id` text,
	`access_token` text NOT NULL,
	`refresh_token` text NOT NULL,
	`token_expires_at` integer NOT NULL,
	`scopes` text,
	`connected_at` integer NOT NULL,
	`last_refreshed_at` integer,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_connections_user_provider_idx` ON `provider_connections` (`user_id`,`provider`);