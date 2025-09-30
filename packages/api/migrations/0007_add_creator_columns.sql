-- Add missing columns to creators table
ALTER TABLE creators ADD COLUMN verified INTEGER DEFAULT 0;
ALTER TABLE creators ADD COLUMN subscriber_count INTEGER;
ALTER TABLE creators ADD COLUMN follower_count INTEGER;