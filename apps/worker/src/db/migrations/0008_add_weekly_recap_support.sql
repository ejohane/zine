-- Created: 2026-03-17
-- Add recap indexes and immutable user item consumption events

CREATE INDEX IF NOT EXISTS `user_items_finished_window_idx`
  ON `user_items` (`user_id`, `is_finished`, `finished_at` DESC);

CREATE INDEX IF NOT EXISTS `user_items_progress_window_idx`
  ON `user_items` (`user_id`, `progress_updated_at` DESC);

CREATE INDEX IF NOT EXISTS `user_items_last_opened_general_idx`
  ON `user_items` (`user_id`, `last_opened_at` DESC);

CREATE TABLE IF NOT EXISTS `user_item_consumption_events` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `user_item_id` text NOT NULL REFERENCES `user_items`(`id`),
  `item_id` text NOT NULL REFERENCES `items`(`id`),
  `event_type` text NOT NULL,
  `occurred_at` integer NOT NULL,
  `position_seconds` integer,
  `duration_seconds` integer,
  `delta_seconds` integer,
  `source` text NOT NULL,
  `metadata` text
);

CREATE INDEX IF NOT EXISTS `user_item_consumption_events_user_idx`
  ON `user_item_consumption_events` (`user_id`, `occurred_at` DESC);

CREATE INDEX IF NOT EXISTS `user_item_consumption_events_user_type_idx`
  ON `user_item_consumption_events` (`user_id`, `event_type`, `occurred_at` DESC);

CREATE INDEX IF NOT EXISTS `user_item_consumption_events_user_item_idx`
  ON `user_item_consumption_events` (`user_item_id`, `occurred_at` DESC);

CREATE INDEX IF NOT EXISTS `user_item_consumption_events_item_idx`
  ON `user_item_consumption_events` (`item_id`, `occurred_at` DESC);
