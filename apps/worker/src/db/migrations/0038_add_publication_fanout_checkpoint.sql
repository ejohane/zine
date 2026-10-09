CREATE TABLE IF NOT EXISTS personal_publication_fanout (
 event_id TEXT PRIMARY KEY NOT NULL REFERENCES personal_publication_events(id) ON DELETE CASCADE,
 recipient_cursor TEXT NOT NULL DEFAULT '', lease_token TEXT, lease_until INTEGER
);
