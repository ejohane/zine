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
SELECT id, userId, providerId, externalAccountId, 
       1 as isActive,  -- Default all existing accounts to active
       createdAt, updatedAt
FROM userAccounts;

-- Drop the old table
DROP TABLE userAccounts;

-- Rename the new table
ALTER TABLE user_accounts_new RENAME TO userAccounts;

-- Recreate any indexes if needed
CREATE INDEX idx_userAccounts_userId ON userAccounts(userId);
CREATE INDEX idx_userAccounts_providerId ON userAccounts(providerId);
CREATE UNIQUE INDEX idx_userAccounts_user_provider ON userAccounts(userId, providerId);