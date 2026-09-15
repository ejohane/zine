ALTER TABLE rss_feeds ADD COLUMN feed_type TEXT NOT NULL DEFAULT 'ARTICLE';
ALTER TABLE rss_feeds ADD COLUMN baseline_entry_ids_json TEXT;
ALTER TABLE rss_feeds ADD COLUMN source_url TEXT;
ALTER TABLE rss_feeds ADD COLUMN source_player TEXT;
