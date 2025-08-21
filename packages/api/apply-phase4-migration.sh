#!/bin/bash

echo "Applying Phase 4 migration..."

# Create publishers table
wrangler d1 execute zine-db2 --local --command="CREATE TABLE IF NOT EXISTS publishers (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  alternative_names TEXT,
  verified INTEGER DEFAULT 0,
  primary_platform TEXT,
  platform_identities TEXT NOT NULL,
  metadata TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
)"

# Create content_matches table
wrangler d1 execute zine-db2 --local --command="CREATE TABLE IF NOT EXISTS content_matches (
  id TEXT PRIMARY KEY,
  content_fingerprint TEXT NOT NULL,
  platform_a TEXT NOT NULL,
  content_id_a TEXT NOT NULL,
  platform_b TEXT NOT NULL,
  content_id_b TEXT NOT NULL,
  match_confidence REAL NOT NULL,
  match_reasons TEXT NOT NULL,
  verified INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(content_id_a, content_id_b)
)"

# Add cross-platform matching fields to feed_items
wrangler d1 execute zine-db2 --local --command="ALTER TABLE feed_items ADD COLUMN content_fingerprint TEXT"
wrangler d1 execute zine-db2 --local --command="ALTER TABLE feed_items ADD COLUMN publisher_canonical_id TEXT"
wrangler d1 execute zine-db2 --local --command="ALTER TABLE feed_items ADD COLUMN cross_platform_metadata TEXT"
wrangler d1 execute zine-db2 --local --command="ALTER TABLE feed_items ADD COLUMN normalized_title TEXT"
wrangler d1 execute zine-db2 --local --command="ALTER TABLE feed_items ADD COLUMN episode_identifier TEXT"

# Create indexes
wrangler d1 execute zine-db2 --local --command="CREATE INDEX IF NOT EXISTS idx_feed_items_fingerprint ON feed_items(content_fingerprint)"
wrangler d1 execute zine-db2 --local --command="CREATE INDEX IF NOT EXISTS idx_feed_items_publisher_canonical ON feed_items(publisher_canonical_id)"
wrangler d1 execute zine-db2 --local --command="CREATE INDEX IF NOT EXISTS idx_feed_items_normalized_title ON feed_items(normalized_title)"
wrangler d1 execute zine-db2 --local --command="CREATE INDEX IF NOT EXISTS idx_content_matches_fingerprint ON content_matches(content_fingerprint)"
wrangler d1 execute zine-db2 --local --command="CREATE INDEX IF NOT EXISTS idx_publishers_canonical_name ON publishers(canonical_name)"
wrangler d1 execute zine-db2 --local --command="CREATE INDEX IF NOT EXISTS idx_publishers_primary_platform ON publishers(primary_platform)"

echo "Phase 4 migration completed!"