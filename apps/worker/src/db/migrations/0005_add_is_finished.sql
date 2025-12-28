-- Add consumption tracking fields to user_items
-- is_finished: boolean tracking if user has consumed the content
-- finished_at: timestamp when user marked as finished (null if not finished)

ALTER TABLE `user_items` ADD `is_finished` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user_items` ADD `finished_at` text;
