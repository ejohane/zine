-- Migration: Populate content_sources from existing subscriptions
-- Part of the Two-Tier Creator Model implementation
--
-- This migration creates content_source records from all existing subscriptions.
-- Each subscription represents a platform-specific content container (channel, show, etc.)
-- that users subscribe to, which is the first tier in the two-tier model.
--
-- See: docs/features/creator-reconciliation/TWO_TIER_CREATOR_MODEL.md

-- Insert content sources from subscriptions table
-- Using INSERT OR IGNORE to avoid conflicts if script is run multiple times
INSERT OR IGNORE INTO content_sources (
  id,
  external_id,
  platform,
  source_type,
  title,
  description,
  thumbnail_url,
  url,
  creator_id,
  creator_name,
  subscriber_count,
  total_episodes,
  video_count,
  is_verified,
  last_polled_at,
  etag,
  uploads_playlist_id,
  metadata,
  created_at,
  updated_at
)
SELECT
  -- Generate content_source ID: {platform}:{external_id}
  CASE 
    WHEN s.provider_id = 'youtube' THEN 'youtube:' || s.external_id
    WHEN s.provider_id = 'spotify' THEN 'spotify:' || s.external_id
    ELSE s.provider_id || ':' || s.external_id
  END as id,
  
  -- External ID from subscription
  s.external_id,
  
  -- Platform from provider_id
  s.provider_id as platform,
  
  -- Source type based on platform
  CASE 
    WHEN s.provider_id = 'youtube' THEN 'channel'
    WHEN s.provider_id = 'spotify' THEN 'show'
    ELSE 'unknown'
  END as source_type,
  
  -- Basic metadata
  s.title,
  s.description,
  s.thumbnail_url,
  COALESCE(s.subscription_url, '') as url,
  
  -- Creator relationship (will be populated by reconciliation service)
  -- For now, create a temporary creator_id based on subscription
  CASE 
    WHEN s.provider_id = 'youtube' THEN 'youtube:' || s.external_id
    WHEN s.provider_id = 'spotify' THEN 'spotify:' || s.external_id
    ELSE s.provider_id || ':' || s.external_id
  END as creator_id,
  
  s.creator_name,
  
  -- Platform-specific metrics
  s.subscriber_count,
  s.total_episodes,
  s.video_count,
  s.is_verified,
  
  -- Polling data
  s.last_polled_at,
  s.etag,
  s.uploads_playlist_id,
  
  -- Store additional metadata as JSON
  CASE
    WHEN s.channel_metadata IS NOT NULL THEN s.channel_metadata
    ELSE json_object(
      'content_categories', json(COALESCE(s.content_categories, '[]')),
      'primary_language', s.primary_language,
      'average_duration', s.average_duration,
      'upload_frequency', s.upload_frequency,
      'last_content_date', s.last_content_date,
      'total_content_count', s.total_content_count,
      'engagement_rate_avg', s.engagement_rate_avg,
      'popularity_avg', s.popularity_avg,
      'upload_schedule', s.upload_schedule
    )
  END as metadata,
  
  -- Timestamps
  s.created_at,
  CURRENT_TIMESTAMP as updated_at

FROM subscriptions s
JOIN subscription_providers sp ON s.provider_id = sp.id
WHERE s.external_id IS NOT NULL
  AND s.title IS NOT NULL
  AND s.creator_name IS NOT NULL;

-- Verification: Count the number of content sources created
SELECT 
  platform,
  source_type,
  COUNT(*) as count
FROM content_sources
GROUP BY platform, source_type
ORDER BY platform, source_type;

-- Verification: Check for any subscriptions that didn't get migrated
SELECT 
  'Subscriptions without content_sources' as check_name,
  COUNT(*) as count
FROM subscriptions s
WHERE NOT EXISTS (
  SELECT 1 
  FROM content_sources cs 
  WHERE cs.external_id = s.external_id 
    AND cs.platform = s.provider_id
);

-- Note: After this migration runs:
-- 1. All subscriptions will have corresponding content_sources
-- 2. creator_id in content_sources initially points to the channel/show itself
-- 3. The CreatorReconciliationService will later update creator_id to point to unified creators
-- 4. Subscriptions table remains unchanged for backward compatibility
