# Zine – Ingestion Pipeline Mechanics

## Purpose

This document defines the **ingestion pipeline mechanics** for the Zine application.
It builds on the established domain model and D1 persistence layer to describe:

- How content enters the system
- How idempotency is guaranteed
- How failures are isolated
- How ingestion stays simple while remaining extensible

Primary goals:

- Fast iteration
- Safe retries and replays
- Minimal coupling between ingestion and domain logic

---

## Ingestion Design Principles

- **Batch fetch, item-level processing**
- **Asynchronous by default**
- **Provider identity–based idempotency**
- **Eventual consistency over strict correctness**
- **Failures should degrade gracefully, not block ingestion**

---

## High-Level Flow

```
Source Trigger (cron or manual)
  └─ Fetch batch from provider
      └─ For each raw item
           ├─ Idempotency check
           ├─ Record as seen
           ├─ Resolve canonical identity
           ├─ Upsert canonical item
           ├─ Upsert user item (INBOX)
           └─ Schedule enrichment
```

---

## Unit of Ingestion

### Fetch Unit

- Providers are fetched in **batches**
- Matches provider APIs and rate limits

### Processing Unit

- Each item is processed **independently**
- Enables:
  - Item-level retries
  - Partial success
  - Parallelism later

---

## Execution Model

### Asynchronous by Default

- Source triggers enqueue ingestion work
- Item processing never blocks the caller
- UI may show partial or stale data briefly

This aligns with:

- Hourly background sync
- On-demand refresh
- Cloudflare Worker execution limits

---

## Idempotency Strategy

### Primary Idempotency Key

```
(user_id, provider, provider_item_id)
```

- Anchored in provider-native identity
- Checked before any domain writes
- Prevents duplicate Inbox items

---

## provider_items_seen Table

Purpose-built for ingestion bookkeeping.

```sql
CREATE TABLE provider_items_seen (
  id TEXT PRIMARY KEY,

  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_item_id TEXT NOT NULL,

  source_id TEXT,
  first_seen_at TEXT NOT NULL
);
```

### Indexes

```sql
CREATE UNIQUE INDEX idx_seen_provider_item
  ON provider_items_seen(user_id, provider, provider_item_id);
```

---

## Idempotency Flow

For each raw provider item:

1. Extract `(user_id, provider, provider_item_id)`
2. Query `provider_items_seen`
3. If exists → **stop processing**
4. Insert into `provider_items_seen`
5. Continue ingestion

This guarantees:

- Safe retries
- Replayable ingestion
- No duplicate user_items

---

## Canonical Resolution

### Strategy

- Attempt canonical resolution using:
  - Provider ID (preferred)
  - Canonical URL (fallback)
- Resolution may be partial or incomplete

### Failure Handling

If canonical resolution fails:

- Still create a minimal canonical item
- Still surface item in Inbox
- Enrichment can fix metadata later

This favors **resilience over strictness**.

---

## Canonical Item Upsert

- Create or update `canonical_items`
- Do not block on enrichment
- Maintain provider references
- Update `updated_at` on changes

---

## User Item Creation

- Create or upsert `user_items`
- Initial state: `INBOX`
- Enforced invariant:
  - One `(user_id, canonical_item_id)` row

Inbox flooding is avoided by:

- Provider idempotency
- No historical backfill by default

---

## Enrichment Pipeline

### Characteristics

- Fully asynchronous
- Retryable
- Non-blocking

### Typical Enrichment Jobs

- Metadata extraction
- Title / summary generation
- Thumbnail resolution
- Duration parsing
- Language detection

Failures:

- Logged
- Retryable
- Never block ingestion or Inbox visibility

---

## Source History Policy

### Default Behavior

- Only ingest **new items from now on**
- No automatic historical backfill

Benefits:

- Predictable Inbox size
- Fast initial sync
- Avoids user overwhelm

Historical import can be added later as an explicit action.

---

## Failure Isolation

Failures are scoped to:

- Individual items
- Individual enrichment steps

Never:

- Entire source
- Entire ingestion run
- User-facing workflows

Optional `ingestion_runs` table can be used for:

- Observability
- Debugging
- Manual replay

---

## What This Architecture Enables

- Safe reprocessing
- Incremental provider support
- Clean domain boundaries
- Easy experimentation
- Low operational overhead

---

## Explicit Non-Goals

- No exactly-once semantics across systems
- No real-time ingestion guarantees
- No strict ordering guarantees
- No ingestion-driven UX coupling

---

## Next Topic

**Sync & local-first strategy**

- Client caching
- Refresh semantics
- Offline behavior
- Eventual consistency UX
