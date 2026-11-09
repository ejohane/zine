CREATE TABLE item_aliases (
 alias_item_id TEXT PRIMARY KEY REFERENCES personal_items(id) ON DELETE CASCADE,
 owner_id TEXT NOT NULL,
 canonical_item_id TEXT NOT NULL REFERENCES personal_items(id) ON DELETE CASCADE,
 created_at TEXT NOT NULL,
 CHECK(alias_item_id!=canonical_item_id)
);
CREATE INDEX item_aliases_canonical ON item_aliases(owner_id,canonical_item_id);
CREATE TABLE reconciliation_events (
 id TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL,
 source_item_id TEXT NOT NULL REFERENCES personal_items(id) ON DELETE CASCADE,
 target_item_id TEXT NOT NULL REFERENCES personal_items(id) ON DELETE CASCADE,
 contributor TEXT NOT NULL,
 evidence_json TEXT NOT NULL,
 state_json TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX reconciliation_target ON reconciliation_events(owner_id,target_item_id,id);
CREATE TABLE item_relationships (
 id TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL,
 source_item_id TEXT NOT NULL REFERENCES personal_items(id) ON DELETE CASCADE,
 target_content_id TEXT NOT NULL REFERENCES content_items(id),
 kind TEXT NOT NULL CHECK(kind IN ('same_work','part_of','references','quotes','reply_to','related')),
 contributor TEXT NOT NULL,
 provenance_json TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX relationship_pair ON item_relationships(owner_id,source_item_id,target_content_id,kind,contributor);
CREATE INDEX relationships_source ON item_relationships(owner_id,source_item_id,id);
CREATE INDEX relationships_target ON item_relationships(owner_id,target_content_id,id);
ALTER TABLE personal_items ADD COLUMN decision_at TEXT;
ALTER TABLE personal_items ADD COLUMN decision_origin TEXT NOT NULL DEFAULT 'automatic' CHECK(decision_origin IN ('explicit','automatic'));
UPDATE personal_items SET decision_at=CASE WHEN status IN ('dismissed','deleted') OR archived=1 THEN updated_at ELSE COALESCE(saved_at,created_at) END,decision_origin=CASE WHEN EXISTS(SELECT 1 FROM save_occurrences s WHERE s.item_id=personal_items.id AND s.route='explicit') THEN 'explicit' ELSE 'automatic' END;
