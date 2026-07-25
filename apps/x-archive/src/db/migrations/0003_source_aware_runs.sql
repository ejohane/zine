PRAGMA foreign_keys = ON;

ALTER TABLE x_timeline_runs ADD COLUMN source_type TEXT NOT NULL DEFAULT 'FOLLOWING';
ALTER TABLE x_timeline_runs ADD COLUMN source_id TEXT NOT NULL DEFAULT 'following';
ALTER TABLE x_timeline_runs ADD COLUMN source_name TEXT NOT NULL DEFAULT 'Following';
ALTER TABLE x_timeline_runs ADD COLUMN source_url TEXT;
ALTER TABLE x_timeline_runs ADD COLUMN context_coverage_json TEXT NOT NULL DEFAULT '{"budget":0,"attempted":0,"completed":0,"truncated":0,"failed":0,"warnings":[]}';

CREATE INDEX IF NOT EXISTS x_timeline_runs_user_source_completed_idx
  ON x_timeline_runs(user_id, source_type, source_id, completed_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS x_timeline_run_context_posts (
  run_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  tweet_id TEXT NOT NULL,
  observed_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, tweet_id),
  FOREIGN KEY (run_id) REFERENCES x_timeline_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, tweet_id) REFERENCES x_posts(user_id, tweet_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS x_timeline_run_context_posts_user_tweet_idx
  ON x_timeline_run_context_posts(user_id, tweet_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS x_daily_source_snapshots (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('FAVORITES', 'LIST')),
  name TEXT NOT NULL,
  is_selected INTEGER NOT NULL DEFAULT 1,
  captured_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('COMPLETE', 'PARTIAL')),
  failure_reason TEXT,
  supplied_count INTEGER NOT NULL,
  resolved_count INTEGER NOT NULL,
  unresolved_usernames_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (run_id) REFERENCES x_timeline_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS x_daily_source_snapshots_user_source_captured_idx
  ON x_daily_source_snapshots(user_id, source_id, captured_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS x_daily_source_snapshot_members (
  snapshot_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  author_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (snapshot_id, author_key),
  FOREIGN KEY (snapshot_id) REFERENCES x_daily_source_snapshots(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, author_key) REFERENCES x_authors(user_id, author_key) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS x_daily_source_snapshot_members_author_idx
  ON x_daily_source_snapshot_members(user_id, author_key, snapshot_id);
