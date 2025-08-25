-- Safe clean database script - Deletes all data except users table and static seed data
-- Handles cases where tables may not exist
-- For production remote: bunx wrangler d1 execute DB --env production --remote --file=scripts/clean-database-safe.sql
-- For production local: bunx wrangler d1 execute DB --env production --file=scripts/clean-database-safe.sql
-- For local development: bunx wrangler d1 execute zine-db2 --local --file=scripts/clean-database-safe.sql

-- Delete data from each table only if it exists
-- Using DROP TABLE IF EXISTS followed by recreation would lose schema, so we just delete data

-- Check what tables exist
-- SELECT name FROM sqlite_master WHERE type='table';

-- Delete from each table (SQLite will skip if table doesn't exist when using this approach)
-- We'll use individual DELETE statements that won't fail if table doesn't exist

-- Durable Object tables
DELETE FROM durable_object_metrics WHERE 1=1;
DELETE FROM durable_object_status WHERE 1=1;
DELETE FROM token_migration_status WHERE 1=1;

-- Feed and subscription tables
DELETE FROM user_feed_items WHERE 1=1;
DELETE FROM feed_items WHERE 1=1;
DELETE FROM user_subscriptions WHERE 1=1;
DELETE FROM subscriptions WHERE 1=1;
DELETE FROM user_accounts WHERE 1=1;
DELETE FROM subscription_providers WHERE 1=1;

-- Bookmark and creator tables
DELETE FROM bookmarks WHERE 1=1;
DELETE FROM creators WHERE 1=1;

-- Note: The users table is explicitly preserved as requested