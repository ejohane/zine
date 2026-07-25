PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS x_daily_sources (
  user_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('FAVORITES', 'LIST')),
  name TEXT NOT NULL,
  is_selected INTEGER NOT NULL DEFAULT 1,
  captured_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, source_id)
);

CREATE TABLE IF NOT EXISTS x_daily_source_members (
  user_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  author_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, source_id, author_key),
  FOREIGN KEY (user_id, source_id)
    REFERENCES x_daily_sources(user_id, source_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, author_key)
    REFERENCES x_authors(user_id, author_key) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS x_daily_source_members_author_idx
  ON x_daily_source_members(user_id, author_key, source_id);
