ALTER TABLE `article_body_dlq_events` ADD `resolved_at` integer;
--> statement-breakpoint
CREATE INDEX `article_body_dlq_events_resolved_idx` ON `article_body_dlq_events` (`resolved_at`,`dead_lettered_at`);
