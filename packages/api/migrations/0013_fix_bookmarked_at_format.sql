-- Migration: Fix bookmarked_at format inconsistency
-- Convert integer timestamps to ISO 8601 string format for consistency
-- This affects approximately 14 bookmarks that were created via the feed-to-bookmark endpoint

-- Convert integer timestamps (milliseconds) to ISO 8601 format with 'Z' suffix
-- Format: YYYY-MM-DDTHH:MM:SS.SSSZ (e.g., "2025-10-31T16:11:59.631Z")
UPDATE bookmarks
SET bookmarked_at = strftime('%Y-%m-%dT%H:%M:%S.', bookmarked_at / 1000, 'unixepoch') || 
                    substr(printf('%03d', (bookmarked_at % 1000)), 1, 3) || 'Z'
WHERE typeof(bookmarked_at) = 'integer';
