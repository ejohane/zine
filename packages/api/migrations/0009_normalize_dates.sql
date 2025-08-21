-- Normalize date formats to Unix timestamps (seconds since epoch)
-- This migration converts various date formats to consistent Unix timestamps

-- Bookmarks table
-- Convert ISO strings and millisecond timestamps to Unix timestamps (seconds)
UPDATE bookmarks 
SET 
  created_at = CASE
    -- If it's already a reasonable Unix timestamp in seconds, keep it
    WHEN CAST(created_at AS INTEGER) > 0 AND CAST(created_at AS INTEGER) < 4102444800 THEN CAST(created_at AS INTEGER)
    -- If it's in milliseconds (> 10 billion), convert to seconds
    WHEN CAST(created_at AS INTEGER) > 10000000000 THEN CAST(created_at AS INTEGER) / 1000
    -- If it's an ISO string, convert to Unix timestamp
    WHEN created_at LIKE '%-%-%T%' THEN CAST(strftime('%s', created_at) AS INTEGER)
    -- Default to current timestamp if invalid
    ELSE CAST(strftime('%s', 'now') AS INTEGER)
  END,
  updated_at = CASE
    WHEN CAST(updated_at AS INTEGER) > 0 AND CAST(updated_at AS INTEGER) < 4102444800 THEN CAST(updated_at AS INTEGER)
    WHEN CAST(updated_at AS INTEGER) > 10000000000 THEN CAST(updated_at AS INTEGER) / 1000
    WHEN updated_at LIKE '%-%-%T%' THEN CAST(strftime('%s', updated_at) AS INTEGER)
    ELSE CAST(strftime('%s', 'now') AS INTEGER)
  END
WHERE 
  -- Only update rows that need normalization
  created_at IS NOT NULL AND updated_at IS NOT NULL
  AND (
    CAST(created_at AS INTEGER) > 10000000000 
    OR created_at LIKE '%-%-%T%'
    OR CAST(updated_at AS INTEGER) > 10000000000
    OR updated_at LIKE '%-%-%T%'
  );

-- Feed items table  
-- Convert published_at and created_at fields (Note: feed_items table doesn't have updated_at)
UPDATE feed_items
SET
  published_at = CASE
    WHEN CAST(published_at AS INTEGER) > 0 AND CAST(published_at AS INTEGER) < 4102444800 THEN CAST(published_at AS INTEGER)
    WHEN CAST(published_at AS INTEGER) > 10000000000 THEN CAST(published_at AS INTEGER) / 1000
    WHEN published_at LIKE '%-%-%T%' THEN CAST(strftime('%s', published_at) AS INTEGER)
    WHEN published_at IS NULL THEN NULL
    ELSE CAST(strftime('%s', 'now') AS INTEGER)
  END,
  created_at = CASE
    WHEN CAST(created_at AS INTEGER) > 0 AND CAST(created_at AS INTEGER) < 4102444800 THEN CAST(created_at AS INTEGER)
    WHEN CAST(created_at AS INTEGER) > 10000000000 THEN CAST(created_at AS INTEGER) / 1000
    WHEN created_at LIKE '%-%-%T%' THEN CAST(strftime('%s', created_at) AS INTEGER)
    ELSE CAST(strftime('%s', 'now') AS INTEGER)
  END
WHERE
  -- Only update rows that need normalization
  (
    CAST(published_at AS INTEGER) > 10000000000
    OR published_at LIKE '%-%-%T%'
    OR CAST(created_at AS INTEGER) > 10000000000
    OR created_at LIKE '%-%-%T%'
  );

-- Subscriptions table
-- Normalize last_polled_at and date fields (Note: subscriptions table doesn't have updated_at)
UPDATE subscriptions
SET
  last_polled_at = CASE
    WHEN CAST(last_polled_at AS INTEGER) > 0 AND CAST(last_polled_at AS INTEGER) < 4102444800 THEN CAST(last_polled_at AS INTEGER)
    WHEN CAST(last_polled_at AS INTEGER) > 10000000000 THEN CAST(last_polled_at AS INTEGER) / 1000
    WHEN last_polled_at LIKE '%-%-%T%' THEN CAST(strftime('%s', last_polled_at) AS INTEGER)
    WHEN last_polled_at IS NULL THEN NULL
    ELSE CAST(strftime('%s', 'now') AS INTEGER)
  END,
  created_at = CASE
    WHEN CAST(created_at AS INTEGER) > 0 AND CAST(created_at AS INTEGER) < 4102444800 THEN CAST(created_at AS INTEGER)
    WHEN CAST(created_at AS INTEGER) > 10000000000 THEN CAST(created_at AS INTEGER) / 1000
    WHEN created_at LIKE '%-%-%T%' THEN CAST(strftime('%s', created_at) AS INTEGER)
    ELSE CAST(strftime('%s', 'now') AS INTEGER)
  END
WHERE
  -- Only update rows that need normalization
  (
    CAST(last_polled_at AS INTEGER) > 10000000000
    OR last_polled_at LIKE '%-%-%T%'
    OR CAST(created_at AS INTEGER) > 10000000000
    OR created_at LIKE '%-%-%T%'
  );

-- Users table
UPDATE users
SET
  created_at = CASE
    WHEN CAST(created_at AS INTEGER) > 0 AND CAST(created_at AS INTEGER) < 4102444800 THEN CAST(created_at AS INTEGER)
    WHEN CAST(created_at AS INTEGER) > 10000000000 THEN CAST(created_at AS INTEGER) / 1000
    WHEN created_at LIKE '%-%-%T%' THEN CAST(strftime('%s', created_at) AS INTEGER)
    ELSE CAST(strftime('%s', 'now') AS INTEGER)
  END,
  updated_at = CASE
    WHEN CAST(updated_at AS INTEGER) > 0 AND CAST(updated_at AS INTEGER) < 4102444800 THEN CAST(updated_at AS INTEGER)
    WHEN CAST(updated_at AS INTEGER) > 10000000000 THEN CAST(updated_at AS INTEGER) / 1000
    WHEN updated_at LIKE '%-%-%T%' THEN CAST(strftime('%s', updated_at) AS INTEGER)
    ELSE CAST(strftime('%s', 'now') AS INTEGER)
  END
WHERE
  -- Only update rows that need normalization
  (
    CAST(created_at AS INTEGER) > 10000000000
    OR created_at LIKE '%-%-%T%'
    OR CAST(updated_at AS INTEGER) > 10000000000
    OR updated_at LIKE '%-%-%T%'
  );