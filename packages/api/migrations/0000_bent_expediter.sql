CREATE TABLE `bookmarks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text DEFAULT '1' NOT NULL,
	`url` text NOT NULL,
	`original_url` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`source` text,
	`content_type` text,
	`thumbnail_url` text,
	`favicon_url` text,
	`published_at` integer,
	`language` text,
	`status` text DEFAULT 'active' NOT NULL,
	`creator_id` text,
	`video_metadata` text,
	`podcast_metadata` text,
	`article_metadata` text,
	`post_metadata` text,
	`tags` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
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
