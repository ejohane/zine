export const legacyProgressEligibilitySql = `WITH input AS (
  SELECT json_extract(value,'$.legacyId') AS legacy_id,
    json_extract(value,'$.itemId') AS item_id, json_extract(value,'$.position') AS position,
    json_extract(value,'$.unit') AS unit, json_extract(value,'$.completedAt') AS completed_at,
    json_extract(value,'$.updatedAt') AS updated_at FROM json_each(?)
), verified AS (
  SELECT i.* FROM input i JOIN personal_items p ON p.id=i.item_id
  WHERE p.owner_id=? AND p.status!='deleted'
    AND NOT EXISTS (SELECT 1 FROM item_aliases a WHERE a.owner_id=p.owner_id AND a.alias_item_id=p.id)
    AND EXISTS (SELECT 1 FROM idempotency r WHERE r.owner_id=p.owner_id AND r.operation='save'
      AND r.key='real-library-'||i.legacy_id AND json_extract(r.response_json,'$.item.id')=p.id)
)`;

export const insertLegacyProgressSql = `${legacyProgressEligibilitySql}
    INSERT INTO progress(item_id,position,unit,completed_at,updated_at,contributor)
    SELECT item_id,position,unit,completed_at,updated_at,'zine:legacy-import'
    FROM verified WHERE true ON CONFLICT(item_id) DO NOTHING RETURNING item_id`;
