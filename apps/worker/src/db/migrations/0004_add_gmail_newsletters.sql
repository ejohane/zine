-- Created: 2026-02-07
-- Add Gmail mailbox + newsletter ingestion tables

CREATE TABLE IF NOT EXISTS `gmail_mailboxes` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `provider_connection_id` text NOT NULL REFERENCES `provider_connections`(`id`),
  `google_sub` text NOT NULL,
  `email` text NOT NULL,
  `history_id` text,
  `watch_expiration_at` integer,
  `last_sync_at` integer,
  `last_sync_status` text NOT NULL DEFAULT 'IDLE',
  `last_sync_error` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `gmail_mailboxes_user_connection_idx`
  ON `gmail_mailboxes` (`user_id`, `provider_connection_id`);

CREATE INDEX IF NOT EXISTS `gmail_mailboxes_sync_idx`
  ON `gmail_mailboxes` (`last_sync_status`, `updated_at`);

CREATE TABLE IF NOT EXISTS `newsletter_feeds` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `gmail_mailbox_id` text NOT NULL REFERENCES `gmail_mailboxes`(`id`),
  `canonical_key` text NOT NULL,
  `list_id` text,
  `from_address` text,
  `display_name` text,
  `unsubscribe_mailto` text,
  `unsubscribe_url` text,
  `unsubscribe_post_header` text,
  `detection_score` real NOT NULL,
  `status` text NOT NULL DEFAULT 'ACTIVE',
  `first_seen_at` integer NOT NULL,
  `last_seen_at` integer NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `newsletter_feeds_user_canonical_key_idx`
  ON `newsletter_feeds` (`user_id`, `canonical_key`);

CREATE INDEX IF NOT EXISTS `newsletter_feeds_mailbox_status_idx`
  ON `newsletter_feeds` (`gmail_mailbox_id`, `status`, `last_seen_at`);

CREATE TABLE IF NOT EXISTS `newsletter_feed_messages` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `gmail_mailbox_id` text NOT NULL REFERENCES `gmail_mailboxes`(`id`),
  `newsletter_feed_id` text NOT NULL REFERENCES `newsletter_feeds`(`id`),
  `gmail_message_id` text NOT NULL,
  `gmail_thread_id` text,
  `item_id` text NOT NULL REFERENCES `items`(`id`),
  `internal_date` integer,
  `created_at` integer NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `newsletter_feed_messages_user_message_idx`
  ON `newsletter_feed_messages` (`user_id`, `gmail_message_id`);

CREATE INDEX IF NOT EXISTS `newsletter_feed_messages_feed_date_idx`
  ON `newsletter_feed_messages` (`newsletter_feed_id`, `internal_date`);

CREATE TABLE IF NOT EXISTS `newsletter_unsubscribe_events` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `newsletter_feed_id` text NOT NULL REFERENCES `newsletter_feeds`(`id`),
  `method` text NOT NULL,
  `target` text NOT NULL,
  `status` text NOT NULL,
  `error` text,
  `requested_at` integer NOT NULL,
  `completed_at` integer
);

CREATE INDEX IF NOT EXISTS `newsletter_unsubscribe_feed_idx`
  ON `newsletter_unsubscribe_events` (`newsletter_feed_id`, `requested_at`);

CREATE INDEX IF NOT EXISTS `newsletter_unsubscribe_user_idx`
  ON `newsletter_unsubscribe_events` (`user_id`, `requested_at`);
