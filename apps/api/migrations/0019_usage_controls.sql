-- Minimal content-free abuse/cost counters survive account erasure until expiry.
-- Owner/caller identifiers are hashes; no URLs, prompts or token values are stored.
CREATE TABLE usage_windows (
 owner_key TEXT NOT NULL,
 subject_key TEXT NOT NULL,
 metric TEXT NOT NULL,
 window_start TEXT NOT NULL,
 reset_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 used INTEGER NOT NULL CHECK(used>=0),
 ceiling INTEGER NOT NULL CHECK(ceiling>0),
 PRIMARY KEY(owner_key,subject_key,metric,window_start)
);
CREATE INDEX usage_window_expiry ON usage_windows(expires_at);
CREATE TABLE usage_guards (
 id TEXT PRIMARY KEY,
 allowed INTEGER NOT NULL CHECK(allowed=1)
);
