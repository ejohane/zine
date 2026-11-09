-- Register uploads before R2 writes so interrupted and ambiguous writes stay recoverable.
CREATE TABLE material_artifacts (
  artifact_key TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  item_id TEXT NOT NULL REFERENCES personal_items(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
CREATE INDEX material_artifacts_owner_item ON material_artifacts(owner_id,item_id);
INSERT OR IGNORE INTO material_artifacts(artifact_key,owner_id,item_id,created_at)
SELECT d.artifact_key,d.owner_id,p.id,d.created_at FROM contributions d
JOIN personal_items p ON p.owner_id=d.owner_id AND p.content_id=d.content_id
WHERE d.artifact_key IS NOT NULL AND d.owner_id IS NOT NULL;
