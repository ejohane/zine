-- Add indexes for URL lookups to improve metadata query performance
CREATE INDEX IF NOT EXISTS idx_bookmarks_url ON bookmarks(url);
CREATE INDEX IF NOT EXISTS idx_bookmarks_original_url ON bookmarks(original_url);
CREATE INDEX IF NOT EXISTS idx_feed_items_external_url ON feed_items(external_url);