# RSS Data Source Integration Plan

## 1. Executive Summary

This plan adds RSS as a first-class ingestion source alongside YouTube, Spotify, and Gmail newsletters.

Recommended approach:

- Implement RSS as a parallel source pipeline under `subscriptions.rss` (similar to `subscriptions.newsletters`), not by overloading the YouTube/Spotify OAuth subscription flow.
- Reuse existing canonical ingestion (`items`, `user_items`, creator normalization, idempotency behavior) so RSS items behave like all other content in Inbox and Library.
- Roll out in phases: manual feed add + sync, then scheduled polling, then optional integration into global async pull-to-refresh.

This minimizes risk because the current subscription/sync stack is strongly specialized for OAuth providers.

---

## 2. Goals and Non-Goals

### Goals

- Users can add, manage, and remove RSS feeds from mobile.
- New feed entries ingest into Inbox with idempotency and deduplication.
- Polling is reliable, resource-bounded, and safe against malicious feed URLs.
- RSS integrates with existing item model, creator view, and bookmarking flows.
- Feature is observable and operable in production.

### Non-Goals (initial release)

- Full-text feed search/discovery marketplace.
- OPML import/export.
- Push/WebSub support.
- Cross-user global dedupe beyond existing canonical URL/provider rules.

---

## 3. Current State and Constraints

### What already exists

- Shared provider enum already includes `RSS`.
- Canonical tables (`items`, `creators`) already allow RSS providers.
- Ingestion creator logic already supports synthetic creator IDs for RSS-like providers.
- Legacy `sources` router has RSS URL/name/providerId derivation logic that can be reused.

### Constraints in current architecture

- `subscriptions` router and sync types are explicitly narrowed to `'YOUTUBE' | 'SPOTIFY'`.
- Async sync queue processing assumes active OAuth provider connections for each subscription.
- Scheduled polling is split by provider cron entries and lock keys.
- Mobile subscription routes and hooks are typed for YouTube/Spotify (plus Gmail in separate path).

Implication: RSS should not be forced into OAuth-specific branches for V1. It should follow the newsletter pattern: parallel source-specific router + poller + ingestion into shared content model.

---

## 4. Architecture Decision

### 4.1 Options Considered

### Option A: Extend existing `subscriptions` provider union to include RSS everywhere

Pros:

- Single subscription API surface.
- Shared discover/sync UX.

Cons:

- Large refactor across routers, sync queue messages, provider client assumptions, connection validation, and mobile type unions.
- High regression risk for existing YouTube/Spotify flows.

### Option B (Recommended): Add `subscriptions.rss` parallel module

Pros:

- Matches existing `subscriptions.newsletters` pattern.
- Keeps OAuth and non-OAuth source semantics separate.
- Smaller, safer incremental rollout.

Cons:

- Two source management paths under `subscriptions` namespace.

Decision: Option B.

### 4.2 Decisions Recorded

- RSS is **feed-only in V1**.
- Do **not** add RSS support to `creators.subscribe` / `creators.checkSubscription` in V1.
- Creator pages for RSS content should use a feed-management affordance (for example "Manage RSS feeds") instead of creator-level subscribe semantics.
- OPML import/export is **out of scope for the initial RSS milestone** and deferred until core RSS add/poll/ingest is stable.
- Initial seed behavior is **latest 1 item only** per newly added RSS feed.
- RSS is **out of the existing async sync queue in V1**; use scheduled polling + per-feed `subscriptions.rss.syncNow`.

---

## 5. Proposed System Design

### 5.1 Backend Components

Add a new RSS module in worker:

- `apps/worker/src/rss/` (feed fetch, parse, normalize, transform, poll logic)
- `apps/worker/src/trpc/routers/rss.ts` (management APIs)
- `subscriptions.rss` mounted in root tRPC router
- scheduled cron branch and distributed lock for RSS polling

### 5.2 Data Flow

1. User adds feed URL.
2. Server validates URL, normalizes it, fetches feed metadata.
3. Feed row is created/upserted as active.
4. Initial seed ingests latest item only.
5. Scheduled poller fetches feed with conditional headers (ETag/Last-Modified).
6. New entries transform to canonical item shape and ingest via existing ingestion contracts.
7. User sees items in Inbox.

---

## 6. Data Model Changes

### 6.1 New Tables

### `rss_feeds`

Purpose: feed registry + polling state per user feed.

Suggested fields:

- `id` TEXT PK (ULID)
- `user_id` TEXT FK users
- `feed_url` TEXT (normalized, canonicalized)
- `feed_url_hash` TEXT (for lookup/index convenience)
- `title` TEXT
- `description` TEXT
- `site_url` TEXT
- `image_url` TEXT
- `etag` TEXT NULL
- `last_modified` TEXT NULL
- `last_polled_at` INTEGER NULL (Unix ms)
- `last_success_at` INTEGER NULL
- `last_error_at` INTEGER NULL
- `error_count` INTEGER NOT NULL DEFAULT 0
- `status` TEXT NOT NULL DEFAULT `'ACTIVE'` (`ACTIVE|PAUSED|UNSUBSCRIBED|ERROR`)
- `poll_interval_seconds` INTEGER NOT NULL DEFAULT 3600
- `created_at` INTEGER NOT NULL
- `updated_at` INTEGER NOT NULL

Indexes/constraints:

- UNIQUE `(user_id, feed_url)`
- index for polling due feeds: `(status, last_polled_at)`
- index `(user_id, status, updated_at)`

### `rss_feed_items`

Purpose: mapping of feed entries to canonical items and feed-level item identity.

Suggested fields:

- `id` TEXT PK
- `rss_feed_id` TEXT FK `rss_feeds`
- `item_id` TEXT FK `items`
- `entry_id` TEXT NOT NULL (GUID/canonical URL/hash fallback)
- `entry_url` TEXT NULL
- `published_at` INTEGER NULL
- `fetched_at` INTEGER NOT NULL

Indexes/constraints:

- UNIQUE `(rss_feed_id, entry_id)`
- index `(rss_feed_id, published_at)`
- index `(item_id)`

### 6.2 Existing Table Usage

- Reuse `items` with `provider = 'RSS'`.
- Reuse `user_items` for Inbox/bookmark/archive states.
- Reuse `creators` with synthetic `providerCreatorId` when feed does not expose stable author IDs.

Note: Do not reuse legacy `sources` for new RSS implementation; keep `sources` as historical/legacy surface.

---

## 7. Identity and Deduplication Rules

### 7.1 Feed identity

- Primary key: normalized `feed_url`.
- Normalize URL before storage:
  - force `http/https` only
  - lowercase host
  - remove default ports
  - remove trailing slash when safe
  - reject localhost/private addresses

### 7.2 Entry identity

Per feed `entry_id` fallback order:

1. `guid` (if stable/non-empty)
2. normalized entry URL
3. hash of `(title + publishedAt + contentSnippet + feedUrl)`

### 7.3 Canonical item identity

For `items(provider='RSS')`, `provider_id` fallback order:

1. normalized entry URL (preferred for cross-feed dedupe)
2. `guid`
3. hash fallback

This keeps item identity deterministic while tolerating low-quality feeds.

---

## 8. API Design (`subscriptions.rss`)

Add router namespace parallel to newsletters:

- `subscriptions.rss.list`
- `subscriptions.rss.add`
- `subscriptions.rss.remove`
- `subscriptions.rss.pause`
- `subscriptions.rss.resume`
- `subscriptions.rss.syncNow`
- `subscriptions.rss.stats`

### 8.1 Endpoint behavior

`add({ feedUrl })`

- Validate + normalize URL.
- Fetch feed metadata and parse.
- Upsert feed (reactivate if unsubscribed).
- Seed latest entry (ingest max 1 item).

`list({ status?, search?, limit?, cursor? })`

- Paginated feed list for current user with latest sync status.

`remove({ feedId })`

- Soft-unsubscribe (`status='UNSUBSCRIBED'`).
- Keep previously ingested items intact.

`pause/resume({ feedId })`

- Toggle polling participation without data deletion.

`syncNow({ feedId })`

- Manual on-demand poll for one feed with rate limiting.
- Manual sync intentionally bypasses conditional `304` short-circuiting so it can reprocess recent entries for metadata repair/backfill.
- Return `{ success, itemsFound }`.

### 8.2 Error model

Use `TRPCError` codes aligned with existing patterns:

- `BAD_REQUEST` for invalid/unsafe URLs.
- `PRECONDITION_FAILED` for parse/fetch preconditions.
- `TOO_MANY_REQUESTS` for manual sync rate limits.
- `NOT_FOUND` for ownership/feed existence checks.

---

## 9. Polling and Scheduling

### 9.1 Scheduled polling

Add an RSS cron slot and lock:

- New cron expression in `wrangler.toml`, e.g. `45 * * * *`.
- New lock key: `cron:poll-rss:lock`.

Polling steps:

1. Query due `rss_feeds` (`status='ACTIVE'` and interval elapsed).
2. Fetch with conditional headers (`If-None-Match`, `If-Modified-Since`).
3. On `304`, update `last_polled_at` and return.
4. On new content, parse entries and ingest new items.
5. Update feed metadata, ETag/Last-Modified, and health counters.

### 9.2 Backoff and reliability

- Increment `error_count` on failure.
- Exponential backoff via temporary interval increase when repeated failures occur.
- Reset `error_count` on success.
- After threshold (for example 10 consecutive failures), mark status `ERROR` and surface in UI.

### 9.3 Global pull-to-refresh integration

Phase 1: keep RSS out of current `syncAllAsync` queue path to avoid touching OAuth assumptions.

Phase 2:

- Extend sync message provider union to include `RSS`.
- Allow queue consumer to process RSS messages without requiring provider connection rows.
- Include active RSS feeds in async sync job total/progress.

---

## 10. RSS Parsing and Transformation

### 10.1 Feed format support

- RSS 2.0
- Atom
- RDF RSS (best effort if parser supports)

### 10.2 Field normalization

Map feed entry to canonical item:

- `contentType`: `ARTICLE` (default)
- `provider`: `RSS`
- `providerId`: identity rules above
- `canonicalUrl`: normalized link
- `title`: entry title or fallback
- `summary`: description/content snippet
- `creator`: author/feed title fallback
- `publishedAt`: parsed date or fetch time fallback
- `thumbnailUrl`: media tags (`media:*`, `enclosure`, `image`) with fallback to first `<img src>` found in entry summary/content HTML

Best-effort enrichment for RSS entries:

- Run `fetchLinkPreview(canonicalUrl)` during ingestion for entries that are likely under-enriched
  (for example HTML summary, missing thumbnail, missing creator image).
- Use preview metadata (`description`, `thumbnailUrl`, `creator`, `creatorImageUrl`) to align RSS
  item quality with manual bookmark ingestion.
- If preview enrichment fails, continue with parsed feed metadata (no hard failure).

### 10.3 Initial history policy

Align with existing ingestion policy:

- On first subscribe, ingest latest 1 entry only.
- No automatic bulk historical backfill.
- Add explicit backfill later if needed.

---

## 11. Security and Abuse Prevention

RSS adds fetch-based attack surface. Required controls:

- URL allowlist by scheme: `http` and `https` only.
- SSRF blocking:
  - deny localhost, loopback, link-local, private IP ranges
  - re-validate after redirects
- Redirect cap (for example max 3).
- Response limits:
  - max body size (for example 1-2 MB)
  - fetch timeout (for example 10s)
- XML parser hardening:
  - disable external entities/DTD expansion
  - avoid billion-laughs style payload risks
- Store raw payload metadata only when necessary and size-bounded.

---

## 12. Mobile App Plan

### 12.1 Navigation and provider model

Current mobile subscription UI is typed for `YOUTUBE | SPOTIFY | GMAIL`.

Add RSS as non-OAuth provider card with dedicated management screen:

- Update provider route validation to include `rss` for subscription route (not discover route).
- Add RSS card in subscriptions index.
- Add RSS feed list screen with add URL form and per-feed actions.
- Keep RSS out of creator subscribe/check-subscription UI for V1.

### 12.2 UX behavior

- Add feed CTA accepts URL paste.
- Validate quickly client-side, then server-side authoritative validation.
- Feed rows show:
  - feed title/domain
  - status badge
  - last sync time / error indicator
  - actions: pause/resume, sync now, remove

### 12.3 Offline behavior

- Queue add/remove/pause/resume/sync mutations through existing offline mutation framework.
- On reconnect, invalidate feed list + inbox queries.

---

## 13. Observability and Operations

### 13.1 Logs and metrics

Track at minimum:

- feeds polled
- HTTP status distribution (`200`, `304`, errors)
- parse failures
- entries processed
- new items ingested
- duplicate/skipped counts
- per-feed error streaks
- poll duration distribution

### 13.2 Debug/admin support

Add optional admin/read-only endpoint or logs query support for:

- feed health snapshot
- recent RSS poll failures
- latest ingested entry per feed

---

## 14. Testing Strategy

### 14.1 Unit tests

- URL normalization and SSRF rejection rules.
- Feed parser adapters (RSS/Atom variants).
- Entry identity fallback correctness.
- Transformer mappings and date parsing.

### 14.2 Integration tests

- `subscriptions.rss` CRUD and syncNow behavior.
- Polling flow with mock feeds:
  - first seed
  - 304 no-change
  - new entry ingestion
  - duplicate entry skipped
- Error/retry/backoff state transitions.

### 14.3 End-to-end checks

- Add RSS feed in app, trigger sync, verify inbox item appears.
- Pause feed, verify no new items on cron.
- Remove feed, verify old items remain but new ingestion stops.

---

## 15. Rollout Plan

### Phase 0: Foundation

- Add schema migrations (`rss_feeds`, `rss_feed_items`).
- Add parser/fetcher module + security guards.
- Add router skeleton and feature flag.

Exit criteria:

- Unit tests passing for normalization/parsing/identity.

### Phase 1: Manual management and sync

- Implement `subscriptions.rss` APIs.
- Mobile RSS provider card + feed management screen.
- `syncNow` endpoint and initial seed on add.

Exit criteria:

- User can add a feed and get latest item in Inbox.

### Phase 2: Scheduled polling

- Add cron + lock + batch poll loop.
- Add metrics/logging and error backoff.

Exit criteria:

- Stable scheduled ingestion in staging with no regression to existing providers.

### Phase 3: Async global sync integration (optional)

- Extend queue sync types/consumer to include RSS.
- Include RSS in global pull-to-refresh progress reporting.

Exit criteria:

- `syncAllAsync` correctly includes RSS feeds.

---

## 16. Risks and Mitigations

- Regression risk in OAuth subscriptions path:
  - Mitigation: keep RSS in parallel module initially.
- Feed quality variability (missing GUID/date/author):
  - Mitigation: deterministic fallback identity + conservative defaults.
- Network and parser abuse surface:
  - Mitigation: strict URL/network/parser limits as above.
- Duplicate content across feeds:
  - Mitigation: canonical URL-first item identity when possible.

---

## 17. Open Questions

- [Resolved] RSS remains feed-only in V1; no `creators.subscribe/checkSubscription` support.
- [Resolved] OPML import/export is deferred and out of scope for the initial RSS milestone.
- [Resolved] Initial seed ingests latest 1 item.
- [Resolved] RSS stays out of the existing async sync queue in V1; use scheduled polling + per-feed `subscriptions.rss.syncNow`.

---

## 18. Implementation Checklist

Backend:

- [x] Add D1 migrations for RSS tables.
- [x] Implement RSS fetch/parse/normalize module.
- [x] Implement `subscriptions.rss` router.
- [x] Wire router into root tRPC router.
- [x] Add RSS cron handler and lock key.
- [x] Add telemetry and error-state handling.

Mobile:

- [x] Add RSS provider route typing and card.
- [x] Build RSS management screen and add-feed form.
- [ ] Hook RSS APIs into offline mutation system.
- [x] Add status/error UI states.

Quality:

- [x] Unit/integration tests for RSS flows.
- [x] Manual iOS simulator validation for core RSS UX flows.
- [x] Update docs for API and runbooks.
- [ ] Staging soak test with representative feed set.

### 18.1 Validation Notes (Feb 18, 2026)

- Manual iOS simulator verification completed for add, pause, resume, sync-now, and remove flows.
- Large feed payload guardrail validated with user-facing error:
  `Feed payload too large (1742435 bytes)`.
- Post-remove UI behavior validated after fix: `UNSUBSCRIBED` feeds are no longer shown in the default feed list.
- RSS parser fallback now extracts the first image from Atom/RSS summary HTML for feeds like
  `https://simonwillison.net/atom/everything/`, fixing missing thumbnails on ingested items.
- Duplicate RSS entries now backfill `items.thumbnail_url` when the canonical item exists but has
  no thumbnail, so re-sync can repair older image-less RSS records.
- RSS ingestion now uses link-preview/article extraction enrichment for under-enriched entries,
  which fixes raw HTML descriptions and missing creator/cover images for feeds such as
  `https://lucumr.pocoo.org/feed.atom`.
- Canonical RSS items are now metadata-backfilled in both seen and canonical-existing paths,
  so re-sync can repair older items that predated this enrichment (clean summary, cover image,
  and creator linkage).
- `subscriptions.rss.syncNow` now performs a non-conditional fetch (`useConditional: false`) so
  manual sync can force entry reprocessing/backfill even when the feed itself has no new ETag content.
- Remaining scope intentionally deferred:
  RSS is out of the global async sync queue in V1, and RSS mutations are not yet routed through the offline mutation queue.
