-- Created: 2026-02-20
-- Add cache table for RSS feed autodiscovery results.

CREATE TABLE `rss_discovery_cache` (
  `id` text PRIMARY KEY NOT NULL,
  `source_origin` text NOT NULL,
  `source_origin_hash` text NOT NULL,
  `source_url` text NOT NULL,
  `candidates_json` text NOT NULL,
  `status` text DEFAULT 'SUCCESS' NOT NULL,
  `last_error` text,
  `checked_at` integer NOT NULL,
  `expires_at` integer NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rss_discovery_cache_source_origin_idx` ON `rss_discovery_cache` (`source_origin`);
--> statement-breakpoint
CREATE INDEX `rss_discovery_cache_expires_idx` ON `rss_discovery_cache` (`expires_at`);
--> statement-breakpoint
CREATE INDEX `rss_discovery_cache_source_origin_hash_idx` ON `rss_discovery_cache` (`source_origin_hash`);
