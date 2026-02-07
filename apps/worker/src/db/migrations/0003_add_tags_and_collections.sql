-- Created: 2026-02-07
-- Add user-defined tags/collections and item-tag assignments

CREATE TABLE IF NOT EXISTS `tags` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `name` text NOT NULL,
  `normalized_name` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `tags_user_normalized_name_idx`
  ON `tags` (`user_id`, `normalized_name`);

CREATE INDEX IF NOT EXISTS `tags_user_idx`
  ON `tags` (`user_id`, `updated_at` DESC);

CREATE TABLE IF NOT EXISTS `user_item_tags` (
  `id` text PRIMARY KEY NOT NULL,
  `user_item_id` text NOT NULL REFERENCES `user_items`(`id`),
  `tag_id` text NOT NULL REFERENCES `tags`(`id`),
  `created_at` integer NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `user_item_tags_unique_idx`
  ON `user_item_tags` (`user_item_id`, `tag_id`);

CREATE INDEX IF NOT EXISTS `user_item_tags_user_item_idx`
  ON `user_item_tags` (`user_item_id`);

CREATE INDEX IF NOT EXISTS `user_item_tags_tag_idx`
  ON `user_item_tags` (`tag_id`);
