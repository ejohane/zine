CREATE TABLE index_requests (
  item_id TEXT PRIMARY KEY REFERENCES personal_items(id) ON DELETE CASCADE,
  requested_revision INTEGER NOT NULL DEFAULT 1,
  indexed_revision INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE indexed_documents (
  item_id TEXT NOT NULL REFERENCES personal_items(id) ON DELETE CASCADE,
  document_id INTEGER NOT NULL REFERENCES search_documents(id) ON DELETE CASCADE,
  vector_id TEXT NOT NULL UNIQUE,
  namespace TEXT NOT NULL,
  text_hash TEXT NOT NULL,
  PRIMARY KEY(item_id,document_id)
);
CREATE TABLE vector_garbage (
  vector_id TEXT PRIMARY KEY
);
CREATE TABLE search_sessions (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  signature TEXT NOT NULL,
  results_json TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX search_session_expiry ON search_sessions(expires_at);
INSERT INTO index_requests(item_id) SELECT id FROM personal_items WHERE 1;
CREATE TRIGGER index_item_insert AFTER INSERT ON personal_items BEGIN
  INSERT INTO index_requests(item_id) VALUES(new.id);
END;
CREATE TRIGGER index_item_delete_status AFTER UPDATE OF status,generation ON personal_items WHEN new.status='deleted' OR new.generation!=old.generation BEGIN
  INSERT INTO index_requests(item_id) VALUES(new.id) ON CONFLICT(item_id) DO UPDATE SET requested_revision=requested_revision+1;
END;
CREATE TRIGGER index_document_insert AFTER INSERT ON search_documents BEGIN
  INSERT INTO index_requests(item_id)
    SELECT id FROM personal_items WHERE content_id=new.content_id AND (new.owner_id IS NULL OR owner_id=new.owner_id)
    ON CONFLICT(item_id) DO UPDATE SET requested_revision=requested_revision+1;
END;
CREATE TRIGGER index_document_update AFTER UPDATE ON search_documents BEGIN
  INSERT INTO index_requests(item_id)
    SELECT id FROM personal_items WHERE content_id=new.content_id AND (new.owner_id IS NULL OR owner_id=new.owner_id)
    ON CONFLICT(item_id) DO UPDATE SET requested_revision=requested_revision+1;
END;
CREATE TRIGGER index_document_delete BEFORE DELETE ON search_documents BEGIN
  INSERT OR IGNORE INTO vector_garbage(vector_id) SELECT vector_id FROM indexed_documents WHERE document_id=old.id;
  INSERT INTO index_requests(item_id)
    SELECT id FROM personal_items WHERE content_id=old.content_id AND (old.owner_id IS NULL OR owner_id=old.owner_id)
    ON CONFLICT(item_id) DO UPDATE SET requested_revision=requested_revision+1;
END;
CREATE TRIGGER index_personal_delete BEFORE DELETE ON personal_items BEGIN
  INSERT OR IGNORE INTO vector_garbage(vector_id) SELECT vector_id FROM indexed_documents WHERE item_id=old.id;
END;

