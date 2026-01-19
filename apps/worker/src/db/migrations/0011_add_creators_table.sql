-- Creators table for canonical creator entities
-- Stores creator entities across providers (YouTube channels, Spotify shows, X users, etc.)
-- Uses Unix ms INTEGER timestamps (new standard). See docs/zine-tech-stack.md.

-- Create the creators table
CREATE TABLE `creators` (
  `id` text PRIMARY KEY NOT NULL,
  `provider` text NOT NULL,
  `provider_creator_id` text NOT NULL,
  `name` text NOT NULL,
  `normalized_name` text NOT NULL,
  `image_url` text,
  `description` text,
  `external_url` text,
  `handle` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

-- Prevent duplicate creators from same provider
CREATE UNIQUE INDEX `idx_creators_provider_creator` ON `creators` (`provider`, `provider_creator_id`);

-- Fast lookups by normalized name for deduplication
CREATE INDEX `idx_creators_normalized_name` ON `creators` (`normalized_name`);

-- Add creator_id foreign key to items table
ALTER TABLE `items` ADD COLUMN `creator_id` text REFERENCES `creators`(`id`);

-- Fast lookups by creator
CREATE INDEX `idx_items_creator_id` ON `items` (`creator_id`);

-- Rollback SQL (documented for reference, not executed):
-- DROP INDEX IF EXISTS `idx_items_creator_id`;
-- ALTER TABLE `items` DROP COLUMN `creator_id`;
-- DROP INDEX IF EXISTS `idx_creators_normalized_name`;
-- DROP INDEX IF EXISTS `idx_creators_provider_creator`;
-- DROP TABLE IF EXISTS `creators`;
