-- Created: 2026-07-26
-- Keep future items from any supported feed subscription out of Inbox when enabled.

ALTER TABLE `subscriptions` ADD COLUMN `auto_bookmark` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `rss_feeds` ADD COLUMN `auto_bookmark` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `newsletter_feeds` ADD COLUMN `auto_bookmark` integer NOT NULL DEFAULT 0;
