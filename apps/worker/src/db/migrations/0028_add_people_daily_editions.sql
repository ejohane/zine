CREATE TABLE IF NOT EXISTS people_daily_editions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  edition_date TEXT NOT NULL,
  revision INTEGER NOT NULL,
  status TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  artifact_key TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  favorites_run_id TEXT NOT NULL,
  following_run_id TEXT NOT NULL,
  membership_snapshot_id TEXT,
  algorithm_version TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  model TEXT,
  coverage_status TEXT NOT NULL,
  warnings_json TEXT NOT NULL,
  counts_json TEXT NOT NULL,
  timings_json TEXT NOT NULL,
  built_at INTEGER NOT NULL,
  published_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS people_daily_editions_user_date_revision_idx
  ON people_daily_editions(user_id, edition_date, revision);
CREATE UNIQUE INDEX IF NOT EXISTS people_daily_editions_user_hash_idx
  ON people_daily_editions(user_id, content_hash);
CREATE INDEX IF NOT EXISTS people_daily_editions_user_published_idx
  ON people_daily_editions(user_id, published_at);

CREATE TABLE IF NOT EXISTS people_daily_builds (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  edition_date TEXT NOT NULL,
  status TEXT NOT NULL,
  edition_id TEXT REFERENCES people_daily_editions(id) ON DELETE SET NULL,
  favorites_run_id TEXT,
  following_run_id TEXT,
  algorithm_version TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  model TEXT,
  input_hash TEXT,
  failure_stage TEXT,
  error_message TEXT,
  timings_json TEXT NOT NULL DEFAULT '{}',
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS people_daily_builds_user_date_idx
  ON people_daily_builds(user_id, edition_date, updated_at);
CREATE INDEX IF NOT EXISTS people_daily_builds_user_status_idx
  ON people_daily_builds(user_id, status, updated_at);

CREATE TABLE IF NOT EXISTS people_daily_active_editions (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id),
  edition_id TEXT NOT NULL REFERENCES people_daily_editions(id),
  updated_at INTEGER NOT NULL
);
