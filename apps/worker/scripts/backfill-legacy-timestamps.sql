-- Backfill legacy ISO8601 timestamps into *_ms columns
-- Preconditions: *_ms columns already exist from schema migration.
-- Run on staging before production and verify counts after.

-- users
UPDATE users
SET created_at_ms = CAST(strftime('%s', created_at) AS INTEGER) * 1000
WHERE created_at IS NOT NULL
  AND (created_at_ms IS NULL OR created_at_ms = 0)
  AND strftime('%s', created_at) IS NOT NULL;

UPDATE users
SET updated_at_ms = CAST(strftime('%s', updated_at) AS INTEGER) * 1000
WHERE updated_at IS NOT NULL
  AND (updated_at_ms IS NULL OR updated_at_ms = 0)
  AND strftime('%s', updated_at) IS NOT NULL;

-- items
UPDATE items
SET published_at_ms = CAST(strftime('%s', published_at) AS INTEGER) * 1000
WHERE published_at IS NOT NULL
  AND (published_at_ms IS NULL OR published_at_ms = 0)
  AND strftime('%s', published_at) IS NOT NULL;

UPDATE items
SET created_at_ms = CAST(strftime('%s', created_at) AS INTEGER) * 1000
WHERE created_at IS NOT NULL
  AND (created_at_ms IS NULL OR created_at_ms = 0)
  AND strftime('%s', created_at) IS NOT NULL;

UPDATE items
SET updated_at_ms = CAST(strftime('%s', updated_at) AS INTEGER) * 1000
WHERE updated_at IS NOT NULL
  AND (updated_at_ms IS NULL OR updated_at_ms = 0)
  AND strftime('%s', updated_at) IS NOT NULL;

-- user_items
UPDATE user_items
SET ingested_at_ms = CAST(strftime('%s', ingested_at) AS INTEGER) * 1000
WHERE ingested_at IS NOT NULL
  AND (ingested_at_ms IS NULL OR ingested_at_ms = 0)
  AND strftime('%s', ingested_at) IS NOT NULL;

UPDATE user_items
SET bookmarked_at_ms = CAST(strftime('%s', bookmarked_at) AS INTEGER) * 1000
WHERE bookmarked_at IS NOT NULL
  AND (bookmarked_at_ms IS NULL OR bookmarked_at_ms = 0)
  AND strftime('%s', bookmarked_at) IS NOT NULL;

UPDATE user_items
SET archived_at_ms = CAST(strftime('%s', archived_at) AS INTEGER) * 1000
WHERE archived_at IS NOT NULL
  AND (archived_at_ms IS NULL OR archived_at_ms = 0)
  AND strftime('%s', archived_at) IS NOT NULL;

UPDATE user_items
SET last_opened_at_ms = CAST(strftime('%s', last_opened_at) AS INTEGER) * 1000
WHERE last_opened_at IS NOT NULL
  AND (last_opened_at_ms IS NULL OR last_opened_at_ms = 0)
  AND strftime('%s', last_opened_at) IS NOT NULL;

UPDATE user_items
SET progress_updated_at_ms = CAST(strftime('%s', progress_updated_at) AS INTEGER) * 1000
WHERE progress_updated_at IS NOT NULL
  AND (progress_updated_at_ms IS NULL OR progress_updated_at_ms = 0)
  AND strftime('%s', progress_updated_at) IS NOT NULL;

UPDATE user_items
SET finished_at_ms = CAST(strftime('%s', finished_at) AS INTEGER) * 1000
WHERE finished_at IS NOT NULL
  AND (finished_at_ms IS NULL OR finished_at_ms = 0)
  AND strftime('%s', finished_at) IS NOT NULL;

UPDATE user_items
SET created_at_ms = CAST(strftime('%s', created_at) AS INTEGER) * 1000
WHERE created_at IS NOT NULL
  AND (created_at_ms IS NULL OR created_at_ms = 0)
  AND strftime('%s', created_at) IS NOT NULL;

UPDATE user_items
SET updated_at_ms = CAST(strftime('%s', updated_at) AS INTEGER) * 1000
WHERE updated_at IS NOT NULL
  AND (updated_at_ms IS NULL OR updated_at_ms = 0)
  AND strftime('%s', updated_at) IS NOT NULL;

-- sources
UPDATE sources
SET created_at_ms = CAST(strftime('%s', created_at) AS INTEGER) * 1000
WHERE created_at IS NOT NULL
  AND (created_at_ms IS NULL OR created_at_ms = 0)
  AND strftime('%s', created_at) IS NOT NULL;

UPDATE sources
SET updated_at_ms = CAST(strftime('%s', updated_at) AS INTEGER) * 1000
WHERE updated_at IS NOT NULL
  AND (updated_at_ms IS NULL OR updated_at_ms = 0)
  AND strftime('%s', updated_at) IS NOT NULL;

UPDATE sources
SET deleted_at_ms = CAST(strftime('%s', deleted_at) AS INTEGER) * 1000
WHERE deleted_at IS NOT NULL
  AND (deleted_at_ms IS NULL OR deleted_at_ms = 0)
  AND strftime('%s', deleted_at) IS NOT NULL;

-- provider_items_seen
UPDATE provider_items_seen
SET first_seen_at_ms = CAST(strftime('%s', first_seen_at) AS INTEGER) * 1000
WHERE first_seen_at IS NOT NULL
  AND (first_seen_at_ms IS NULL OR first_seen_at_ms = 0)
  AND strftime('%s', first_seen_at) IS NOT NULL;
