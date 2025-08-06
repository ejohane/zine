-- Delete all subscription-related data
-- Execute this script with: bunx wrangler d1 execute zine-api-production --file=scripts/delete-subscription-data.sql

-- Delete in reverse order of foreign key dependencies

-- 1. Delete user_feed_items (depends on feed_items and users)
DELETE FROM user_feed_items;

-- 2. Delete feed_items (depends on subscriptions)
DELETE FROM feed_items;

-- 3. Delete user_subscriptions (depends on users and subscriptions)
DELETE FROM user_subscriptions;

-- 4. Delete subscriptions (depends on subscription_providers)
DELETE FROM subscriptions;

-- 5. Delete user_accounts (depends on users and subscription_providers)
DELETE FROM user_accounts;

-- 6. Delete subscription_providers (no dependencies)
DELETE FROM subscription_providers;