#!/bin/bash

echo "Applying Phase 3 migration..."

# Add technical metadata fields
wrangler d1 execute zine-db2 --local --command="ALTER TABLE feed_items ADD COLUMN video_quality TEXT"
wrangler d1 execute zine-db2 --local --command="ALTER TABLE feed_items ADD COLUMN has_transcript INTEGER DEFAULT 0"
wrangler d1 execute zine-db2 --local --command="ALTER TABLE feed_items ADD COLUMN audio_languages TEXT"
wrangler d1 execute zine-db2 --local --command="ALTER TABLE feed_items ADD COLUMN audio_quality TEXT"

# Add aggregated metadata objects
wrangler d1 execute zine-db2 --local --command="ALTER TABLE feed_items ADD COLUMN statistics_metadata TEXT"
wrangler d1 execute zine-db2 --local --command="ALTER TABLE feed_items ADD COLUMN technical_metadata TEXT"

# Add calculated metrics
wrangler d1 execute zine-db2 --local --command="ALTER TABLE feed_items ADD COLUMN engagement_rate REAL"
wrangler d1 execute zine-db2 --local --command="ALTER TABLE feed_items ADD COLUMN trending_score REAL"

# Create indexes
wrangler d1 execute zine-db2 --local --command="CREATE INDEX IF NOT EXISTS idx_feed_items_has_captions ON feed_items(has_captions)"
wrangler d1 execute zine-db2 --local --command="CREATE INDEX IF NOT EXISTS idx_feed_items_has_hd ON feed_items(has_hd)"
wrangler d1 execute zine-db2 --local --command="CREATE INDEX IF NOT EXISTS idx_feed_items_engagement_rate ON feed_items(engagement_rate)"
wrangler d1 execute zine-db2 --local --command="CREATE INDEX IF NOT EXISTS idx_feed_items_trending_score ON feed_items(trending_score)"
wrangler d1 execute zine-db2 --local --command="CREATE INDEX IF NOT EXISTS idx_feed_items_content_type ON feed_items(content_type)"
wrangler d1 execute zine-db2 --local --command="CREATE INDEX IF NOT EXISTS idx_feed_items_language ON feed_items(language)"

# Update subscriptions table
wrangler d1 execute zine-db2 --local --command="ALTER TABLE subscriptions ADD COLUMN engagement_rate_avg REAL"
wrangler d1 execute zine-db2 --local --command="ALTER TABLE subscriptions ADD COLUMN popularity_avg INTEGER"
wrangler d1 execute zine-db2 --local --command="ALTER TABLE subscriptions ADD COLUMN upload_schedule TEXT"

echo "Phase 3 migration completed!"