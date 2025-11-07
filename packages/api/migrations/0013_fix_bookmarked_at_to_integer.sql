-- Migration: Fix bookmarked_at format to integer (Unix timestamp in milliseconds)
-- The schema defines bookmarked_at as INTEGER NOT NULL, but some bookmarks were created
-- with ISO 8601 string format due to code using new Date().toISOString() instead of Date.now()
-- This migration converts all ISO string timestamps to integer milliseconds

-- Convert ISO 8601 string timestamps (e.g., "2025-10-02T23:45:50.035Z") to Unix milliseconds
-- Formula: Parse the ISO string to get Unix seconds, then multiply by 1000
-- SQLite's strftime('%s', ...) returns Unix seconds
UPDATE bookmarks
SET bookmarked_at = CAST((
  julianday(bookmarked_at) - 2440587.5
) * 86400000 AS INTEGER)
WHERE typeof(bookmarked_at) = 'text';
