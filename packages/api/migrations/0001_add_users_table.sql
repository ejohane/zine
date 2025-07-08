-- Add users table for Clerk authentication
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`first_name` text,
	`last_name` text,
	`image_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);

-- For development, we'll recreate the bookmarks table with proper foreign key
-- First backup existing data
CREATE TABLE bookmarks_backup AS SELECT * FROM bookmarks;

-- Drop old table
DROP TABLE bookmarks;

-- Recreate with proper foreign key constraint
CREATE TABLE `bookmarks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL REFERENCES users(id),
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

-- Note: In development, we start fresh with no data
-- In production, you'd need to migrate user_id values to actual Clerk user IDs
DROP TABLE bookmarks_backup;