-- Add indexes for efficient creator reconciliation queries
-- These indexes support the Creator Reconciliation feature which enables
-- cross-platform creator matching based on handles, URLs, and platform identifiers

-- Index on handle for fast @username lookups
CREATE INDEX IF NOT EXISTS idx_creators_handle ON creators(handle);

-- Index on url for domain-based matching (e.g., youtube.com/@username)
CREATE INDEX IF NOT EXISTS idx_creators_url ON creators(url);

-- Composite index on platforms array for platform-specific queries
-- Note: SQLite doesn't support functional indexes on JSON, but we can index the text column
-- The application layer will need to parse the JSON for filtering
CREATE INDEX IF NOT EXISTS idx_creators_platforms ON creators(platforms);

-- Index on updatedAt to efficiently find recently modified creators
CREATE INDEX IF NOT EXISTS idx_creators_updated_at ON creators(updated_at);

-- Composite index for common query patterns: platform filtering + recent updates
-- This supports queries like "find YouTube creators updated in the last week"
CREATE INDEX IF NOT EXISTS idx_creators_platforms_updated ON creators(platforms, updated_at);
