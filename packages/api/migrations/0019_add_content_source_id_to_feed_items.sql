-- Migration: Add content_source_id to feed_items
-- Part of the Two-Tier Creator Model implementation
--
-- This migration adds a content_source_id column to feed_items for direct reference
-- to the content source, enabling efficient queries without joining through subscriptions.
--
-- See: docs/features/creator-reconciliation/TWO_TIER_CREATOR_MODEL.md

-- Step 1: Add the content_source_id column
ALTER TABLE feed_items ADD COLUMN content_source_id TEXT;

-- Step 2: Populate content_source_id from subscriptions
UPDATE feed_items
SET content_source_id = (
  SELECT s.content_source_id
  FROM subscriptions s
  WHERE s.id = feed_items.subscription_id
)
WHERE subscription_id IS NOT NULL;

-- Step 3: Create index for efficient lookups
CREATE INDEX idx_feed_items_content_source_id 
ON feed_items(content_source_id);

-- Step 4: Create compound index for content_source + time-based queries
CREATE INDEX idx_feed_items_content_source_time
ON feed_items(content_source_id, added_to_feed_at DESC);

-- Verification: Check all feed items have content_source_id
SELECT 
  'Feed items with content_source_id' as check_name,
  COUNT(*) as count
FROM feed_items
WHERE content_source_id IS NOT NULL;

SELECT 
  'Feed items without content_source_id' as check_name,
  COUNT(*) as count
FROM feed_items
WHERE content_source_id IS NULL;

-- Verification: Validate the links are correct
SELECT 
  'Valid feed_item-content_source links' as check_name,
  COUNT(*) as count
FROM feed_items fi
INNER JOIN content_sources cs ON fi.content_source_id = cs.id;
