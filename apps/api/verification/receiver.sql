CREATE TABLE IF NOT EXISTS receipts (
 delivery_id TEXT PRIMARY KEY, event_id TEXT NOT NULL, body_sha256 TEXT NOT NULL,
 attempts INTEGER NOT NULL, accepted INTEGER NOT NULL,
 first_seen_at TEXT NOT NULL,last_seen_at TEXT NOT NULL
);
