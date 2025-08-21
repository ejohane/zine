-- Clean ALL tables script - Deletes data from all tables except users
-- For production remote: bunx wrangler d1 execute DB --env production --remote --file=scripts/clean-existing-tables.sql
-- For production local: bunx wrangler d1 execute DB --env production --file=scripts/clean-existing-tables.sql
-- For local development: bunx wrangler d1 execute zine-db2 --local --file=scripts/clean-existing-tables.sql

-- Delete in reverse order of foreign key dependencies
-- Note: SQLite will silently skip tables that don't exist

-- 1. Delete Durable Object metrics (no foreign keys to other tables)
DELETE FROM durable_object_metrics;

-- 2. Delete Durable Object status (depends on users)
DELETE FROM durable_object_status;

-- 3. Delete token migration status (depends on users)
DELETE FROM token_migration_status;

-- 4. Delete user feed items (depends on feed_items, users, and bookmarks)
DELETE FROM user_feed_items;

-- 5. Delete feed items (depends on subscriptions)
DELETE FROM feed_items;

-- 6. Delete user subscriptions (depends on users and subscriptions)
DELETE FROM user_subscriptions;

-- 7. Delete subscriptions (depends on subscription_providers)
DELETE FROM subscriptions;

-- 8. Delete user accounts (depends on users and subscription_providers)
DELETE FROM user_accounts;

-- 9. Delete subscription providers
DELETE FROM subscription_providers;

-- 10. Delete bookmarks (depends on users and creators)
DELETE FROM bookmarks;

-- 11. Delete creators (no dependencies)
DELETE FROM creators;

-- Note: The users table is explicitly preserved as requested