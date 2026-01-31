# Worker Ingestion Processor Refactor Plan (zine-x5ut.2.1)

## Purpose

Create a concrete, low-risk refactor plan for the worker ingestion processor so it is easier to
extend, test, and reason about without changing ingestion behavior.

## Scope

- Target code:
  - `apps/worker/src/ingestion/processor/ingest.ts`
  - `apps/worker/src/ingestion/processor/batch.ts`
  - `apps/worker/src/ingestion/processor/types.ts`
  - `apps/worker/src/ingestion/processor.ts`
- Keep the public API stable (`ingestItem`, `ingestBatch`, `ingestBatchConsolidated`).
- No schema changes, no behavioral changes, no new runtime dependencies.

## Current State Summary

- Single-item ingestion (`ingestItem`) does transform -> validate -> idempotency -> creator ->
  canonical item -> batch insert.
- Batch ingestion (`ingestBatch`) loops and delegates to `ingestItem`.
- Consolidated batch (`ingestBatchConsolidated`) duplicates logic for transform/validate/
  idempotency/canonical lookup + builds write statements inline (chunk and fallback).
- DLQ handling is embedded in multiple places.
- Insert statement construction is duplicated in batch + fallback.

## Refactor Goals

1. Deduplicate insert statement building and timestamp handling.
2. Centralize transform/validate/idempotency/creator/canonical lookup.
3. Isolate DLQ persistence in one helper.
4. Keep existing behavior and error semantics intact.
5. Make consolidated ingestion easier to test with small, composable units.

## Proposed Module Layout

Keep `ingest.ts` and `batch.ts` as orchestration and move shared logic into helpers:

- `apps/worker/src/ingestion/processor/prepare.ts`
  - `prepareItem(...)` -> returns PreparedItem or skip/error
  - `prepareBatch(...)` -> prepares list + records skips/errors
- `apps/worker/src/ingestion/processor/write.ts`
  - `buildIngestionStatements(prepared, context)` -> returns Drizzle statements
  - `executeBatchStatements(statements, db)` -> wraps `db.batch`
- `apps/worker/src/ingestion/processor/dlq.ts`
  - `storeToDLQ(...)` helper (currently inline in batch.ts)
- `apps/worker/src/ingestion/processor/types.ts`
  - add `PreparedItem`, `PreparedResult`, `IngestContext`, `WriteContext`

## Detailed Step Plan

### Step 1: Extract shared preparation logic

- Create `prepare.ts` with:
  - Transform and validate raw items (existing `validateCanonicalItem`).
  - Idempotency lookup in `provider_items_seen`.
  - Canonical lookup and creator resolution (reuse existing helpers).
  - Backfill creator ID when needed (current behavior in batch).
- Output `PreparedItem` (current fields in batch: newItem, providerId, canonical IDs, creatorId,
  raw item, userItemId) and a structured skip reason.

### Step 2: Extract write statement builder

- Create `write.ts` with a single statement builder used by:
  - `ingestItem` (single item -> one statement list -> `db.batch`)
  - `executeChunkBatch` (chunked list)
  - `executeIndividualInsert` (fallback)
- Ensure `publishedAt` conversion is done in exactly one place.
- Keep the `onConflictDoNothing` semantics identical.

### Step 3: Centralize DLQ writes

- Move `storeToDLQ` to `dlq.ts` and use from:
  - `ingestBatch` (error path)
  - `ingestBatchConsolidated` (transform/validation failures, fallback failures)

### Step 4: Update orchestration

- `ingestItem`:
  - call `prepareItem` and exit early for `already_seen`.
  - call `buildIngestionStatements` and `executeBatchStatements`.
- `ingestBatchConsolidated`:
  - replace Phase 1 with `prepareBatch`.
  - Phase 2 uses `buildIngestionStatements` per chunk and for fallback.
- Keep log output and metrics structure unchanged (same keys).

### Step 5: Testing plan (existing tests or add new)

- Unit tests for `prepareItem`:
  - skips already-seen items
  - returns creator/backfill data when canonical exists
- Unit tests for `buildIngestionStatements`:
  - consistent timestamps and `publishedAt` conversion
  - correct inserts generated for each table
- Integration tests (existing polling tests can be extended):
  - consolidated ingestion fallback path behaves same
  - DLQ writes on validation failures and batch failures

## Acceptance Criteria

- No behavioral changes in ingestion outputs or metrics.
- `ingestBatchConsolidated` no longer duplicates core logic.
- All insert statement construction lives in one helper.
- DLQ writes centralized with identical error payloads.

## Risks and Mitigations

- Risk: subtle behavior change in timestamps or skip reasons.
  - Mitigation: snapshot tests for statements and explicit unit tests for skip logic.
- Risk: canonical/creator backfill path changes.
  - Mitigation: regression test with existing canonical item lacking creatorId.

## Manual Verification Checklist (post-implementation)

1. Run a provider poll that calls ingestion (YouTube or Spotify) and confirm:
   - new items appear in inbox
   - no duplicate items for already-seen provider IDs
2. Force a validation error and confirm DLQ row is written with same fields.
3. Trigger consolidated ingestion with a batch size > 1 and confirm log metrics match prior shape.
