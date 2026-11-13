CREATE TABLE home_editions (
  owner_id TEXT PRIMARY KEY,
  id TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  sections_json TEXT NOT NULL CHECK (json_valid(sections_json))
);
