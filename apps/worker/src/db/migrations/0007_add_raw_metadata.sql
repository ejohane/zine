-- Migration: Add raw_metadata column to items table
-- Purpose: Store complete provider API responses for future feature development
-- 
-- Use cases:
-- - FxTwitter: engagement metrics, polls, quote tweets, media arrays
-- - YouTube: full video details, channel info
-- - Spotify: episode details, show info
--
-- This column is nullable and stores JSON as TEXT.

ALTER TABLE `items` ADD `raw_metadata` text;
