# Plan: Remove legacy ISO8601 timestamp fields (zine-x5ut.5.1)

## Purpose

Define a safe, incremental plan to migrate legacy ISO8601 TEXT timestamps to Unix
milliseconds (INTEGER), then remove the legacy columns once reads/writes are
fully cut over.

## Scope

- Tables with legacy ISO8601 timestamps (from `apps/worker/src/db/schema.ts`):
  - `users`: `created_at`, `updated_at`
  - `items`: `published_at`, `created_at`, `updated_at`
  - `user_items`: `ingested_at`, `bookmarked_at`, `archived_at`, `last_opened_at`,
    `progress_updated_at`, `finished_at`, `created_at`, `updated_at`
  - `sources`: `created_at`, `updated_at`, `deleted_at`
  - `provider_items_seen`: `first_seen_at`
- Timestamp helpers: `apps/worker/src/lib/timestamps.ts`.
- Any queries, inserts, or ordering logic that depends on ISO8601 string ordering.
- Documentation: `docs/zine-tech-stack.md` timestamp guidance and any table notes.

## Current State Summary

- Legacy tables store timestamps as ISO8601 TEXT (see `docs/zine-tech-stack.md`).
- New tables already use Unix ms (INTEGER) timestamps (e.g., `subscriptions`).
- Conversion helpers exist but are not widely used outside the module itself.
- Indexes for `user_items` order by ISO string fields.

## Goals

1. Migrate all legacy timestamp fields to Unix ms INTEGER.
2. Preserve ordering semantics and existing API behavior during rollout.
3. Remove legacy ISO8601 columns and related conversion utilities.
4. Keep data integrity (no regressions in ordering or filtering).

## Proposed Migration Strategy

### Phase 0: Audit and mapping

- Inventory all legacy timestamp fields and their usage in code paths.
- Document any special semantics (nullable fields like `finished_at` and
  `archived_at`) to ensure backfill handles nulls safely.

### Phase 1: Add Unix ms columns (dual-write)

- Create a migration that adds parallel Unix ms columns for each legacy field.
- Naming convention (example):
  - `created_at` -> `created_at_ms`
  - `published_at` -> `published_at_ms`
  - `progress_updated_at` -> `progress_updated_at_ms`
- Update Drizzle schema to include new columns with clear comments.
- Update write paths to set both ISO and Unix values (temporary dual-write).

### Phase 2: Backfill existing rows

- Add a data migration (or a one-off backfill script) to populate the new
  `_ms` columns from ISO8601 values.
- Use `unix_ms = CAST(strftime('%s', iso_value) AS INTEGER) * 1000` in D1 SQL.
- Ensure null ISO values stay null in the new columns.
- Use `apps/worker/scripts/backfill-legacy-timestamps.ts` locally and
  `apps/worker/scripts/backfill-legacy-timestamps.sql` for D1 runs
  (see `docs/legacy-timestamp-backfill-runbook.md`).

### Phase 3: Switch reads and ordering to Unix ms

- Update queries to read from `_ms` columns.
- Update ordering and indexes to use Unix ms columns:
  - `user_items_inbox_idx` should order by `ingested_at_ms`.
  - `user_items_library_idx` should order by `bookmarked_at_ms`.
  - `user_items_recent_opened_idx` should order by `last_opened_at_ms`.
- Update any JSON response shapes if they expose timestamps to clients:
  - Ensure clients expect Unix ms (if any legacy ISO output exists).

### Phase 4: Remove legacy columns

- Create a migration to drop legacy ISO8601 columns.
- SQLite/D1 requires table rebuild for drops:
  - Create new table with only Unix ms columns.
  - Copy data from old table.
  - Swap tables (rename/drop old).
- Update Drizzle schema to remove ISO fields and add consistent Unix names
  (consider dropping the `_ms` suffix when old columns are removed).

### Phase 5: Cleanup

- Remove ISO-specific helpers from `apps/worker/src/lib/timestamps.ts`.
- Remove legacy notes in schema comments.
- Update `docs/zine-tech-stack.md` to remove the legacy table list once migration
  completes.

## Risks and Mitigations

- Risk: Ordering changes if ISO strings were relied on implicitly.
  - Mitigation: Update indexes and ordering clauses during Phase 3.
- Risk: Dual-write inconsistencies during rollout.
  - Mitigation: Add monitoring checks that compare ISO vs Unix values for recent
    writes; keep rollout window short.
- Risk: Backfill errors from malformed ISO strings.
  - Mitigation: Identify malformed rows first; fall back to null or current time
    based on field semantics.

## Manual Verification Checklist

1. Insert and update flows create both ISO and Unix values during dual-write.
2. Backfill populated `_ms` columns for existing rows (spot-check a sample).
3. Inbox and library ordering match previous behavior (most recent first).
4. API responses that include timestamps are stable and consistent with clients.
5. After legacy columns are removed, new writes still succeed and reads still
   return correct ordering.
