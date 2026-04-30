-- Created: 2026-04-30
-- Add AI enrichment and embedding reference tables

CREATE TABLE IF NOT EXISTS `item_enrichments` (
  `id` text PRIMARY KEY NOT NULL,
  `item_id` text NOT NULL REFERENCES `items`(`id`),
  `schema_version` integer NOT NULL,
  `content_hash` text NOT NULL,
  `status` text NOT NULL,
  `model_provider` text,
  `model_name` text,
  `summary_short` text,
  `summary_detail` text,
  `primary_category` text,
  `secondary_categories_json` text,
  `topics_json` text,
  `entities_json` text,
  `intent` text,
  `difficulty` text,
  `evergreen_score` real,
  `time_sensitivity` text,
  `confidence_json` text,
  `error_message` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `enriched_at` integer
);

CREATE UNIQUE INDEX IF NOT EXISTS `item_enrichments_item_schema_hash_idx`
  ON `item_enrichments` (`item_id`, `schema_version`, `content_hash`);

CREATE INDEX IF NOT EXISTS `item_enrichments_item_idx`
  ON `item_enrichments` (`item_id`, `updated_at` DESC);

CREATE INDEX IF NOT EXISTS `item_enrichments_status_idx`
  ON `item_enrichments` (`status`, `updated_at` DESC);

CREATE TABLE IF NOT EXISTS `user_item_enrichments` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `user_item_id` text NOT NULL REFERENCES `user_items`(`id`),
  `item_id` text NOT NULL REFERENCES `items`(`id`),
  `schema_version` integer NOT NULL,
  `suggested_tags_json` text,
  `inferred_save_intent` text,
  `reason_to_revisit` text,
  `status` text NOT NULL,
  `error_message` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `enriched_at` integer
);

CREATE UNIQUE INDEX IF NOT EXISTS `user_item_enrichments_user_item_schema_idx`
  ON `user_item_enrichments` (`user_item_id`, `schema_version`);

CREATE INDEX IF NOT EXISTS `user_item_enrichments_user_idx`
  ON `user_item_enrichments` (`user_id`, `updated_at` DESC);

CREATE INDEX IF NOT EXISTS `user_item_enrichments_item_idx`
  ON `user_item_enrichments` (`item_id`, `updated_at` DESC);

CREATE INDEX IF NOT EXISTS `user_item_enrichments_status_idx`
  ON `user_item_enrichments` (`status`, `updated_at` DESC);

CREATE TABLE IF NOT EXISTS `item_embedding_refs` (
  `id` text PRIMARY KEY NOT NULL,
  `item_id` text NOT NULL REFERENCES `items`(`id`),
  `user_id` text REFERENCES `users`(`id`),
  `vector_id` text NOT NULL,
  `namespace` text NOT NULL,
  `embedding_model` text NOT NULL,
  `embedding_dimensions` integer NOT NULL,
  `content_hash` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `item_embedding_refs_vector_id_idx`
  ON `item_embedding_refs` (`vector_id`);

CREATE INDEX IF NOT EXISTS `item_embedding_refs_item_idx`
  ON `item_embedding_refs` (`item_id`, `updated_at` DESC);

CREATE INDEX IF NOT EXISTS `item_embedding_refs_user_idx`
  ON `item_embedding_refs` (`user_id`, `updated_at` DESC);
