# Content Sources Migration Scripts

Part of the **Two-Tier Creator Model** implementation.

See: [TWO_TIER_CREATOR_MODEL.md](../../../docs/features/creator-reconciliation/TWO_TIER_CREATOR_MODEL.md)

## Overview

These scripts migrate existing subscription data to the new `content_sources` table, which separates platform-specific content containers (channels, shows) from the actual creators who produce content.

## Files

### SQL Migrations

1. **0017_populate_content_sources_from_subscriptions.sql**
   - Creates `content_source` records from all existing subscriptions
   - Maps subscription metadata to content source fields
   - Sets up temporary creator relationships (to be reconciled later)
   - Includes verification queries

2. **0018_link_subscriptions_to_content_sources.sql**
   - Adds `content_source_id` column to subscriptions table
   - Populates links between subscriptions and content sources
   - Creates index for efficient lookups
   - Includes validation queries

### TypeScript Script

**populate-content-sources.ts**
- Interactive migration script with dry-run support
- Detailed progress logging and statistics
- Error handling and verification
- Can be run safely multiple times (idempotent)

## Usage

### Option 1: SQL Migrations (Recommended for Production)

Apply migrations in order using Wrangler:

```bash
# Apply migration 0017
cd packages/api
wrangler d1 execute zine-db --local --file=./migrations/0017_populate_content_sources_from_subscriptions.sql

# Apply migration 0018
wrangler d1 execute zine-db --local --file=./migrations/0018_link_subscriptions_to_content_sources.sql
```

For production:

```bash
# Review changes first
wrangler d1 execute zine-db --file=./migrations/0017_populate_content_sources_from_subscriptions.sql --preview

# Apply if safe
wrangler d1 execute zine-db --file=./migrations/0017_populate_content_sources_from_subscriptions.sql
wrangler d1 execute zine-db --file=./migrations/0018_link_subscriptions_to_content_sources.sql
```

### Option 2: TypeScript Script (Development/Testing)

The TypeScript script provides more control and visibility:

```bash
cd packages/api

# Dry run - see what would be migrated
bun run scripts/populate-content-sources.ts --dry-run

# Dry run with verbose output
bun run scripts/populate-content-sources.ts --dry-run --verbose

# Run the migration
bun run scripts/populate-content-sources.ts

# Run with detailed logging
bun run scripts/populate-content-sources.ts --verbose
```

## What Gets Migrated

### From `subscriptions` to `content_sources`:

| Subscription Field | Content Source Field | Notes |
|-------------------|---------------------|-------|
| `provider_id:external_id` | `id` | Combined as `{platform}:{external_id}` |
| `external_id` | `external_id` | Direct copy |
| `provider_id` | `platform` | e.g., "youtube", "spotify" |
| - | `source_type` | Derived: "channel" or "show" |
| `title` | `title` | Direct copy |
| `description` | `description` | Direct copy |
| `thumbnail_url` | `thumbnail_url` | Direct copy |
| `subscription_url` | `url` | Direct copy |
| `external_id` | `creator_id` | Temporary (reconciled later) |
| `creator_name` | `creator_name` | Direct copy |
| `subscriber_count` | `subscriber_count` | Direct copy |
| `total_episodes` | `total_episodes` | Direct copy |
| `video_count` | `video_count` | Direct copy |
| `is_verified` | `is_verified` | Direct copy |
| `last_polled_at` | `last_polled_at` | Direct copy |
| `etag` | `etag` | Direct copy |
| `uploads_playlist_id` | `uploads_playlist_id` | Direct copy |
| Channel metadata | `metadata` | JSON object with all extra fields |

## Verification

After migration, verify the results:

```bash
# Count content sources by platform
wrangler d1 execute zine-db --local --command="
  SELECT platform, source_type, COUNT(*) as count
  FROM content_sources
  GROUP BY platform, source_type
"

# Check for unmigrated subscriptions
wrangler d1 execute zine-db --local --command="
  SELECT COUNT(*) as unmigrated_count
  FROM subscriptions s
  WHERE NOT EXISTS (
    SELECT 1 FROM content_sources cs 
    WHERE cs.external_id = s.external_id 
      AND cs.platform = s.provider_id
  )
"

# Verify subscription links
wrangler d1 execute zine-db --local --command="
  SELECT 
    COUNT(*) as linked_count,
    (SELECT COUNT(*) FROM subscriptions) as total_subscriptions
  FROM subscriptions
  WHERE content_source_id IS NOT NULL
"
```

## Next Steps

After running these migrations:

1. ✅ All subscriptions have corresponding content sources
2. ⏭️ Run **CreatorExtractionService** to extract creator information from content sources
3. ⏭️ Run **CreatorReconciliationService** to match content sources to unified creators
4. ⏭️ Update `creator_id` in content_sources to point to reconciled creators (not channels)

## Rollback

If needed, you can rollback by:

```sql
-- Remove content_source_id from subscriptions
ALTER TABLE subscriptions DROP COLUMN content_source_id;

-- Clear content_sources table
DELETE FROM content_sources;

-- Or drop and recreate
DROP TABLE content_sources;
-- Then re-run migration 0015_create_content_sources_table.sql
```

## Troubleshooting

### "Table already exists" error
The migration uses `INSERT OR IGNORE`, so it's safe to run multiple times. Existing records will be skipped.

### Missing subscriptions in content_sources
Check that subscriptions have:
- Non-null `external_id`
- Non-null `title`
- Non-null `creator_name`

```sql
SELECT * FROM subscriptions 
WHERE external_id IS NULL 
   OR title IS NULL 
   OR creator_name IS NULL;
```

### Performance issues
For large datasets, consider:
- Running migrations during low-traffic periods
- Adding pagination to the TypeScript script
- Using batched inserts

## Testing

Test on local database first:

```bash
# 1. Backup local database
cp packages/api/local.db packages/api/local.db.backup

# 2. Run migration
bun run scripts/populate-content-sources.ts

# 3. Verify results
# 4. If issues, restore backup
cp packages/api/local.db.backup packages/api/local.db
```
