-- Created: 2026-01-30
-- Add user_notifications table for health alerts

CREATE TABLE IF NOT EXISTS `user_notifications` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `type` text NOT NULL,
  `provider` text,
  `title` text NOT NULL,
  `message` text NOT NULL,
  `data` text,
  `read_at` integer,
  `resolved_at` integer,
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE UNIQUE INDEX IF NOT EXISTS `user_notifications_active_unique`
  ON `user_notifications` (`user_id`, `type`, `provider`)
  WHERE `resolved_at` IS NULL;

CREATE INDEX IF NOT EXISTS `user_notifications_inbox_idx`
  ON `user_notifications` (`user_id`, `resolved_at`, `created_at` DESC);
