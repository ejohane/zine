CREATE TABLE understanding_requests (
 item_id TEXT PRIMARY KEY REFERENCES personal_items(id) ON DELETE CASCADE,
 requested_revision INTEGER NOT NULL DEFAULT 1,
 processed_revision INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE understanding_runs (
 id TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL,
 item_id TEXT NOT NULL REFERENCES personal_items(id) ON DELETE CASCADE,
 generation INTEGER NOT NULL,
 input_digest TEXT NOT NULL,
 state_key TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL CHECK(status IN ('processing','succeeded')),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE TABLE understanding_artifacts (
 artifact_key TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL,
 created_at TEXT NOT NULL
);
INSERT INTO understanding_requests(item_id) SELECT DISTINCT p.id FROM personal_items p JOIN contributions d ON d.content_id=p.content_id AND d.owner_id=p.owner_id WHERE p.status!='deleted' AND d.field IN ('article','transcript','thread','description') AND d.category!='derived';
CREATE TRIGGER understanding_insert AFTER INSERT ON contributions WHEN new.category!='derived' AND new.field IN ('article','transcript','thread','description') BEGIN
 INSERT INTO understanding_requests(item_id) SELECT id FROM personal_items WHERE content_id=new.content_id AND owner_id=new.owner_id AND status!='deleted' ON CONFLICT(item_id) DO UPDATE SET requested_revision=requested_revision+1;
END;
CREATE TRIGGER understanding_update AFTER UPDATE ON contributions WHEN new.category!='derived' AND new.field IN ('article','transcript','thread','description') BEGIN
 INSERT INTO understanding_requests(item_id) SELECT id FROM personal_items WHERE content_id=new.content_id AND owner_id=new.owner_id AND status!='deleted' ON CONFLICT(item_id) DO UPDATE SET requested_revision=requested_revision+1;
END;
