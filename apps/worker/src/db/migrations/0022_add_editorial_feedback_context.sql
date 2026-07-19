ALTER TABLE `editorial_feedback_events`
  ADD `target_topics_json` text NOT NULL DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE `editorial_feedback_events`
  ADD `target_creators_json` text NOT NULL DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE `editorial_feedback_events`
  ADD `target_canonical_urls_json` text NOT NULL DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE `editorial_feedback_events`
  ADD `target_source_ids_json` text NOT NULL DEFAULT '[]';
