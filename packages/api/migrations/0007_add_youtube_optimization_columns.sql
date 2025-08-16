-- Add YouTube optimization columns to subscriptions table
ALTER TABLE subscriptions ADD COLUMN video_count INTEGER DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN uploads_playlist_id TEXT;
ALTER TABLE subscriptions ADD COLUMN etag TEXT;

-- Create indexes for efficient queries
CREATE INDEX idx_subscriptions_video_count ON subscriptions(provider_id, video_count);
CREATE INDEX idx_subscriptions_uploads_playlist ON subscriptions(uploads_playlist_id);