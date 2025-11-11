-- Migration: Link subscriptions to content_sources
-- Part of the Two-Tier Creator Model implementation
--
-- This migration adds a content_source_id foreign key to the subscriptions table
-- to establish the relationship between user subscriptions and content sources.
--
-- See: docs/features/creator-reconciliation/TWO_TIER_CREATOR_MODEL.md

-- Step 1: Add the content_source_id column
ALTER TABLE subscriptions ADD COLUMN content_source_id TEXT;

-- Step 2: Populate the content_source_id from existing data
UPDATE subscriptions
SET content_source_id = CASE 
  WHEN provider_id = 'youtube' THEN 'youtube:' || external_id
  WHEN provider_id = 'spotify' THEN 'spotify:' || external_id
  ELSE provider_id || ':' || external_id
END
WHERE external_id IS NOT NULL;

-- Step 3: Create index for efficient lookups
CREATE INDEX idx_subscriptions_content_source_id 
ON subscriptions(content_source_id);

-- Verification: Check all subscriptions are linked
SELECT 
  'Subscriptions with content_source_id' as check_name,
  COUNT(*) as count
FROM subscriptions
WHERE content_source_id IS NOT NULL;

SELECT 
  'Subscriptions without content_source_id' as check_name,
  COUNT(*) as count
FROM subscriptions
WHERE content_source_id IS NULL;

-- Verification: Validate the links are correct
SELECT 
  'Valid subscription-content_source links' as check_name,
  COUNT(*) as count
FROM subscriptions s
INNER JOIN content_sources cs ON s.content_source_id = cs.id;

-- Note: The foreign key constraint is not enforced in SQLite without explicit declaration,
-- but the index ensures efficient lookups. If foreign key enforcement is needed,
-- it would require recreating the table with the constraint.
