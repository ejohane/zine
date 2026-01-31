# Legacy Timestamp Backfill Runbook

This runbook covers the one-time data backfill that populates new `*_ms` Unix
timestamp columns from legacy ISO8601 columns.

## Preconditions

- The schema migration that adds the `*_ms` columns has already been applied.
- You have a fresh backup or snapshot of the target database.
- Run this in staging first and confirm ordering/queries behave as expected.

## Option A: Local backfill (SQLite file)

Use the Bun script to backfill a local D1 SQLite database.

```bash
# D1_DB_PATH should point at the local sqlite file
D1_DB_PATH=/path/to/local.sqlite bun run scripts/backfill-legacy-timestamps.ts

# Dry run (prints missing counts without changes)
D1_DB_PATH=/path/to/local.sqlite bun run scripts/backfill-legacy-timestamps.ts --dry-run
```

## Option B: Staging/production backfill (D1)

Use Wrangler to execute the SQL directly against a D1 database.

```bash
wrangler d1 execute <database-name> --file apps/worker/scripts/backfill-legacy-timestamps.sql
```

## Verification (manual)

1. Confirm counts of missing `*_ms` values are zero or expected:
   ```sql
   SELECT COUNT(*) AS missing
   FROM user_items
   WHERE ingested_at IS NOT NULL
     AND (ingested_at_ms IS NULL OR ingested_at_ms = 0);
   ```
2. Spot-check a handful of rows to confirm `*_ms` matches the ISO value:
   ```sql
   SELECT ingested_at, ingested_at_ms
   FROM user_items
   ORDER BY ingested_at DESC
   LIMIT 5;
   ```
3. Validate ordering in the app (inbox/library sorting) still matches pre-backfill behavior.

## Rollback

- If validation fails, restore from the pre-backfill backup and investigate any
  malformed ISO values before rerunning.
