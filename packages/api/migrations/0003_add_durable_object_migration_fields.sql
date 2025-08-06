-- Add durableObjectId to users table
ALTER TABLE users ADD COLUMN durable_object_id TEXT;

-- Create token migration status table
CREATE TABLE IF NOT EXISTS token_migration_status (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at INTEGER,
  completed_at INTEGER,
  last_attempt_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Create index for faster queries
CREATE INDEX idx_token_migration_status_user_provider ON token_migration_status(user_id, provider);
CREATE INDEX idx_token_migration_status_status ON token_migration_status(status);