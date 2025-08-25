-- Fix missing user_feed_items table in production
-- This script creates the user_feed_items table if it doesn't exist

CREATE TABLE IF NOT EXISTS `user_feed_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`feed_item_id` text NOT NULL,
	`is_read` integer DEFAULT false NOT NULL,
	`is_saved` integer DEFAULT false NOT NULL,
	`is_hidden` integer DEFAULT false NOT NULL,
	`read_at` integer,
	`saved_at` integer,
	`engagement_time` integer,
	`bookmark_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`feed_item_id`) REFERENCES `feed_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bookmark_id`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE no action
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS `idx_user_feed_items_user_feed` 
  ON `user_feed_items`(`user_id`, `feed_item_id`);

CREATE INDEX IF NOT EXISTS `idx_user_feed_items_user_read` 
  ON `user_feed_items`(`user_id`, `is_read`);

-- Populate user_feed_items for existing feed_items
-- This will create unread entries for all existing feed items for all users
INSERT OR IGNORE INTO `user_feed_items` (`id`, `user_id`, `feed_item_id`, `is_read`, `is_saved`, `is_hidden`, `created_at`)
SELECT 
  'ufi_' || hex(randomblob(16)) as id,
  us.user_id,
  fi.id as feed_item_id,
  0 as is_read,
  0 as is_saved,
  0 as is_hidden,
  unixepoch() as created_at
FROM feed_items fi
CROSS JOIN user_subscriptions us
WHERE fi.subscription_id = us.subscription_id;