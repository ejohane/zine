-- Migration: Consolidate creator data into creators table
-- This migration moves all creator data from content table to creators table
-- and updates content table to only reference creator_id

-- Step 1: Insert unique creators from content table into creators table
-- Using INSERT OR REPLACE to handle any existing creators
INSERT OR REPLACE INTO creators (
  id,
  name,
  handle,
  avatar_url,
  verified,
  subscriber_count,
  follower_count,
  url,
  platforms,
  created_at,
  updated_at
)
SELECT DISTINCT
  creator_id as id,
  creator_name as name,
  creator_handle as handle,
  creator_thumbnail as avatar_url,
  creator_verified as verified,
  creator_subscriber_count as subscriber_count,
  creator_follower_count as follower_count,
  -- Construct URL based on platform
  CASE 
    WHEN creator_id LIKE 'youtube:%' THEN 
      'https://youtube.com/channel/' || REPLACE(creator_id, 'youtube:', '')
    WHEN creator_id LIKE 'spotify:%' THEN 
      'https://open.spotify.com/show/' || REPLACE(creator_id, 'spotify:', '')
    ELSE NULL
  END as url,
  -- Extract platform from creator_id prefix
  CASE
    WHEN creator_id LIKE 'youtube:%' THEN '["youtube"]'
    WHEN creator_id LIKE 'spotify:%' THEN '["spotify"]'
    ELSE '[]'
  END as platforms,
  COALESCE(created_at, CURRENT_TIMESTAMP) as created_at,
  COALESCE(updated_at, CURRENT_TIMESTAMP) as updated_at
FROM content
WHERE creator_id IS NOT NULL
  AND creator_name IS NOT NULL;

-- Step 2: Also migrate creators from subscriptions table
-- These might be different from content creators
INSERT OR REPLACE INTO creators (
  id,
  name,
  handle,
  avatar_url,
  url,
  platforms,
  subscriber_count,
  verified,
  created_at,
  updated_at
)
SELECT DISTINCT
  CASE 
    WHEN provider_id = 'youtube' THEN 'youtube:' || external_id
    WHEN provider_id = 'spotify' THEN 'spotify:' || external_id
    ELSE provider_id || ':' || external_id
  END as id,
  creator_name as name,
  NULL as handle, -- subscriptions table doesn't have handle
  thumbnail_url as avatar_url,
  subscription_url as url,
  CASE
    WHEN provider_id = 'youtube' THEN '["youtube"]'
    WHEN provider_id = 'spotify' THEN '["spotify"]'
    ELSE '["' || provider_id || '"]'
  END as platforms,
  subscriber_count,
  is_verified as verified,
  created_at,
  CURRENT_TIMESTAMP as updated_at
FROM subscriptions
WHERE creator_name IS NOT NULL
  AND NOT EXISTS (
    -- Don't overwrite if already exists from content table
    SELECT 1 FROM creators 
    WHERE creators.id = CASE 
      WHEN subscriptions.provider_id = 'youtube' THEN 'youtube:' || subscriptions.external_id
      WHEN subscriptions.provider_id = 'spotify' THEN 'spotify:' || subscriptions.external_id
      ELSE subscriptions.provider_id || ':' || subscriptions.external_id
    END
  );

-- Step 3: Update any content records that have creator info but no creator_id
-- This handles edge cases where we have creator_name but no creator_id
UPDATE content
SET creator_id = 'unknown:' || LOWER(REPLACE(creator_name, ' ', '_'))
WHERE creator_name IS NOT NULL 
  AND creator_id IS NULL;

-- Step 4: Insert these unknown creators into the creators table
INSERT OR IGNORE INTO creators (
  id,
  name,
  created_at,
  updated_at
)
SELECT DISTINCT
  creator_id,
  creator_name,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM content
WHERE creator_id LIKE 'unknown:%';

-- Step 5: Add foreign key constraint (for documentation, SQLite doesn't enforce)
-- This is commented out as SQLite doesn't support ALTER TABLE ADD CONSTRAINT
-- But documenting the relationship for clarity
-- ALTER TABLE content ADD CONSTRAINT fk_content_creator 
--   FOREIGN KEY (creator_id) REFERENCES creators(id);

-- Step 6: Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_content_creator_id ON content(creator_id);
CREATE INDEX IF NOT EXISTS idx_creators_platforms ON creators(platforms);
CREATE INDEX IF NOT EXISTS idx_creators_verified ON creators(verified);
CREATE INDEX IF NOT EXISTS idx_creators_updated ON creators(updated_at);

-- Note: The redundant creator columns in content table will be removed in a future migration
-- after verifying all systems are working with the new structure
-- Columns to remove later: creator_name, creator_handle, creator_thumbnail, 
--                         creator_verified, creator_subscriber_count, creator_follower_count