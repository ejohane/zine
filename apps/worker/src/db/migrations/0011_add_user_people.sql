-- Created: 2026-05-03
-- Add private per-user people index derived from bookmark enrichment entities

CREATE TABLE IF NOT EXISTS `user_people` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `display_name` text NOT NULL,
  `normalized_name` text NOT NULL,
  `item_count` integer NOT NULL DEFAULT 0,
  `latest_seen_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `user_people_user_normalized_idx`
  ON `user_people` (`user_id`, `normalized_name`);

CREATE INDEX IF NOT EXISTS `user_people_user_count_seen_idx`
  ON `user_people` (`user_id`, `item_count` DESC, `latest_seen_at` DESC);

CREATE INDEX IF NOT EXISTS `user_people_user_seen_idx`
  ON `user_people` (`user_id`, `latest_seen_at` DESC);

CREATE TABLE IF NOT EXISTS `user_person_mentions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `user_person_id` text NOT NULL REFERENCES `user_people`(`id`),
  `user_item_id` text NOT NULL REFERENCES `user_items`(`id`),
  `item_id` text NOT NULL REFERENCES `items`(`id`),
  `item_enrichment_id` text NOT NULL REFERENCES `item_enrichments`(`id`),
  `raw_name` text NOT NULL,
  `raw_type` text NOT NULL,
  `relationship` text NOT NULL DEFAULT 'MENTIONED',
  `confidence` real NOT NULL,
  `evidence_text` text,
  `seen_at` integer NOT NULL,
  `is_active` integer NOT NULL DEFAULT 1,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `user_person_mentions_user_item_person_idx`
  ON `user_person_mentions` (`user_id`, `user_item_id`, `user_person_id`);

CREATE INDEX IF NOT EXISTS `user_person_mentions_person_active_idx`
  ON `user_person_mentions` (`user_person_id`, `is_active`, `updated_at` DESC);

CREATE INDEX IF NOT EXISTS `user_person_mentions_user_item_idx`
  ON `user_person_mentions` (`user_id`, `item_id`);

CREATE INDEX IF NOT EXISTS `user_person_mentions_user_active_confidence_idx`
  ON `user_person_mentions` (`user_id`, `is_active`, `confidence` DESC);
