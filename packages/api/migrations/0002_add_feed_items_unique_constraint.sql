-- First, remove duplicate feed items keeping only the most recent one
DELETE FROM feed_items 
WHERE id NOT IN (
    SELECT MAX(id) 
    FROM feed_items 
    GROUP BY subscription_id, external_id
);

-- Also clean up any orphaned user_feed_items references
DELETE FROM user_feed_items 
WHERE feed_item_id NOT IN (
    SELECT id FROM feed_items
);

-- Now add unique constraint on subscription_id and external_id to prevent duplicate feed items
CREATE UNIQUE INDEX idx_feed_items_subscription_external ON feed_items(subscription_id, external_id);

-- Add index for performance on subscription_id and published_at
CREATE INDEX idx_feed_items_subscription_published ON feed_items(subscription_id, published_at DESC);

-- Add index for user_feed_items lookups
CREATE INDEX idx_user_feed_items_user_feed ON user_feed_items(user_id, feed_item_id);

-- Add partial index for unread items by user (more efficient for filtering)
CREATE INDEX idx_user_feed_items_user_read ON user_feed_items(user_id, is_read) WHERE is_read = 0;

-- Add index for active user subscriptions
CREATE INDEX idx_user_subscriptions_subscription ON user_subscriptions(subscription_id, is_active) WHERE is_active = 1;

-- Add index for subscription provider lookups
CREATE INDEX idx_subscriptions_provider ON subscriptions(provider_id);