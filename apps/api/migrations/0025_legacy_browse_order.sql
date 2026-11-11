ALTER TABLE personal_items ADD COLUMN legacy_sort_id TEXT;
ALTER TABLE personal_items ADD COLUMN legacy_sort_anchor TEXT;

-- Backfill the original tie key once. Browse queries never parse import payloads.
WITH matched AS (
  SELECT p.id, MAX(r.legacy_id) AS source_id,
    p.status || ':' || CASE WHEN p.status='saved' THEN p.saved_at ELSE p.ingested_at END AS anchor
  FROM personal_items p JOIN legacy_import_records r ON r.owner_id=p.owner_id AND r.item_id=p.id
  WHERE r.section='items' AND r.payload_json IS NOT NULL AND (
    (p.status='saved' AND json_extract(r.payload_json,'$.bookmarked_at')=p.saved_at) OR
    (p.status='received' AND json_extract(r.payload_json,'$.state')='INBOX'
      AND json_extract(r.payload_json,'$.ingested_at')=p.ingested_at)
  )
  GROUP BY p.id
)
UPDATE personal_items AS p SET legacy_sort_id=m.source_id, legacy_sort_anchor=m.anchor
FROM matched m WHERE m.id=p.id;

CREATE INDEX personal_owner_saved_browse ON personal_items(
  owner_id,status,COALESCE(saved_at,created_at) DESC,
  (CASE WHEN legacy_sort_anchor=status || ':' || COALESCE(saved_at,created_at)
    THEN COALESCE(legacy_sort_id,id) ELSE id END) DESC,
  id DESC
);
CREATE INDEX personal_owner_received_browse ON personal_items(
  owner_id,status,COALESCE(ingested_at,created_at) DESC,
  (CASE WHEN legacy_sort_anchor=status || ':' || COALESCE(ingested_at,created_at)
    THEN COALESCE(legacy_sort_id,id) ELSE id END) DESC,
  id DESC
);

CREATE TRIGGER legacy_browse_order_insert AFTER INSERT ON legacy_import_records
WHEN new.section='items' AND new.item_id IS NOT NULL
BEGIN
  UPDATE personal_items SET (legacy_sort_id,legacy_sort_anchor)=(
    SELECT r.legacy_id,
      personal_items.status || ':' ||
        CASE WHEN personal_items.status='saved' THEN personal_items.saved_at ELSE personal_items.ingested_at END
    FROM legacy_import_records r WHERE r.owner_id=personal_items.owner_id
      AND r.item_id=personal_items.id AND r.section='items' AND r.payload_json IS NOT NULL AND (
        (personal_items.status='saved' AND json_extract(r.payload_json,'$.bookmarked_at')=personal_items.saved_at) OR
        (personal_items.status='received' AND json_extract(r.payload_json,'$.state')='INBOX'
          AND json_extract(r.payload_json,'$.ingested_at')=personal_items.ingested_at)
      )
    ORDER BY r.legacy_id DESC LIMIT 1
  ) WHERE owner_id=new.owner_id AND id=new.item_id;
END;

CREATE TRIGGER legacy_browse_order_update AFTER UPDATE OF payload_json,item_id ON legacy_import_records
WHEN new.section='items' AND (old.item_id IS NOT NULL OR new.item_id IS NOT NULL)
BEGIN
  UPDATE personal_items SET (legacy_sort_id,legacy_sort_anchor)=(
    SELECT r.legacy_id,
      personal_items.status || ':' ||
        CASE WHEN personal_items.status='saved' THEN personal_items.saved_at ELSE personal_items.ingested_at END
    FROM legacy_import_records r WHERE r.owner_id=personal_items.owner_id
      AND r.item_id=personal_items.id AND r.section='items' AND r.payload_json IS NOT NULL AND (
        (personal_items.status='saved' AND json_extract(r.payload_json,'$.bookmarked_at')=personal_items.saved_at) OR
        (personal_items.status='received' AND json_extract(r.payload_json,'$.state')='INBOX'
          AND json_extract(r.payload_json,'$.ingested_at')=personal_items.ingested_at)
      )
    ORDER BY r.legacy_id DESC LIMIT 1
  ) WHERE owner_id=new.owner_id AND id IN (old.item_id,new.item_id);
END;
