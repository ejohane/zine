-- Created: 2026-05-03
-- Add hybrid smart collections and per-item overrides

CREATE TABLE IF NOT EXISTS `collections` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `name` text NOT NULL,
  `normalized_name` text NOT NULL,
  `description` text,
  `rules_json` text NOT NULL,
  `sort` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `collections_user_normalized_name_idx`
  ON `collections` (`user_id`, `normalized_name`);

CREATE INDEX IF NOT EXISTS `collections_user_updated_idx`
  ON `collections` (`user_id`, `updated_at` DESC);

CREATE TABLE IF NOT EXISTS `collection_item_overrides` (
  `id` text PRIMARY KEY NOT NULL,
  `collection_id` text NOT NULL REFERENCES `collections`(`id`),
  `user_item_id` text NOT NULL REFERENCES `user_items`(`id`),
  `action` text NOT NULL,
  `position` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `collection_item_overrides_unique_idx`
  ON `collection_item_overrides` (`collection_id`, `user_item_id`);

CREATE INDEX IF NOT EXISTS `collection_item_overrides_collection_action_idx`
  ON `collection_item_overrides` (`collection_id`, `action`);

CREATE INDEX IF NOT EXISTS `collection_item_overrides_user_item_idx`
  ON `collection_item_overrides` (`user_item_id`);
