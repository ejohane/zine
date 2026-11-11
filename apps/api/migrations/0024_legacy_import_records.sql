-- Keep each source record independently, including routes that resolve to a
-- single Next item. Payloads contain owner data and must exclude credentials.
ALTER TABLE personal_items ADD COLUMN ingested_at TEXT;
ALTER TABLE subscriptions ADD COLUMN intake_since_at TEXT;
CREATE UNIQUE INDEX personal_items_owner_id_id ON personal_items(owner_id,id);
CREATE TABLE legacy_import_records (
  owner_id TEXT NOT NULL,
  section TEXT NOT NULL,
  legacy_id TEXT NOT NULL,
  item_id TEXT,
  payload_json TEXT CHECK(payload_json IS NULL OR json_valid(payload_json)),
  applied_json TEXT CHECK(applied_json IS NULL OR json_valid(applied_json)),
  PRIMARY KEY(owner_id,section,legacy_id),
  FOREIGN KEY(owner_id,item_id) REFERENCES personal_items(owner_id,id) ON DELETE CASCADE
);
CREATE INDEX legacy_import_item ON legacy_import_records(owner_id,item_id);
