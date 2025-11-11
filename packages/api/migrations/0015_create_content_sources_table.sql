-- Migration: Create content_sources table
-- Part of the Two-Tier Creator Model implementation
-- 
-- This table separates content sources (what users subscribe to) from creators (who creates content).
-- Content sources are platform-specific containers like YouTube channels, Spotify shows, etc.
-- They link to creators via the creator_id foreign key.
--
-- See: docs/features/creator-reconciliation/TWO_TIER_CREATOR_MODEL.md

CREATE TABLE content_sources (
  -- Identity
  id TEXT PRIMARY KEY,                    -- Format: {platform}:{external_id}
                                          -- e.g., "youtube:UCzQUP1qoWDoEbmsQxvdjxgQ"
                                          --       "spotify:4rOoJ6Egrf8K2IrywzwOMk"
  external_id TEXT NOT NULL,              -- Platform's ID for this source
  platform TEXT NOT NULL,                 -- 'youtube', 'spotify', 'rss'
  source_type TEXT NOT NULL,              -- 'channel', 'show', 'playlist', 'series'
  
  -- Metadata
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  url TEXT NOT NULL,                      -- Canonical URL
  
  -- Creator relationship
  creator_id TEXT,                        -- Links to creators table
  creator_name TEXT,                      -- Display name from platform
  
  -- Platform-specific metrics
  subscriber_count INTEGER,               -- YouTube subscribers
  total_episodes INTEGER,                 -- Spotify episode count
  video_count INTEGER,                    -- YouTube video count
  is_verified INTEGER DEFAULT 0,          -- Boolean: verified on platform
  
  -- Polling data
  last_polled_at INTEGER,                 -- Timestamp of last successful poll
  etag TEXT,                              -- For conditional requests
  uploads_playlist_id TEXT,               -- YouTube specific: uploads playlist
  
  -- Flexible metadata
  metadata TEXT,                          -- JSON for platform-specific data
  
  -- Timestamps
  created_at INTEGER NOT NULL,            -- Timestamp (ms since epoch)
  updated_at INTEGER NOT NULL,            -- Timestamp (ms since epoch)
  
  -- Constraints
  UNIQUE(platform, external_id),          -- One content source per platform+external_id
  FOREIGN KEY (creator_id) REFERENCES creators(id)
);

-- Indexes for efficient queries

-- Index on platform for filtering by platform
CREATE INDEX idx_content_sources_platform ON content_sources(platform);

-- Index on creator_id for finding all sources by creator
CREATE INDEX idx_content_sources_creator_id ON content_sources(creator_id);

-- Index on source_type for filtering by type (channel, show, etc.)
CREATE INDEX idx_content_sources_source_type ON content_sources(source_type);

-- Composite index for platform + creator queries
CREATE INDEX idx_content_sources_platform_creator ON content_sources(platform, creator_id);

-- Index on last_polled_at for finding stale sources that need polling
CREATE INDEX idx_content_sources_last_polled ON content_sources(last_polled_at);

-- Composite index for platform + external_id lookups (supports UNIQUE constraint)
CREATE INDEX idx_content_sources_platform_external ON content_sources(platform, external_id);
