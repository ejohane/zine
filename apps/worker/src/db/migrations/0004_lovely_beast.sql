CREATE TABLE `user_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`provider` text,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`data` text,
	`read_at` integer,
	`resolved_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_user_notifications_inbox` ON `user_notifications` (`user_id`,`resolved_at`,`created_at`);