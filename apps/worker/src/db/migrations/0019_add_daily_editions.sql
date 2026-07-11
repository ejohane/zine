CREATE TABLE IF NOT EXISTS `daily_editions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `edition_date` text NOT NULL,
  `revision` integer NOT NULL,
  `status` text NOT NULL,
  `schema_version` integer NOT NULL,
  `headline` text NOT NULL,
  `window_start_at` integer NOT NULL,
  `window_end_at` integer NOT NULL,
  `edition_key` text NOT NULL,
  `markdown_key` text NOT NULL,
  `snapshot_key` text NOT NULL,
  `validation_key` text NOT NULL,
  `content_hash` text NOT NULL,
  `quality_score` real NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE UNIQUE INDEX IF NOT EXISTS `daily_editions_user_date_revision_idx`
  ON `daily_editions` (`user_id`, `edition_date`, `revision`);
CREATE INDEX IF NOT EXISTS `daily_editions_user_latest_idx`
  ON `daily_editions` (`user_id`, `window_end_at`, `revision`);
