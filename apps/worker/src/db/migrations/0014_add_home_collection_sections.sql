-- Created: 2026-05-06
-- Add configurable mobile Home sections backed by custom collections

CREATE TABLE IF NOT EXISTS `home_collection_sections` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `collection_id` text NOT NULL REFERENCES `collections`(`id`),
  `position` integer NOT NULL,
  `layout` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `home_collection_sections_collection_idx`
  ON `home_collection_sections` (`collection_id`);

CREATE INDEX IF NOT EXISTS `home_collection_sections_user_position_idx`
  ON `home_collection_sections` (`user_id`, `position`);
