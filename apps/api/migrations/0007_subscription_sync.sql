ALTER TABLE subscriptions ADD COLUMN sync_lease_token TEXT;
ALTER TABLE subscriptions ADD COLUMN sync_lease_until TEXT;
ALTER TABLE subscriptions ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
CREATE TABLE subscription_snapshots (
  artifact_key TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
