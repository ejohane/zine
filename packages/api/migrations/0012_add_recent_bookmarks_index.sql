-- Migration: Add index for recent bookmarks query
-- Created: 2025-10-24
-- Purpose: Optimize query performance for recently accessed bookmarks

-- Create composite index for efficient recent bookmarks query
-- This supports the query: SELECT * FROM bookmarks WHERE user_id = ? AND last_accessed_at IS NOT NULL AND status = 'active' ORDER BY last_accessed_at DESC
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_last_accessed 
ON bookmarks(user_id, last_accessed_at DESC, status)
WHERE last_accessed_at IS NOT NULL;
