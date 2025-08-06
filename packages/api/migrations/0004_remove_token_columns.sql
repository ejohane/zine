-- WARNING: This migration removes OAuth token columns from the database.
-- Only run this AFTER all users have been migrated to Durable Objects
-- and you have verified that token access is working through DOs.

-- Step 1: Create a backup of the token data (optional, for safety)
-- This should be done manually before running this migration

-- Step 2: Remove the token columns from userAccounts table
-- SQLite doesn't support DROP COLUMN directly, so we need to recreate the table

-- Create new table without token columns and add isActive column
CREATE TABLE user_accounts_new (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES users(id),
  providerId TEXT NOT NULL REFERENCES subscription_providers(id),
  externalAccountId TEXT NOT NULL,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

-- Copy data from old table (excluding token columns)
INSERT INTO user_accounts_new (id, userId, providerId, externalAccountId, isActive, createdAt, updatedAt)
SELECT id, user_id, provider_id, external_account_id, 
       1 as isActive,  -- Default all existing accounts to active
       created_at, updated_at
FROM user_accounts;

-- Drop the old table
DROP TABLE user_accounts;

-- Rename the new table
ALTER TABLE user_accounts_new RENAME TO user_accounts;

-- Recreate any indexes if needed
CREATE INDEX idx_user_accounts_userId ON user_accounts(userId);
CREATE INDEX idx_user_accounts_providerId ON user_accounts(providerId);
CREATE UNIQUE INDEX idx_user_accounts_user_provider ON user_accounts(userId, providerId);