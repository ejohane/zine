PRAGMA foreign_keys = ON;

CREATE TABLE content_items (
  id TEXT PRIMARY KEY,
  identity_key TEXT NOT NULL UNIQUE,
  canonical_url TEXT NOT NULL,
  platform TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE content_aliases (
  url TEXT PRIMARY KEY,
  content_id TEXT NOT NULL REFERENCES content_items(id)
);
CREATE TABLE content_relationships (
  from_id TEXT NOT NULL REFERENCES content_items(id),
  to_id TEXT NOT NULL REFERENCES content_items(id),
  relation TEXT NOT NULL,
  PRIMARY KEY (from_id, to_id, relation)
);
CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  identity_key TEXT NOT NULL,
  platform TEXT NOT NULL,
  url TEXT NOT NULL,
  name TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(owner_id,identity_key)
);
CREATE TABLE source_routes (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  url TEXT NOT NULL,
  kind TEXT NOT NULL,
  UNIQUE(source_id,url)
);
CREATE TABLE personal_items (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  content_id TEXT NOT NULL REFERENCES content_items(id),
  status TEXT NOT NULL CHECK(status IN ('received','saved','dismissed','deleted')),
  archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
  created_at TEXT NOT NULL,
  saved_at TEXT,
  updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  generation INTEGER NOT NULL DEFAULT 0,
  UNIQUE(owner_id,content_id),
  CHECK(status='saved' OR archived=0)
);
CREATE INDEX personal_owner_status ON personal_items(owner_id,status,saved_at DESC,id);
CREATE TABLE write_guards (
  id TEXT PRIMARY KEY,
  valid INTEGER NOT NULL CHECK(valid=1)
);
CREATE TABLE save_occurrences (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  item_id TEXT NOT NULL REFERENCES personal_items(id) ON DELETE CASCADE,
  contributor TEXT NOT NULL,
  route TEXT NOT NULL,
  subscription_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX occurrence_item ON save_occurrences(item_id,created_at);
CREATE TABLE context_entries (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES personal_items(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  origin TEXT NOT NULL CHECK(origin IN ('explicit','experience','inferred')),
  contributor TEXT NOT NULL,
  occurrence_id TEXT REFERENCES save_occurrences(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX context_item ON context_entries(item_id,created_at);
CREATE TABLE item_tags (
  item_id TEXT NOT NULL REFERENCES personal_items(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY(item_id,tag)
);
CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX collection_owner ON collections(owner_id,created_at,id);
CREATE TABLE collection_members (
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES personal_items(id) ON DELETE CASCADE,
  position REAL NOT NULL,
  PRIMARY KEY(collection_id,item_id)
);
CREATE INDEX collection_order ON collection_members(collection_id,position,item_id);
CREATE TABLE collection_notes (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  contributor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE collection_note_references (
  note_id TEXT NOT NULL REFERENCES collection_notes(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES personal_items(id) ON DELETE CASCADE,
  PRIMARY KEY(note_id,item_id)
);
CREATE TABLE progress (
  item_id TEXT PRIMARY KEY REFERENCES personal_items(id) ON DELETE CASCADE,
  position REAL,
  unit TEXT CHECK(unit IN ('seconds','fraction')),
  completed_at TEXT,
  contributor TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE annotations (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES personal_items(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('note','highlight','timestamp')),
  text TEXT,
  anchor_json TEXT,
  contributor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX annotation_item ON annotations(item_id,created_at,id);
CREATE TABLE contributions (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL REFERENCES content_items(id),
  owner_id TEXT,
  field TEXT NOT NULL,
  value_json TEXT,
  artifact_key TEXT,
  provenance_json TEXT NOT NULL,
  contributor TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('source','derived','correction')),
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK((value_json IS NULL) != (artifact_key IS NULL)),
  CHECK(owner_id IS NOT NULL OR category != 'correction')
);
CREATE INDEX contribution_access ON contributions(content_id,owner_id,field,priority DESC,created_at,id);
CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  source_id TEXT NOT NULL REFERENCES sources(id),
  route_id TEXT NOT NULL REFERENCES source_routes(id),
  auto_save INTEGER NOT NULL CHECK(auto_save IN (0,1)),
  filters_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active','unsubscribed')),
  initialized INTEGER NOT NULL DEFAULT 0,
  cursor_json TEXT,
  next_poll_at TEXT NOT NULL,
  last_success_at TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX subscription_due ON subscriptions(status,next_poll_at);
CREATE TABLE subscription_seen (
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  entry_key TEXT NOT NULL,
  PRIMARY KEY(subscription_id,entry_key)
);
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  item_id TEXT REFERENCES personal_items(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('enrich','sync','index')),
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','running','succeeded','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL,
  lease_until TEXT,
  lease_token TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX jobs_due ON jobs(status,available_at,lease_until);
CREATE INDEX jobs_item ON jobs(owner_id,item_id,created_at);
CREATE TABLE artifact_garbage (
  artifact_key TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);
CREATE TABLE enrichment_components (
  content_id TEXT NOT NULL REFERENCES content_items(id),
  owner_id TEXT NOT NULL,
  component TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','processing','available','unavailable','failed')),
  reason_code TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(content_id,owner_id,component)
);
CREATE TABLE idempotency (
  owner_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(owner_id,operation,key)
);
CREATE TABLE search_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id TEXT NOT NULL REFERENCES content_items(id),
  owner_id TEXT,
  contribution_id TEXT REFERENCES contributions(id) ON DELETE CASCADE,
  item_id TEXT REFERENCES personal_items(id) ON DELETE CASCADE,
  field TEXT NOT NULL,
  text TEXT NOT NULL,
  anchor_json TEXT
);
CREATE INDEX search_access ON search_documents(content_id,owner_id);
CREATE VIRTUAL TABLE search_fts USING fts5(text, content='search_documents', content_rowid='id', tokenize='unicode61');
CREATE TRIGGER search_insert AFTER INSERT ON search_documents BEGIN
  INSERT INTO search_fts(rowid,text) VALUES(new.id,new.text);
END;
CREATE TRIGGER search_delete AFTER DELETE ON search_documents BEGIN
  INSERT INTO search_fts(search_fts,rowid,text) VALUES('delete',old.id,old.text);
END;
CREATE TRIGGER search_update AFTER UPDATE ON search_documents BEGIN
  INSERT INTO search_fts(search_fts,rowid,text) VALUES('delete',old.id,old.text);
  INSERT INTO search_fts(rowid,text) VALUES(new.id,new.text);
END;
