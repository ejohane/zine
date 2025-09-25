-- Add indexes for creator queries
CREATE INDEX IF NOT EXISTS idx_content_creator_id ON content(creator_id);
CREATE INDEX IF NOT EXISTS idx_content_creator_name ON content(creator_name);
CREATE INDEX IF NOT EXISTS idx_content_provider ON content(provider);
CREATE INDEX IF NOT EXISTS idx_creators_platform ON creators(id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_content_id ON bookmarks(content_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_content ON bookmarks(user_id, content_id);