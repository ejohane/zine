CREATE TABLE IF NOT EXISTS x_daily_overviews (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  edition_date TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  input_fingerprint TEXT NOT NULL,
  algorithm_version TEXT NOT NULL,
  model TEXT,
  status TEXT NOT NULL,
  sections_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS x_daily_overviews_input_idx
  ON x_daily_overviews(user_id, edition_date, variant_id, input_fingerprint, algorithm_version);
