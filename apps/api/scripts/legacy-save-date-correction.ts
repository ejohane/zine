/**
 * Correct only the synthetic decision left by the historical import.
 * Bind the owner first, then a private JSON array of reviewed corrections.
 */
const corrections = `
WITH owner(id) AS (VALUES (?)),
corrections AS (
  SELECT json_extract(value, '$.legacyId') AS legacy_id,
         json_extract(value, '$.itemId') AS item_id,
         json_extract(value, '$.sourceSavedAt') AS source_saved_at,
         json_extract(value, '$.importedAt') AS imported_at
  FROM json_each(?)
),
eligible AS (
SELECT p.id, c.source_saved_at
FROM personal_items p, corrections c, owner
WHERE p.owner_id = owner.id
  AND p.id = c.item_id
  AND p.status = 'saved'
  AND p.archived = 0
  AND p.saved_at = c.imported_at
  AND p.decision_at = c.imported_at
  AND c.source_saved_at != c.imported_at
  AND NOT EXISTS (
    SELECT 1 FROM item_aliases a WHERE a.owner_id = p.owner_id AND a.alias_item_id = p.id
  )
  AND EXISTS (
    SELECT 1 FROM idempotency r
    WHERE r.owner_id = p.owner_id
      AND r.operation = 'save'
      AND r.key = 'real-library-' || c.legacy_id
      AND r.created_at = c.imported_at
      AND json_extract(r.response_json, '$.item.id') = p.id
      AND json_extract(r.response_json, '$.save.outcome') = 'created'
  )
 )
`;

export const eligibleLegacySaveDatesSql = `${corrections} SELECT id FROM eligible ORDER BY id`;

export const correctLegacySaveDatesSql = `
${corrections}
UPDATE personal_items AS p
SET saved_at = c.source_saved_at, decision_at = c.source_saved_at, revision = p.revision + 1
FROM eligible c
WHERE p.id = c.id AND p.owner_id = (SELECT id FROM owner)
RETURNING id, saved_at, decision_at
`;
