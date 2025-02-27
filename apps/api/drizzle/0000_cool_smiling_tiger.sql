CREATE TABLE `bookmarks` (
	`id` integer PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`content_id` integer NOT NULL,
	`created_at` integer DEFAULT '"2025-02-24T21:04:41.186Z"' NOT NULL,
	`updated_at` integer DEFAULT '"2025-02-24T21:04:41.186Z"' NOT NULL,
	`is_archived` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`content_id`) REFERENCES `content`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `content` (
	`id` integer PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT '"2025-02-24T21:04:41.185Z"' NOT NULL,
	`updated_at` integer DEFAULT '"2025-02-24T21:04:41.185Z"',
	`url` text NOT NULL,
	`title` text,
	`description` text,
	`site_name` text,
	`type` text,
	`website` text,
	`image` text,
	`author` text,
	`duration` integer,
	`source` text,
	`metadata` text
);
