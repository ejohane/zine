ALTER TABLE `creators` ADD `verified` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `creators` ADD `subscriber_count` integer;--> statement-breakpoint
ALTER TABLE `creators` ADD `follower_count` integer;