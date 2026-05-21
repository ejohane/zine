-- Created: 2026-05-21
-- Add unified configurable mobile Home screen sections

CREATE TABLE IF NOT EXISTS `home_screen_sections` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `section_type` text NOT NULL,
  `built_in_section` text,
  `collection_id` text REFERENCES `collections`(`id`),
  `enabled` integer NOT NULL DEFAULT 1,
  `position` integer NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `home_screen_sections_user_builtin_idx`
  ON `home_screen_sections` (`user_id`, `built_in_section`);

CREATE UNIQUE INDEX IF NOT EXISTS `home_screen_sections_user_collection_idx`
  ON `home_screen_sections` (`user_id`, `collection_id`);

CREATE INDEX IF NOT EXISTS `home_screen_sections_user_position_idx`
  ON `home_screen_sections` (`user_id`, `position`);
