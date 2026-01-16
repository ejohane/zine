-- Dead Letter Queue for failed ingestion items
-- Stores items that failed during ingestion for later retry or manual review.
-- This prevents permanent data loss when ingestion fails due to transient errors.

CREATE TABLE `dead_letter_queue` (
  `id` text PRIMARY KEY NOT NULL,
  `subscription_id` text REFERENCES `subscriptions`(`id`),
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `provider` text NOT NULL,
  `provider_id` text NOT NULL,
  `raw_data` text NOT NULL,
  `error_message` text NOT NULL,
  `error_type` text,
  `error_stack` text,
  `retry_count` integer NOT NULL DEFAULT 0,
  `last_retry_at` integer,
  `status` text NOT NULL DEFAULT 'pending',
  `created_at` integer NOT NULL
);

-- Fast queries for pending items to retry
CREATE INDEX `dlq_status_idx` ON `dead_letter_queue` (`status`);

-- Fast queries by user
CREATE INDEX `dlq_user_idx` ON `dead_letter_queue` (`user_id`);

-- Index for finding duplicate entries for the same provider item
CREATE INDEX `dlq_provider_item_idx` ON `dead_letter_queue` (`provider`, `provider_id`, `user_id`);
