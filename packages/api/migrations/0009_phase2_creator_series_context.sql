-- Phase 2: Add creator and series context to feed_items
ALTER TABLE feed_items ADD COLUMN creator_id TEXT;
ALTER TABLE feed_items ADD COLUMN creator_name TEXT;
ALTER TABLE feed_items ADD COLUMN creator_thumbnail TEXT;
ALTER TABLE feed_items ADD COLUMN creator_verified INTEGER DEFAULT 0; -- boolean
ALTER TABLE feed_items ADD COLUMN creator_subscriber_count INTEGER; -- YouTube
ALTER TABLE feed_items ADD COLUMN creator_follower_count INTEGER; -- Spotify

-- Phase 2: Add series/episode metadata
ALTER TABLE feed_items ADD COLUMN series_metadata TEXT; -- JSON object
ALTER TABLE feed_items ADD COLUMN series_id TEXT;
ALTER TABLE feed_items ADD COLUMN series_name TEXT;
ALTER TABLE feed_items ADD COLUMN episode_number INTEGER;
ALTER TABLE feed_items ADD COLUMN season_number INTEGER;
ALTER TABLE feed_items ADD COLUMN total_episodes_in_series INTEGER;
ALTER TABLE feed_items ADD COLUMN is_latest_episode INTEGER DEFAULT 0; -- boolean

-- Phase 2: Enrich subscriptions table
ALTER TABLE subscriptions ADD COLUMN subscriber_count INTEGER;
ALTER TABLE subscriptions ADD COLUMN is_verified INTEGER DEFAULT 0; -- boolean
ALTER TABLE subscriptions ADD COLUMN content_categories TEXT; -- JSON array
ALTER TABLE subscriptions ADD COLUMN primary_language TEXT;
ALTER TABLE subscriptions ADD COLUMN average_duration INTEGER; -- seconds
ALTER TABLE subscriptions ADD COLUMN upload_frequency TEXT; -- 'daily', 'weekly', 'monthly'
ALTER TABLE subscriptions ADD COLUMN last_content_date INTEGER; -- timestamp
ALTER TABLE subscriptions ADD COLUMN total_content_count INTEGER;
ALTER TABLE subscriptions ADD COLUMN channel_metadata TEXT; -- JSON for platform-specific data

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_feed_items_creator_id ON feed_items(creator_id);
CREATE INDEX IF NOT EXISTS idx_feed_items_series_id ON feed_items(series_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_verified ON subscriptions(is_verified);