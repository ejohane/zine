#!/bin/bash

# Script to fix missing user_feed_items table in production
# This needs to be run with wrangler to apply to production D1 database

echo "Fixing missing user_feed_items table in production..."

# Apply the fix to production
wrangler d1 execute zine-db-production \
  --file=./migrations/fix-missing-user-feed-items.sql \
  --remote

echo "Fix applied. Verifying table exists..."

# Verify the table was created
wrangler d1 execute zine-db-production \
  --command="SELECT name FROM sqlite_master WHERE type='table' AND name='user_feed_items';" \
  --remote

echo "Done!"