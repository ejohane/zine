CREATE TABLE `editorial_experiments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`edition_date` text NOT NULL,
	`status` text NOT NULL,
	`hypothesis` text NOT NULL,
	`change_summary` text NOT NULL,
	`desired_outcomes_json` text NOT NULL,
	`guardrails_json` text NOT NULL,
	`winning_variant_id` text,
	`promoted_edition_id` text,
	`failure_message` text,
	`abandonment_reason` text,
	`locked_at` integer,
	`decided_at` integer,
	`promoted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`promoted_edition_id`) REFERENCES `daily_editions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `editorial_experiments_user_status_idx` ON `editorial_experiments` (`user_id`,`status`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `editorial_experiments_user_date_idx` ON `editorial_experiments` (`user_id`,`edition_date`,`updated_at`);
--> statement-breakpoint
CREATE TABLE `editorial_experiment_variants` (
	`id` text PRIMARY KEY NOT NULL,
	`experiment_id` text NOT NULL,
	`user_id` text NOT NULL,
	`label` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`bundle_key` text NOT NULL,
	`content_hash` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`edition_id` text NOT NULL,
	`headline` text NOT NULL,
	`quality_score` real NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`experiment_id`) REFERENCES `editorial_experiments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `editorial_experiment_variants_experiment_label_idx` ON `editorial_experiment_variants` (`experiment_id`,`label`);
--> statement-breakpoint
CREATE INDEX `editorial_experiment_variants_user_experiment_idx` ON `editorial_experiment_variants` (`user_id`,`experiment_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `editorial_experiment_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`experiment_id` text NOT NULL,
	`user_id` text NOT NULL,
	`client_event_id` text NOT NULL,
	`preference` text NOT NULL,
	`notes` text NOT NULL,
	`payload_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`experiment_id`) REFERENCES `editorial_experiments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `editorial_experiment_reviews_user_client_event_idx` ON `editorial_experiment_reviews` (`user_id`,`client_event_id`);
--> statement-breakpoint
CREATE INDEX `editorial_experiment_reviews_experiment_created_idx` ON `editorial_experiment_reviews` (`experiment_id`,`created_at`);
