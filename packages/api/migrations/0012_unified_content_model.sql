-- Phase 1: Bookmark Data Quality Enhancement
-- Unified Content Model Implementation
-- This migration creates a new unified content table as the single source of truth
-- for all content metadata, and simplifies the bookmarks, feed_items, and user_feed_items tables

-- Step 1: Drop existing tables (we have no production data)
DROP TABLE IF EXISTS user_feed_items;
DROP TABLE IF EXISTS bookmarks;
DROP TABLE IF EXISTS feed_items;

-- Step 2: Create the unified content table
CREATE TABLE content (
  -- Primary identification
  id TEXT PRIMARY KEY, -- Format: "{provider}-{external_id}"
  external_id TEXT NOT NULL,
  provider TEXT NOT NULL, -- 'youtube', 'spotify', 'twitter', 'web'

  -- Core metadata
  url TEXT NOT NULL,
  canonical_url TEXT, -- Normalized URL
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  favicon_url TEXT,
  published_at INTEGER, -- Unix timestamp
  duration_seconds INTEGER,

  -- Engagement metrics (Phase 1 fields)
  view_count INTEGER,
  like_count INTEGER,
  comment_count INTEGER,
  share_count INTEGER,
  save_count INTEGER,
  popularity_score INTEGER, -- 0-100 normalized
  engagement_rate REAL, -- Decimal 0-1
  trending_score INTEGER, -- 0-100

  -- Creator/Publisher information (Phase 2 fields)
  creator_id TEXT,
  creator_name TEXT,
  creator_handle TEXT,
  creator_thumbnail TEXT,
  creator_verified INTEGER DEFAULT 0, -- Boolean
  creator_subscriber_count INTEGER,
  creator_follower_count INTEGER,

  -- Series/Episode context (Phase 2 fields)
  series_id TEXT,
  series_name TEXT,
  episode_number INTEGER,
  season_number INTEGER,
  total_episodes_in_series INTEGER,
  is_latest_episode INTEGER DEFAULT 0, -- Boolean
  series_metadata TEXT, -- JSON for additional series data

  -- Content classification (Phase 1 fields)
  content_type TEXT, -- 'video', 'podcast', 'article', 'post', 'short', 'live'
  category TEXT,
  subcategory TEXT,
  language TEXT, -- ISO 639-1 code
  is_explicit INTEGER DEFAULT 0, -- Boolean
  age_restriction TEXT,
  tags TEXT, -- JSON array of content tags
  topics TEXT, -- JSON array of detected topics

  -- Technical metadata (Phase 3 fields)
  has_captions INTEGER DEFAULT 0, -- Boolean
  has_transcript INTEGER DEFAULT 0, -- Boolean
  has_hd INTEGER DEFAULT 0, -- Boolean
  has_4k INTEGER DEFAULT 0, -- Boolean
  video_quality TEXT, -- '480p', '720p', '1080p', '4K'
  audio_quality TEXT, -- 'low', 'medium', 'high', 'lossless'
  audio_languages TEXT, -- JSON array of ISO 639-1 codes
  caption_languages TEXT, -- JSON array of ISO 639-1 codes

  -- Cross-platform matching (Phase 4 fields)
  content_fingerprint TEXT, -- SHA-256 hash for matching
  publisher_canonical_id TEXT, -- Unified publisher ID
  normalized_title TEXT, -- For fuzzy matching
  episode_identifier TEXT, -- Standardized episode ID
  cross_platform_matches TEXT, -- JSON array of matches

  -- Aggregated metadata objects for flexibility
  statistics_metadata TEXT, -- JSON: platform-specific stats
  technical_metadata TEXT, -- JSON: platform-specific technical details
  enrichment_metadata TEXT, -- JSON: API response data
  extended_metadata TEXT, -- JSON: future expansion fields

  -- Tracking
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_enriched_at INTEGER,
  enrichment_version INTEGER DEFAULT 1,
  enrichment_source TEXT, -- 'api', 'oembed', 'opengraph', 'manual'

  -- Constraints
  UNIQUE(provider, external_id)
);

-- Create indexes for the content table
CREATE INDEX idx_content_url ON content(url);
CREATE INDEX idx_content_canonical_url ON content(canonical_url);
CREATE INDEX idx_content_fingerprint ON content(content_fingerprint);
CREATE INDEX idx_content_publisher ON content(publisher_canonical_id);
CREATE INDEX idx_content_creator ON content(creator_id);
CREATE INDEX idx_content_series ON content(series_id);
CREATE INDEX idx_content_updated ON content(updated_at);
CREATE INDEX idx_content_type_provider ON content(content_type, provider);

-- Step 3: Create simplified bookmarks table
CREATE TABLE bookmarks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  content_id TEXT NOT NULL,

  -- User-specific data only
  notes TEXT,
  user_tags TEXT, -- JSON array of user's personal tags
  collections TEXT, -- JSON array of collection IDs
  status TEXT DEFAULT 'active', -- 'active', 'archived', 'deleted'
  is_favorite INTEGER DEFAULT 0, -- Boolean
  read_progress INTEGER, -- Percentage for articles/videos

  -- User timestamps
  bookmarked_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_accessed_at INTEGER,
  archived_at INTEGER,

  -- Foreign keys and constraints
  FOREIGN KEY (content_id) REFERENCES content(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, content_id)
);

-- Create indexes for bookmarks
CREATE INDEX idx_user_bookmarks ON bookmarks(user_id, status, bookmarked_at DESC);
CREATE INDEX idx_user_favorites ON bookmarks(user_id, is_favorite, bookmarked_at DESC);

-- Step 4: Create simplified feed_items table
CREATE TABLE feed_items (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL,
  content_id TEXT NOT NULL,

  -- Feed-specific data only
  added_to_feed_at INTEGER NOT NULL DEFAULT (unixepoch()),
  position_in_feed INTEGER, -- For maintaining feed order

  -- Foreign keys and constraints
  FOREIGN KEY (content_id) REFERENCES content(id) ON DELETE CASCADE,
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
  UNIQUE(subscription_id, content_id)
);

-- Create indexes for feed_items
CREATE INDEX idx_subscription_feed ON feed_items(subscription_id, added_to_feed_at DESC);
CREATE INDEX idx_feed_content ON feed_items(content_id);

-- Step 5: Create user_feed_items table for user interactions
CREATE TABLE user_feed_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  feed_item_id TEXT NOT NULL,

  -- Interaction tracking
  is_read INTEGER DEFAULT 0, -- Boolean
  is_saved INTEGER DEFAULT 0, -- Boolean
  is_hidden INTEGER DEFAULT 0, -- Boolean
  read_at INTEGER,
  saved_at INTEGER,
  engagement_time INTEGER, -- Seconds spent

  -- Connection to bookmark if saved
  bookmark_id TEXT,

  -- Timestamps
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),

  -- Foreign keys and constraints
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (feed_item_id) REFERENCES feed_items(id) ON DELETE CASCADE,
  FOREIGN KEY (bookmark_id) REFERENCES bookmarks(id) ON DELETE SET NULL,
  UNIQUE(user_id, feed_item_id)
);

-- Create indexes for user_feed_items
CREATE INDEX idx_user_unread ON user_feed_items(user_id, is_read, feed_item_id);
CREATE INDEX idx_user_feed_saved ON user_feed_items(user_id, is_saved);
CREATE INDEX idx_user_feed_hidden ON user_feed_items(user_id, is_hidden);