-- Created: 2026-01-24
-- Add last_opened_at tracking for recently opened bookmarks

ALTER TABLE `user_items` ADD COLUMN IF NOT EXISTS `last_opened_at` text;

CREATE INDEX IF NOT EXISTS `user_items_recent_opened_idx`
  ON `user_items` (`user_id`, `state`, `last_opened_at`);
