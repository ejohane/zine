-- Generated suggestions and durable decisions never replace user_item_tags.
CREATE TABLE tag_suggestion_runs (
  user_item_id TEXT PRIMARY KEY REFERENCES user_items(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  token TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'COMPLETE')),
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE tag_suggestions (
  id TEXT PRIMARY KEY,
  user_item_id TEXT NOT NULL REFERENCES user_items(id) ON DELETE CASCADE,
  normalized_name TEXT NOT NULL,
  name TEXT NOT NULL,
  confidence REAL NOT NULL,
  decision TEXT NOT NULL DEFAULT 'PENDING' CHECK (decision IN ('PENDING', 'ACCEPTED', 'DISMISSED')),
  generated_at INTEGER NOT NULL,
  UNIQUE(user_item_id, normalized_name)
);
