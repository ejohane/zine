-- Add disconnection tracking fields to subscriptions table
-- These fields help track when and why a subscription was marked as DISCONNECTED.
-- Used for debugging and user notification when a Spotify show becomes unavailable.

ALTER TABLE `subscriptions` ADD COLUMN `disconnected_at` integer;
ALTER TABLE `subscriptions` ADD COLUMN `disconnected_reason` text;
