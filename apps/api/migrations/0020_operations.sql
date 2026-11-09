CREATE TABLE service_checks (
  name TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  succeeded_at TEXT,
  failed_at TEXT,
  error_category TEXT
);
CREATE TABLE operational_alerts (
  owner_id TEXT NOT NULL,
  code TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('open','resolved')),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  resolved_at TEXT,
  occurrences INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(owner_id,code)
);

CREATE TABLE service_state (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
