-- Add lastPolledAt column to subscriptions table for optimized polling
ALTER TABLE subscriptions ADD COLUMN last_polled_at INTEGER;

-- Create index for efficient polling queries
CREATE INDEX idx_subscriptions_last_polled_at ON subscriptions(last_polled_at);
CREATE INDEX idx_subscriptions_provider_last_polled ON subscriptions(provider_id, last_polled_at);