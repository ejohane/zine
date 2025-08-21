-- Phase 3: Advanced Metadata (Technical details and categorization)

-- Add technical metadata fields to feed_items
ALTER TABLE feed_items ADD COLUMN has_captions INTEGER DEFAULT 0; -- boolean
ALTER TABLE feed_items ADD COLUMN has_hd INTEGER DEFAULT 0; -- boolean
ALTER TABLE feed_items ADD COLUMN video_quality TEXT; -- '1080p', '4K', etc.
ALTER TABLE feed_items ADD COLUMN has_transcript INTEGER DEFAULT 0; -- boolean
ALTER TABLE feed_items ADD COLUMN audio_languages TEXT; -- JSON array of ISO 639-1 codes
ALTER TABLE feed_items ADD COLUMN audio_quality TEXT; -- 'high', 'medium', 'low'

-- Add aggregated metadata objects for flexibility
ALTER TABLE feed_items ADD COLUMN statistics_metadata TEXT; -- JSON object for engagement metrics
ALTER TABLE feed_items ADD COLUMN technical_metadata TEXT; -- JSON object for technical details

-- Add calculated metrics
ALTER TABLE feed_items ADD COLUMN engagement_rate REAL; -- (likes + comments) / views
ALTER TABLE feed_items ADD COLUMN trending_score REAL; -- Calculated trending score

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_feed_items_has_captions ON feed_items(has_captions);
CREATE INDEX IF NOT EXISTS idx_feed_items_has_hd ON feed_items(has_hd);
CREATE INDEX IF NOT EXISTS idx_feed_items_engagement_rate ON feed_items(engagement_rate);
CREATE INDEX IF NOT EXISTS idx_feed_items_trending_score ON feed_items(trending_score);
CREATE INDEX IF NOT EXISTS idx_feed_items_content_type ON feed_items(content_type);
CREATE INDEX IF NOT EXISTS idx_feed_items_language ON feed_items(language);

-- Update subscriptions table with calculated metrics
ALTER TABLE subscriptions ADD COLUMN engagement_rate_avg REAL; -- Average engagement rate
ALTER TABLE subscriptions ADD COLUMN popularity_avg INTEGER; -- Average popularity score
ALTER TABLE subscriptions ADD COLUMN upload_schedule TEXT; -- JSON object with schedule analysis