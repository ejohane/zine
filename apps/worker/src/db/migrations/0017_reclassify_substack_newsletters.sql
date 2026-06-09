-- Reclassify Gmail-delivered Substack article items by content platform.
-- Gmail newsletter feed/message tables still preserve the delivery source.
UPDATE items
SET
  provider = 'SUBSTACK',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE
  provider = 'GMAIL'
  AND (
    lower(canonical_url) GLOB 'http://*.substack.com/p/*'
    OR lower(canonical_url) GLOB 'https://*.substack.com/p/*'
    OR lower(canonical_url) GLOB 'http://open.substack.com/pub/*/p/*'
    OR lower(canonical_url) GLOB 'https://open.substack.com/pub/*/p/*'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM items AS existing_substack
    WHERE
      existing_substack.provider = 'SUBSTACK'
      AND existing_substack.provider_id = items.provider_id
  );
