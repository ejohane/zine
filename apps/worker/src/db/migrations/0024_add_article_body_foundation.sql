CREATE TABLE `article_body_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`schema_version` integer NOT NULL,
	`extractor_version` integer NOT NULL,
	`source_kind` text NOT NULL,
	`source_url` text NOT NULL,
	`content_hash` text NOT NULL,
	`r2_key` text NOT NULL,
	`word_count` integer NOT NULL,
	`reading_time_minutes` integer NOT NULL,
	`quality_score` real NOT NULL,
	`quality_warnings_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `article_body_versions_item_hash_idx` ON `article_body_versions` (`item_id`,`content_hash`);
--> statement-breakpoint
CREATE UNIQUE INDEX `article_body_versions_r2_key_idx` ON `article_body_versions` (`r2_key`);
--> statement-breakpoint
CREATE INDEX `article_body_versions_item_created_idx` ON `article_body_versions` (`item_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `article_body_states` (
	`item_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`current_version_id` text,
	`target_extractor_version` integer NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`last_http_status` integer,
	`last_attempt_at` integer,
	`next_attempt_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`current_version_id`) REFERENCES `article_body_versions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `article_body_states_status_next_attempt_idx` ON `article_body_states` (`status`,`next_attempt_at`);
--> statement-breakpoint
CREATE INDEX `article_body_states_updated_idx` ON `article_body_states` (`updated_at`);
--> statement-breakpoint
CREATE TABLE `article_body_dlq_events` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text,
	`extractor_version` integer,
	`trigger` text,
	`attempts` integer NOT NULL,
	`error_code` text,
	`dead_lettered_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `article_body_dlq_events_dead_lettered_idx` ON `article_body_dlq_events` (`dead_lettered_at`);
--> statement-breakpoint
CREATE INDEX `article_body_dlq_events_item_idx` ON `article_body_dlq_events` (`item_id`,`dead_lettered_at`);
