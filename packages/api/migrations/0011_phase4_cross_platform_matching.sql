-- Phase 4: Cross-Platform Content Matching

-- Create unified publishers table for cross-platform identity management
CREATE TABLE IF NOT EXISTS publishers (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL, -- Primary/official name
  alternative_names TEXT, -- JSON array of known aliases
  verified INTEGER DEFAULT 0, -- boolean
  primary_platform TEXT, -- Main platform (youtube/spotify)
  platform_identities TEXT NOT NULL, -- JSON object: {youtube: {id, name}, spotify: {id, name}}
  metadata TEXT, -- JSON object for additional data
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Create cross-platform content matches table
CREATE TABLE IF NOT EXISTS content_matches (
  id TEXT PRIMARY KEY,
  content_fingerprint TEXT NOT NULL,
  platform_a TEXT NOT NULL,
  content_id_a TEXT NOT NULL,
  platform_b TEXT NOT NULL,
  content_id_b TEXT NOT NULL,
  match_confidence REAL NOT NULL, -- 0.0 to 1.0
  match_reasons TEXT NOT NULL, -- JSON array of match factors
  verified INTEGER DEFAULT 0, -- boolean: Human-verified match
  created_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(content_id_a, content_id_b)
);

-- Add cross-platform matching fields to feed_items
ALTER TABLE feed_items ADD COLUMN content_fingerprint TEXT; -- Unique content identifier
ALTER TABLE feed_items ADD COLUMN publisher_canonical_id TEXT; -- Unified publisher ID
ALTER TABLE feed_items ADD COLUMN cross_platform_metadata TEXT; -- JSON object for matches
ALTER TABLE feed_items ADD COLUMN normalized_title TEXT; -- For fuzzy matching
ALTER TABLE feed_items ADD COLUMN episode_identifier TEXT; -- Standardized episode ID

-- Add indexes for efficient matching
CREATE INDEX IF NOT EXISTS idx_feed_items_fingerprint ON feed_items(content_fingerprint);
CREATE INDEX IF NOT EXISTS idx_feed_items_publisher_canonical ON feed_items(publisher_canonical_id);
CREATE INDEX IF NOT EXISTS idx_feed_items_normalized_title ON feed_items(normalized_title);
CREATE INDEX IF NOT EXISTS idx_content_matches_fingerprint ON content_matches(content_fingerprint);
CREATE INDEX IF NOT EXISTS idx_publishers_canonical_name ON publishers(canonical_name);
CREATE INDEX IF NOT EXISTS idx_publishers_primary_platform ON publishers(primary_platform);