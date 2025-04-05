CREATE TABLE `bookmark_tags` (
	`bookmark_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	`created_at` integer DEFAULT '"2025-04-01T10:44:54.446Z"' NOT NULL,
	PRIMARY KEY(`bookmark_id`, `tag_id`),
	FOREIGN KEY (`bookmark_id`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `bookmark_tags_tag_idx` ON `bookmark_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `bookmarks` (
	`id` integer PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`content_id` integer NOT NULL,
	`created_at` integer DEFAULT '"2025-04-01T10:44:54.446Z"' NOT NULL,
	`updated_at` integer DEFAULT '"2025-04-01T10:44:54.446Z"' NOT NULL,
	`is_archived` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`content_id`) REFERENCES `content`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `author` (
	`id` integer PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT '"2025-04-01T10:44:54.443Z"' NOT NULL,
	`updated_at` integer DEFAULT '"2025-04-01T10:44:54.443Z"' NOT NULL,
	`name` text NOT NULL,
	`image` text,
	`description` text
);
--> statement-breakpoint
CREATE TABLE `author_services` (
	`author_id` integer NOT NULL,
	`service_id` integer NOT NULL,
	`service_url` text,
	`created_at` integer DEFAULT '"2025-04-01T10:44:54.444Z"' NOT NULL,
	PRIMARY KEY(`author_id`, `service_id`),
	FOREIGN KEY (`author_id`) REFERENCES `author`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `author_services_service_idx` ON `author_services` (`service_id`);--> statement-breakpoint
CREATE TABLE `content` (
	`id` integer PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT '"2025-04-01T10:44:54.446Z"' NOT NULL,
	`updated_at` integer DEFAULT '"2025-04-01T10:44:54.446Z"',
	`url` text NOT NULL,
	`title` text,
	`description` text,
	`type` text DEFAULT 'link' NOT NULL,
	`image` text,
	`duration` integer,
	`author_id` integer,
	`service_id` integer NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `author`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `type_idx` ON `content` (`type`);--> statement-breakpoint
CREATE TABLE `services` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text DEFAULT 'web' NOT NULL,
	`created_at` integer DEFAULT '"2025-04-01T10:44:54.443Z"' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `services_name_unique` ON `services` (`name`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT '"2025-04-01T10:44:54.438Z"' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);