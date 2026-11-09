CREATE TABLE connections (
  owner_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('google')),
  credentials TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active','reauthorization_required')),
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(owner_id,provider)
);
