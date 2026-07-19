CREATE TABLE IF NOT EXISTS `editorial_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `edition_date` text NOT NULL,
  `status` text NOT NULL,
  `edition_id` text,
  `snapshot_key` text,
  `candidate_artifact_key` text,
  `validation_key` text,
  `workflow_version` text NOT NULL,
  `prompt_version` text NOT NULL,
  `model` text NOT NULL,
  `x_run_ids_json` text NOT NULL,
  `error_message` text,
  `started_at` integer NOT NULL,
  `completed_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`edition_id`) REFERENCES `daily_editions`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE INDEX IF NOT EXISTS `editorial_runs_user_date_idx`
  ON `editorial_runs` (`user_id`, `edition_date`, `updated_at` DESC);
CREATE INDEX IF NOT EXISTS `editorial_runs_user_status_idx`
  ON `editorial_runs` (`user_id`, `status`, `updated_at` DESC);

CREATE TABLE IF NOT EXISTS `editorial_feedback_events` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `client_event_id` text NOT NULL,
  `edition_id` text NOT NULL,
  `target_type` text NOT NULL,
  `target_id` text NOT NULL,
  `event_type` text NOT NULL,
  `occurred_at` integer NOT NULL,
  `payload_hash` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`edition_id`) REFERENCES `daily_editions`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX IF NOT EXISTS `editorial_feedback_user_client_event_idx`
  ON `editorial_feedback_events` (`user_id`, `client_event_id`);
CREATE INDEX IF NOT EXISTS `editorial_feedback_user_occurred_idx`
  ON `editorial_feedback_events` (`user_id`, `occurred_at` DESC);
CREATE INDEX IF NOT EXISTS `editorial_feedback_edition_target_idx`
  ON `editorial_feedback_events` (`edition_id`, `target_type`, `target_id`, `occurred_at` DESC);
