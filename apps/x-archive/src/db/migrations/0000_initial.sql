PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS x_timeline_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  requested_count INTEGER NOT NULL,
  collected_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'CAPTURING',
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  excluded_ads INTEGER NOT NULL DEFAULT 0,
  collector_version TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  manifest_key TEXT,
  failure_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS x_timeline_runs_user_started_idx
  ON x_timeline_runs(user_id, started_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS x_authors (
  user_id TEXT NOT NULL,
  author_key TEXT NOT NULL,
  x_user_id TEXT,
  username TEXT NOT NULL,
  name TEXT NOT NULL,
  profile_url TEXT,
  profile_image_url TEXT,
  verified INTEGER,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, author_key)
);

CREATE INDEX IF NOT EXISTS x_authors_user_username_idx ON x_authors(user_id, username);

CREATE TABLE IF NOT EXISTS x_posts (
  user_id TEXT NOT NULL,
  tweet_id TEXT NOT NULL,
  url TEXT NOT NULL,
  text TEXT NOT NULL,
  published_at INTEGER,
  lang TEXT,
  kind TEXT NOT NULL,
  author_key TEXT NOT NULL,
  media_json TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  first_run_id TEXT NOT NULL,
  latest_run_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  PRIMARY KEY (user_id, tweet_id),
  FOREIGN KEY (user_id, author_key) REFERENCES x_authors(user_id, author_key)
);

CREATE INDEX IF NOT EXISTS x_posts_user_last_seen_idx
  ON x_posts(user_id, last_seen_at DESC, tweet_id DESC);
CREATE INDEX IF NOT EXISTS x_posts_user_author_idx ON x_posts(user_id, author_key, published_at DESC);
CREATE INDEX IF NOT EXISTS x_posts_user_published_idx ON x_posts(user_id, published_at DESC, tweet_id DESC);

CREATE TABLE IF NOT EXISTS x_post_relationships (
  user_id TEXT NOT NULL,
  source_tweet_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  target_tweet_id TEXT NOT NULL,
  target_url TEXT,
  PRIMARY KEY (user_id, source_tweet_id, relationship_type, target_tweet_id),
  FOREIGN KEY (user_id, source_tweet_id) REFERENCES x_posts(user_id, tweet_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS x_post_relationships_target_idx
  ON x_post_relationships(user_id, target_tweet_id);

CREATE TABLE IF NOT EXISTS x_timeline_run_items (
  run_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  tweet_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  observed_at INTEGER NOT NULL,
  presentation TEXT NOT NULL DEFAULT 'POST',
  reposted_by_json TEXT,
  PRIMARY KEY (run_id, tweet_id),
  UNIQUE (run_id, position),
  FOREIGN KEY (run_id) REFERENCES x_timeline_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, tweet_id) REFERENCES x_posts(user_id, tweet_id)
);

CREATE INDEX IF NOT EXISTS x_timeline_run_items_user_tweet_idx
  ON x_timeline_run_items(user_id, tweet_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS x_ingest_chunks (
  run_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  checksum TEXT NOT NULL,
  posts_received INTEGER NOT NULL,
  timeline_items_received INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, chunk_index),
  FOREIGN KEY (run_id) REFERENCES x_timeline_runs(id) ON DELETE CASCADE
);
