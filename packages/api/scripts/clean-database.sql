-- Clean database script - Deletes all data except users table and static seed data
-- For production: bunx wrangler d1 execute zine-db-production --file=scripts/clean-database.sql
-- For local development: bunx wrangler d1 execute zine-db2 --local --file=scripts/clean-database.sql
-- Or with environment flag: bunx wrangler d1 execute DB --env production --file=scripts/clean-database.sql

-- Delete in reverse order of foreign key dependencies to avoid constraint violations

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
-- Note: If you have seed data for OAuth providers, add WHERE clause to preserve them
DELETE FROM subscription_providers;
-- Example to preserve seed data:
-- DELETE FROM subscription_providers WHERE id NOT IN ('spotify', 'youtube');

-- 10. Delete bookmarks (depends on users and creators)
DELETE FROM bookmarks;

-- 11. Delete creators (no dependencies)
DELETE FROM creators;

-- 12. Delete users (WARNING: This deletes ALL user data!)
-- Uncomment the line below if you want to delete users as well
-- DELETE FROM users;

-- Note: The users table is explicitly preserved by default
-- To delete users, uncomment the DELETE FROM users line above
-- If you need to preserve any other seed data, modify the DELETE statements above with appropriate WHERE clauses

-- Vacuum the database to reclaim space (optional, may not work in all environments)
-- VACUUM;