-- Phase 1: Add engagement metrics to feed_items
ALTER TABLE feed_items ADD COLUMN view_count INTEGER;
ALTER TABLE feed_items ADD COLUMN like_count INTEGER;
ALTER TABLE feed_items ADD COLUMN comment_count INTEGER;
ALTER TABLE feed_items ADD COLUMN popularity_score INTEGER; -- 0-100 normalized

-- Phase 1: Add classification fields to feed_items
ALTER TABLE feed_items ADD COLUMN language TEXT;
ALTER TABLE feed_items ADD COLUMN is_explicit INTEGER DEFAULT 0; -- boolean
ALTER TABLE feed_items ADD COLUMN content_type TEXT; -- 'video', 'podcast', 'short', 'live'
ALTER TABLE feed_items ADD COLUMN category TEXT;
ALTER TABLE feed_items ADD COLUMN tags TEXT; -- JSON array

-- Create indexes for commonly queried fields
CREATE INDEX IF NOT EXISTS idx_feed_items_content_type ON feed_items(content_type);
CREATE INDEX IF NOT EXISTS idx_feed_items_popularity ON feed_items(popularity_score);
CREATE INDEX IF NOT EXISTS idx_feed_items_published_at ON feed_items(published_at);