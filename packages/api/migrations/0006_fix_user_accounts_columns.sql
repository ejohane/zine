-- Fix column naming in user_accounts table
-- The schema expects camelCase but the table has snake_case

-- Create new table with correct column names
CREATE TABLE user_accounts_fixed (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES users(id),
  providerId TEXT NOT NULL REFERENCES subscription_providers(id),
  externalAccountId TEXT NOT NULL,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

-- Copy data from old table if it exists
INSERT INTO user_accounts_fixed (id, userId, providerId, externalAccountId, isActive, createdAt, updatedAt)
SELECT id, user_id, provider_id, external_account_id, 
       COALESCE(is_active, 1) as isActive,
       created_at, updated_at
FROM user_accounts;

-- Drop the old table
DROP TABLE IF EXISTS user_accounts;

-- Rename the new table
ALTER TABLE user_accounts_fixed RENAME TO user_accounts;

-- Recreate indexes
CREATE INDEX idx_user_accounts_userId ON user_accounts(userId);
CREATE INDEX idx_user_accounts_providerId ON user_accounts(providerId);
CREATE UNIQUE INDEX idx_user_accounts_user_provider ON user_accounts(userId, providerId);