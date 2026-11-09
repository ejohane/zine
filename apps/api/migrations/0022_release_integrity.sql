CREATE TABLE schema_checksums (
 name TEXT PRIMARY KEY,
 sha256 TEXT NOT NULL,
 first_recorded_at TEXT NOT NULL
);
