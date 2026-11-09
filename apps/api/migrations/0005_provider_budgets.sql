CREATE TABLE provider_budgets (
  scope TEXT PRIMARY KEY,
  not_before TEXT NOT NULL,
  lease_until TEXT,
  lease_token TEXT,
  consecutive_limits INTEGER NOT NULL DEFAULT 0
);
