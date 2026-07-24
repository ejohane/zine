ALTER TABLE `article_body_states` ADD `enrollment_trigger` text;
--> statement-breakpoint
ALTER TABLE `article_body_states` ADD `requested_at` integer;
--> statement-breakpoint
ALTER TABLE `article_body_states` ADD `terminal_at` integer;
--> statement-breakpoint
CREATE INDEX `article_body_states_trigger_status_idx` ON `article_body_states` (`enrollment_trigger`,`status`);
--> statement-breakpoint
CREATE INDEX `article_body_states_requested_idx` ON `article_body_states` (`requested_at`);
