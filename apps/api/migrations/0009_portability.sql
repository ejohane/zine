CREATE TABLE owner_generations (
  owner_id TEXT PRIMARY KEY,
  generation INTEGER NOT NULL
);
ALTER TABLE save_occurrences ADD COLUMN input_url TEXT;
DELETE FROM content_aliases;
