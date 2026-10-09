-- Private retrospective state. No public publication or activity data is stored here.
CREATE TABLE weekly_recap_preferences (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id),
  timezone TEXT NOT NULL,
  timezone_history TEXT NOT NULL,
  initialized_at INTEGER NOT NULL,
  tracking_started_at INTEGER NOT NULL,
  catchup_week_start TEXT NOT NULL
);
CREATE TABLE weekly_recap_windows (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  week_start TEXT NOT NULL,
  timezone TEXT NOT NULL,
  start_at INTEGER NOT NULL,
  end_at INTEGER NOT NULL,
  generated_at INTEGER NOT NULL,
  snapshot TEXT NOT NULL,
  UNIQUE(user_id,week_start),
  CHECK(end_at > start_at)
);
CREATE INDEX weekly_recap_windows_owner_history ON weekly_recap_windows(user_id,week_start DESC);
CREATE TABLE weekly_recap_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  owner_cursor TEXT NOT NULL DEFAULT ''
);
-- Retry identities are scoped to an actor in the event ID. No historical events are fabricated.
CREATE INDEX user_item_consumption_events_window ON user_item_consumption_events(user_id,occurred_at,event_type);
-- Freeze explicit draft intent so retries can replay after Library state changes.
CREATE TABLE weekly_recap_draft_requests (
  user_id TEXT NOT NULL REFERENCES users(id),
  key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  window_id TEXT NOT NULL REFERENCES weekly_recap_windows(id),
  title TEXT NOT NULL,
  saved_ids TEXT NOT NULL,
  PRIMARY KEY(user_id,key)
);
