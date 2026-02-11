# Plan: Gmail Newsletter Subscriptions and Inbox Ingestion

## Status

Draft for product + engineering alignment.

## Purpose

Define a concrete implementation plan for a Gmail-connected newsletter feature in Zine, including:

- OAuth account connection
- Newsletter detection from inbox mail
- Newsletter issue ingestion into Zine inbox
- Newsletter management actions (hide/unsubscribe/sync)
- Security, compliance, and rollout strategy

This plan is intentionally implementation-oriented and mapped to the current monorepo architecture.

---

## Problem Statement

Users can already connect YouTube/Spotify and ingest content automatically. We want a comparable experience for newsletters by connecting Gmail, detecting recurring newsletter senders, and letting users manage those newsletters from Zine.

The feature should feel like "connect once, then newsletters appear and are manageable," with clear controls and privacy boundaries.

---

## Experience Decisions (Locked)

1. Newsletters are a first-class source, alongside existing provider sources (YouTube, Spotify, X, etc.).
2. Newsletter issues are rendered using the article presentation model, not a custom reader UI.
3. Newsletter issues flow through the same item lifecycle as other sources:
   - land in Inbox
   - can be bookmarked to Library
   - can be archived
4. Item detail should use the standard non-X detail path already used by articles.
5. Gmail connection starts from the Subscriptions page (provider cards), not from a separate settings-first flow.
6. Gmail connect UX follows the same pattern as existing YouTube/Spotify connect screens (permissions, trust messaging, branded CTA, loading/error handling).
7. Source management should feel consistent with existing provider connection/subscription surfaces.

---

## Goals

1. Connect Gmail using the same secure OAuth model used by existing provider connections.
2. Detect newsletters from inbox metadata with high precision.
3. Create inbox items for newsletter issues so they fit existing triage flows.
4. Allow users to manage detected newsletters (active, hidden, unsubscribed state).
5. Keep the system resilient with incremental sync and safe fallback behavior.
6. Preserve security and data-minimization posture.

## Non-Goals (MVP)

1. Full email-client replacement behavior.
2. Bulk parsing and storing full email HTML bodies.
3. Guaranteed one-tap external signup to new newsletters not already in inbox.
4. Perfect unsubscribe completion for all publishers (best effort with clear status).

---

## Success Metrics

1. Gmail connect completion rate from start -> connected.
2. Detection precision on sampled feeds (target >= 95 percent high-confidence newsletters).
3. Time to first newsletter surfaced after connect (target <= 2 minutes for small inboxes).
4. Daily incremental sync success rate (target >= 99 percent).
5. Unsubscribe action completion rate with explicit method/result tracking.
6. Support burden: low volume of duplicate ingestion and missing-item reports.

---

## Architecture Fit (Existing System Reuse)

We reuse major existing components:

1. OAuth state registration + callback flow:
   - `apps/mobile/lib/oauth.ts`
   - `apps/worker/src/trpc/routers/connections.ts`
2. Encrypted token storage in `provider_connections`:
   - `apps/worker/src/db/schema.ts`
3. Token refresh + distributed locking:
   - `apps/worker/src/lib/token-refresh.ts`
4. Existing ingestion destination model:
   - `items` + `user_items` for inbox/bookmark/archive states
5. Existing sync and async job patterns:
   - `apps/worker/src/sync/*`
   - `apps/worker/src/polling/*`

Decision: Gmail will be added as a first-class OAuth provider, but newsletter detection/sync stays mailbox-centric instead of reusing YouTube/Spotify subscription polling directly.

Rationale:

1. YouTube/Spotify model is creator/channel polling.
2. Gmail model is one mailbox stream with message-level delta sync.
3. Reusing the same tables without mailbox-specific state would create avoidable complexity.

---

## Domain Model Additions

## Enum and Shared Type Updates

1. Add `GMAIL` to provider enums/schemas:
   - `packages/shared/src/types/domain.ts`
   - `packages/shared/src/schemas/index.ts`
2. Extend worker/mobile provider handling wherever provider switches are hard-coded for `YOUTUBE`/`SPOTIFY`.

## Database Changes

Use Unix ms timestamps for all new tables.

### 1) `gmail_mailboxes`

Represents one connected Gmail mailbox per user.

Suggested columns:

- `id` TEXT primary key (ULID)
- `user_id` TEXT not null
- `provider_connection_id` TEXT not null references `provider_connections.id`
- `google_sub` TEXT not null
- `email` TEXT not null
- `history_id` TEXT
- `watch_expiration_at` INTEGER
- `last_sync_at` INTEGER
- `last_sync_status` TEXT default `IDLE`
- `last_sync_error` TEXT
- `created_at` INTEGER not null
- `updated_at` INTEGER not null

Suggested indexes:

- unique `(user_id, provider_connection_id)`
- index on `(last_sync_status, updated_at)`

### 2) `newsletter_feeds`

Canonical newsletter sender/list metadata per user.

Suggested columns:

- `id` TEXT primary key (ULID)
- `user_id` TEXT not null
- `gmail_mailbox_id` TEXT not null references `gmail_mailboxes.id`
- `canonical_key` TEXT not null
- `list_id` TEXT
- `from_address` TEXT
- `display_name` TEXT
- `unsubscribe_mailto` TEXT
- `unsubscribe_url` TEXT
- `unsubscribe_post_header` TEXT
- `detection_score` REAL not null
- `status` TEXT not null default `ACTIVE` (`ACTIVE`, `HIDDEN`, `UNSUBSCRIBED`)
- `first_seen_at` INTEGER not null
- `last_seen_at` INTEGER not null
- `created_at` INTEGER not null
- `updated_at` INTEGER not null

Suggested indexes:

- unique `(user_id, canonical_key)`
- index `(gmail_mailbox_id, status, last_seen_at)`

### 3) `newsletter_feed_messages`

Mapping between Gmail messages, feeds, and ingested Zine items.

Suggested columns:

- `id` TEXT primary key (ULID)
- `user_id` TEXT not null
- `gmail_mailbox_id` TEXT not null references `gmail_mailboxes.id`
- `newsletter_feed_id` TEXT not null references `newsletter_feeds.id`
- `gmail_message_id` TEXT not null
- `gmail_thread_id` TEXT
- `item_id` TEXT not null references `items.id`
- `internal_date` INTEGER
- `created_at` INTEGER not null

Suggested indexes:

- unique `(user_id, gmail_message_id)`
- index `(newsletter_feed_id, internal_date)`

### 4) `newsletter_unsubscribe_events`

Audit and UX status tracking for unsubscribe attempts.

Suggested columns:

- `id` TEXT primary key (ULID)
- `user_id` TEXT not null
- `newsletter_feed_id` TEXT not null references `newsletter_feeds.id`
- `method` TEXT not null (`URL`, `MAILTO`, `ONE_CLICK_POST`)
- `target` TEXT not null
- `status` TEXT not null (`REQUESTED`, `COMPLETED`, `FAILED`)
- `error` TEXT
- `requested_at` INTEGER not null
- `completed_at` INTEGER

Suggested indexes:

- index `(newsletter_feed_id, requested_at)`
- index `(user_id, requested_at)`

### Migration Notes

1. New migration file should follow existing sequence in `apps/worker/src/db/migrations`.
2. Update Drizzle schema and corresponding inferred types.
3. Keep existing legacy ISO timestamp tables unchanged in MVP.

---

## OAuth and Provider Connection Plan

## Mobile

1. Add Gmail OAuth config in `apps/mobile/lib/oauth.ts`.
2. Reuse PKCE/state flow (`registerState` -> browser auth -> `callback` mutation).
3. Add Gmail provider card and route flow in subscriptions surfaces:
   - `apps/mobile/app/subscriptions/index.tsx`
   - `apps/mobile/app/subscriptions/[provider].tsx`
   - `apps/mobile/app/subscriptions/connect/gmail.tsx`
4. Keep Settings as status/management visibility, but connection initiation should originate from Subscriptions UX.

## Worker

1. Extend auth/token exchange support for `GMAIL` in `apps/worker/src/lib/auth.ts`.
2. Extend token refresh provider config in `apps/worker/src/lib/token-refresh.ts`.
3. Keep using `provider_connections` for encrypted access/refresh tokens.
4. On first Gmail callback success, upsert `gmail_mailboxes` row and enqueue initial sync.

## OAuth Scope Strategy (MVP)

Use read-only mailbox scope plus identity scopes, then validate policy posture before production launch.

Pragmatic recommendation for MVP:

1. Start with read-only + metadata retrieval pipeline.
2. Avoid write scopes in phase 1.
3. Unsubscribe actions that require user mail send should be explicit and transparent.

---

## Ingestion and Detection Pipeline

## Sync Modes

### Initial Bootstrap Sync

Triggered immediately after successful Gmail connection.

1. Fetch bounded recent window (for example last 30 days).
2. Pull message IDs in batches.
3. Fetch message metadata (headers/snippet/internalDate/threadId).
4. Detect newsletter feed identity and upsert `newsletter_feeds`.
5. Transform each eligible message into a Zine `item` + `user_item(INBOX)`.
6. Write mapping row in `newsletter_feed_messages`.
7. Persist latest `history_id` in `gmail_mailboxes`.

### Incremental Sync

Runs on schedule and on explicit user-triggered sync.

1. Use saved `history_id` for delta fetch.
2. Process only newly added messages.
3. If history cursor is invalid or stale, run bounded backfill recovery.
4. Update mailbox sync status/error fields.

## Detection Heuristics

Use weighted scoring to minimize false positives:

1. Strong positive signals:
   - `List-Id`
   - `List-Unsubscribe`
   - `List-Unsubscribe-Post`
2. Medium signals:
   - sender naming conventions (`newsletter`, `digest`, `updates`)
   - recurring cadence from same sender
3. Weak/negative signals:
   - transactional or personal patterns
   - known receipt/order/password-reset keywords

Store:

1. Detection score
2. Headers used for classification (normalized)
3. Canonical feed key generation logic

Canonical key fallback order:

1. Normalized `List-Id`
2. Normalized unsubscribe target
3. Normalized sender address

## Item Mapping

Each newsletter issue becomes an item in existing inbox flow:

1. `contentType`: `ARTICLE`
2. `provider`: `GMAIL`
3. `providerId`: deterministic user-scoped ID (for example `${googleSub}:${gmailMessageId}`)
4. `title`: subject header
5. `summary`: snippet/cleaned preview
6. `creator`: feed display name or sender
7. `canonicalUrl`: best outbound primary link if extracted, else Gmail thread fallback URL

Idempotency:

1. Keep `provider + providerId` stable.
2. Optionally also gate by `newsletter_feed_messages` unique key.

Rendering contract:

1. `contentType = ARTICLE` so cards/detail use article copy and metadata treatment.
2. No newsletter-specific item detail layout in MVP.
3. If no thumbnail exists, use existing article fallback rendering.
4. Primary action remains external open; target is extracted issue URL or mailbox fallback URL.

---

## API Plan (tRPC)

Add router namespace:

- `subscriptions.newsletters.*` (recommended for consistency)

Suggested procedures:

1. `subscriptions.newsletters.list`
   - filters: `status`, `search`, pagination
2. `subscriptions.newsletters.updateStatus`
   - set `ACTIVE` or `HIDDEN`
3. `subscriptions.newsletters.unsubscribe`
   - triggers method-specific unsubscribe flow and records event
4. `subscriptions.newsletters.syncNow`
   - mailbox-level manual sync trigger
5. `subscriptions.newsletters.stats`
   - feed count, last sync, pending errors

Support updates:

1. `subscriptions.connections.list` currently returns fixed keys for YouTube/Spotify; this should become provider-extensible.
2. Add Gmail-specific connection health to connection UI.

---

## Unsubscribe Strategy

Unsubscribe methods by priority:

1. One-click POST (if header supports it)
2. Unsubscribe URL (open and confirm completion)
3. Mailto fallback

Behavior rules:

1. Always record an unsubscribe event row.
2. Show method used and status in UI.
3. If completion is uncertain, mark as `REQUESTED` and prompt user to confirm.
4. Do not silently claim success without verifiable signal.

---

## Security, Privacy, and Compliance

1. Encrypt OAuth tokens at rest (existing AES-256-GCM path).
2. Minimize stored email data:
   - store headers/snippet needed for feature
   - avoid raw body storage in MVP
3. Redact sensitive data from logs.
4. Respect revocation:
   - connection status update
   - mailbox sync stop
5. Maintain explicit user controls:
   - disconnect Gmail
   - hide feed
   - unsubscribe trigger history
6. Complete Google API policy verification/security requirements before production launch.

---

## Operational Plan

1. Scheduler:
   - run incremental sync on fixed interval for active Gmail mailboxes
2. Concurrency:
   - mailbox-level locks in KV to avoid duplicate sync workers
3. Recovery:
   - stale/invalid history cursor triggers bounded backfill
4. Observability:
   - sync duration, message throughput, detection precision counters
5. Rate limit handling:
   - exponential backoff with jitter
6. Feature flags:
   - internal users -> beta cohort -> wider rollout

---

## Testing Plan

## Unit Tests

1. Header parser and canonical key builder.
2. Detection scorer false-positive/false-negative fixtures.
3. Message-to-item transformer.
4. Unsubscribe method selector and status transitions.

## Integration Tests

1. OAuth callback creates/updates mailbox state.
2. Initial sync inserts feeds, messages, items, and user_items idempotently.
3. Incremental sync handles normal delta and stale cursor fallback.
4. Disconnect/reconnect behavior reactivates sync state correctly.

## Contract and Router Tests

1. New tRPC procedures validation and authorization.
2. `connections.list` response compatibility after provider extensibility changes.

## Manual Verification Checklist

1. Connect Gmail on mobile and confirm connected provider status.
2. Run first sync and verify detected newsletter list appears.
3. Confirm newsletter issues land in Inbox and can be bookmarked/archived.
4. Hide a newsletter feed and verify new issues from that feed are suppressed.
5. Trigger unsubscribe and verify event status is visible.
6. Disconnect Gmail and verify sync stops with clear status.

---

## Phased Delivery Plan

## Phase 0: Foundation

1. Provider enum/schema updates.
2. OAuth + token refresh support for Gmail.
3. DB migrations for mailbox/newsletter tables.
4. Feature flag plumbing.

Acceptance:

1. Gmail can connect/disconnect with encrypted tokens.
2. New schema exists with tests passing.

## Phase 1: Detection + Ingestion MVP

1. Initial and incremental mailbox sync jobs.
2. Newsletter detection heuristics and feed persistence.
3. Issue ingestion into `items`/`user_items`.
4. Basic feeds list UI.

Acceptance:

1. User sees detected newsletters and newsletter issues in Inbox.
2. No duplicate issue ingestion across repeated sync runs.

## Phase 2: Management UX

1. Feed status controls (`ACTIVE`/`HIDDEN`).
2. Unsubscribe execution and status tracking.
3. Sync health and last-sync visibility.

Acceptance:

1. User can manage newsletter feeds and see unsubscribe outcomes.

## Phase 3: Hardening and Scale

1. Optional push/watch optimization.
2. Better outbound-link extraction and ranking.
3. Detection model tuning and telemetry-driven threshold updates.

Acceptance:

1. Stable sync reliability and lower sync latency at scale.

---

## Risks and Mitigations

1. Risk: False positives classify transactional mail as newsletters.
   - Mitigation: conservative threshold + user hide feedback loop.
2. Risk: OAuth/policy review delays launch.
   - Mitigation: start policy prep early with clear scope and data minimization docs.
3. Risk: History cursor invalidation causes missed messages.
   - Mitigation: bounded recovery backfill plus alerting.
4. Risk: Unsubscribe behavior differs per publisher.
   - Mitigation: method-aware statuses and transparent user messaging.
5. Risk: Hard-coded provider assumptions regress existing flows.
   - Mitigation: provider-extensibility updates plus regression tests on YouTube/Spotify.

---

## Open Product Questions (for follow-up discussion)

1. Should newsletter issues always enter Inbox, or optionally go straight to Library for some users?
2. Should we expose "auto-hide low-confidence feeds" in MVP or keep detection strictly manual review?
3. How explicit should unsubscribe UX be when completion cannot be confirmed?
