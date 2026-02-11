# Plan: Gmail Newsletter Link-Level Ingestion and Source/Creator Views

## Status

Proposed for implementation.

## Purpose

Define a concrete redesign plan for Gmail newsletters to satisfy two requirements:

1. Inbox items should represent the actual content links inside newsletter emails (not the email shell).
2. Users should be able to open a creator/source view for newsletters and see all content from that author/publication, similar to existing Spotify/YouTube flows.

This plan builds on the existing Gmail newsletter MVP already implemented in this repo.

---

## Requirements (Locked)

1. Newsletter ingestion is link-first for ACTIVE feeds: extract actual shared links from each issue and ingest those as canonical items.
2. Newsletter sources are subscribable/opt-in by default (already true) and support feed-level browsing.
3. Creator/source view supports newsletter creators with latest content + bookmarked content, consistent with current creator UX patterns.
4. Existing inbox/bookmark/archive lifecycle remains unchanged.

## Non-Goals

1. Full email client behavior.
2. Storing complete email body content long-term.
3. Perfect extraction from every newsletter format in v1 (fallback behavior required).
4. Replacing current YouTube/Spotify polling architecture.

---

## Current State and Gaps

Current Gmail ingestion:

- Detects newsletters from metadata (`From`, `Subject`, `List-*`).
- Creates one item per Gmail message when feed is ACTIVE.
- Item fields are mostly email metadata (`title=subject`, `summary=snippet`, URL from first snippet link or Gmail thread fallback).

Gaps versus requirements:

1. One-message-to-one-item model prevents multiple real links per issue.
2. Email metadata does not guarantee item URL is the primary article.
3. No robust provenance model for "issue -> extracted links -> canonical items".
4. Creator latest-content router currently supports only `YOUTUBE` and `SPOTIFY`.
5. Creator subscribe/check APIs currently reject non-YouTube/Spotify providers.

---

## Proposed Architecture

## High-Level Decision

Keep mailbox/feed detection as-is, but split ingestion into two logical layers:

1. Newsletter issue capture (message-level provenance).
2. Link-level content ingestion (many canonical items per issue).

The canonical `items` + `user_items` model remains the destination.

## Ingestion Pipeline (Target)

### Stage A: Message Capture (existing sync loop)

For each detected newsletter message:

1. Upsert feed identity.
2. Persist a `newsletter_messages` row keyed by `(user_id, gmail_message_id)`.
3. If feed is not `ACTIVE`, stop after provenance write.
4. If feed is `ACTIVE`, enqueue/process for link extraction.

### Stage B: Body Fetch + Link Extraction

1. Fetch Gmail message with body (`messages.get format=full` or equivalent MIME payload path).
2. Decode MIME parts and choose best HTML/text representation.
3. Extract anchor links and plain-text URLs.
4. Normalize and classify links (content vs unsubscribe/nav/tracking/share).
5. Persist extracted links in `newsletter_message_links`.

### Stage C: Canonical Item Ingestion from Links

For each content candidate link:

1. Canonicalize URL (strip tracking params, resolve known wrappers).
2. Reuse existing preview/enrichment pipeline (`fetchLinkPreview`) to determine provider/content metadata.
3. Upsert canonical `items` row (provider-specific dedupe).
4. Upsert `user_items` row with `state=INBOX` when first seen.
5. Persist provenance mapping in `newsletter_message_items`.

### Stage D: Feed and Creator Aggregation

1. Associate each feed to a normalized creator (`creators` row).
2. Query latest feed content through provenance mappings.
3. Render creator/source pages from local ingested data.

---

## Data Model Redesign

## New Tables

### `newsletter_messages`

One row per Gmail newsletter message.

Suggested columns:

- `id` TEXT PK (ULID)
- `user_id` TEXT NOT NULL
- `gmail_mailbox_id` TEXT NOT NULL
- `newsletter_feed_id` TEXT NOT NULL
- `gmail_message_id` TEXT NOT NULL
- `gmail_thread_id` TEXT
- `subject` TEXT
- `from_address` TEXT
- `from_display_name` TEXT
- `snippet` TEXT
- `internal_date` INTEGER
- `link_extraction_status` TEXT NOT NULL (`PENDING`, `SUCCESS`, `NO_LINKS`, `FAILED`)
- `link_extraction_error` TEXT
- `created_at` INTEGER NOT NULL
- `updated_at` INTEGER NOT NULL

Indexes:

- unique `(user_id, gmail_message_id)`
- index `(newsletter_feed_id, internal_date)`
- index `(link_extraction_status, updated_at)`

### `newsletter_message_links`

Raw/normalized links extracted from one newsletter message.

Suggested columns:

- `id` TEXT PK (ULID)
- `user_id` TEXT NOT NULL
- `newsletter_message_id` TEXT NOT NULL
- `url_original` TEXT NOT NULL
- `url_normalized` TEXT NOT NULL
- `url_canonical` TEXT
- `domain` TEXT
- `position` INTEGER
- `anchor_text` TEXT
- `classification` TEXT NOT NULL (`CONTENT`, `NAV`, `UNSUBSCRIBE`, `TRACKING`, `SOCIAL`, `UNKNOWN`)
- `score` REAL NOT NULL DEFAULT 0
- `provider_hint` TEXT
- `created_at` INTEGER NOT NULL

Indexes:

- unique `(newsletter_message_id, url_normalized)`
- index `(newsletter_message_id, score)`
- index `(user_id, domain)`

### `newsletter_message_items`

Provenance mapping from issue links to canonical items.

Suggested columns:

- `id` TEXT PK (ULID)
- `user_id` TEXT NOT NULL
- `newsletter_feed_id` TEXT NOT NULL
- `newsletter_message_id` TEXT NOT NULL
- `newsletter_message_link_id` TEXT
- `item_id` TEXT NOT NULL
- `provider` TEXT NOT NULL
- `provider_id` TEXT NOT NULL
- `canonical_url` TEXT NOT NULL
- `rank` INTEGER
- `created_at` INTEGER NOT NULL

Indexes:

- unique `(user_id, newsletter_message_id, item_id)`
- index `(newsletter_feed_id, created_at)`
- index `(item_id)`

## Existing Table Changes

### `newsletter_feeds`

Add:

- `creator_id` TEXT references `creators.id`
- `last_item_at` INTEGER (optional, for feed list sorting)
- `item_count` INTEGER default 0 (optional cached metric)

### Keep (but deprecate usage)

- `newsletter_feed_messages` becomes legacy compatibility during migration.
- New ingestion writes to new tables; old table can be backfilled or removed after cutover.

---

## Creator/Source View Redesign

## Creator Identity for Newsletters

Each newsletter feed maps to one creator:

- `provider = GMAIL`
- `providerCreatorId = newsletter_feeds.canonical_key`
- `name = feed.display_name`
- `handle = feed.from_address`
- `externalUrl = best publication URL`
- `imageUrl = favicon/publication image best-effort`

This allows reuse of existing creator screen and items joins.

## API Behavior Changes

### `creators.fetchLatestContent`

Current:

- Supports only YouTube/Spotify via provider APIs.

Target:

- Add `GMAIL` branch that returns latest ingested items from `newsletter_message_items` joined with `items`.
- No provider API calls for Gmail creator latest-content path.

### `creators.checkSubscription` and `creators.subscribe`

Current:

- Reject non-YouTube/Spotify providers.

Target for `GMAIL` creators:

- `checkSubscription` resolves from linked `newsletter_feed.status` + Gmail connection.
- `subscribe` sets `newsletter_feed.status = ACTIVE` (idempotent).
- Optional `unsubscribe/hide` can remain newsletter-router specific.

### Newsletter Router Additions

Add query endpoints:

- `subscriptions.newsletters.feedItems({ feedId, cursor, limit })`
- `subscriptions.newsletters.messageItems({ messageId })` (debug/provenance)
- `subscriptions.newsletters.feedStats({ feedId })`

These endpoints power provider-like source pages and diagnostics.

---

## Link Extraction and Ranking Rules

## Candidate Extraction

1. Parse HTML anchors first.
2. Parse plain text URLs second.
3. Dedupe by normalized URL.

## Exclusion Rules

Drop URLs matching:

- unsubscribe/manage/preferences/login/account paths
- tracking redirect-only links
- social share links without content target
- image pixel/tracker endpoints

## Prioritization Rules

Score boosts:

- likely content paths (`/p/`, `/article/`, `/posts/`, provider-specific content IDs)
- links with meaningful anchor text
- domains matching known content providers

Score penalties:

- nav/footer links
- repetitive boilerplate links

## Per-Issue Item Cap

Recommended v1 cap: max 5 ingested content links per issue.

Reason:

- Prevent inbox flooding from link-heavy newsletters.
- Still capture primary shared content.

---

## Privacy, Scopes, and Compliance

1. Gmail scope must permit body read for ACTIVE feed extraction (`gmail.readonly` recommended).
2. Update connect UX copy to explicitly mention body parsing for link extraction.
3. Do not persist full email body by default.
4. Persist only:
   - message metadata
   - extracted links and normalized attributes
   - provenance mappings
5. Redact or avoid storing sensitive query params in canonical URLs.

---

## Rollout Strategy

## Feature Flags

Add worker flags:

- `NEWSLETTER_LINK_INGESTION_ENABLED`
- `NEWSLETTER_CREATOR_VIEWS_ENABLED`
- `NEWSLETTER_LINK_BACKFILL_ENABLED`

## Phase Plan

### Phase 1: Schema and Creator Linking

Deliver:

- New tables + migrations
- `newsletter_feeds.creator_id`
- Feed upsert writes/updates creator link

Acceptance criteria:

- Migrations apply cleanly in local and CI.
- New feed rows always have `creator_id`.

### Phase 2: Link Extraction Pipeline (write-only)

Deliver:

- Body fetch + extraction + classification
- Persist `newsletter_messages` + `newsletter_message_links`
- No inbox behavior change yet

Acceptance criteria:

- > = 95% ACTIVE issues produce extraction status (success/no-links/failed).
- Processing errors are recorded and retryable.

### Phase 3: Link-to-Item Ingestion Cutover

Deliver:

- Create canonical items from extracted links
- Write `newsletter_message_items`
- Stop creating metadata-only email-shell inbox items

Acceptance criteria:

- Inbox contains actual linked content URLs for ACTIVE feeds.
- Duplicate items do not increase for repeated sync runs.

### Phase 4: Creator/Source Views for GMAIL

Deliver:

- Creator router GMAIL support (`latestContent`, `checkSubscription`, `subscribe`)
- Mobile creator components support GMAIL provider
- Newsletter feed item list screens and navigation

Acceptance criteria:

- Opening a newsletter creator shows latest linked content.
- Subscribe action from creator/feed surfaces maps to feed `ACTIVE`.

### Phase 5: Backfill + Cleanup

Deliver:

- Backfill recent ACTIVE messages into new tables
- Optional remove/retire legacy `newsletter_feed_messages` writes

Acceptance criteria:

- Historical (e.g., last 30 days) ACTIVE issues have link-derived items.
- Legacy table no longer required by runtime path.

---

## Implementation Work Breakdown (Issue Set)

## Epic: Newsletter Link Ingestion + Source Views

1. DB migration: add `newsletter_messages`, `newsletter_message_links`, `newsletter_message_items`, `newsletter_feeds.creator_id`.
2. Worker: feed upsert creator-linking via `findOrCreateCreator`.
3. Worker: Gmail full-message fetch + MIME parsing utility.
4. Worker: link extraction/classification and persistence.
5. Worker: canonical link resolution and preview enrichment integration.
6. Worker: link-based item ingestion + provenance mapping + dedupe.
7. Worker: creator router support for provider `GMAIL`.
8. Worker: newsletters router feed/content endpoints for source pages.
9. Mobile: creator latest-content UI support for `GMAIL`.
10. Mobile: newsletter feed detail/content list screens and navigation.
11. Observability: metrics/logging/dashboard + error budget alarms.
12. Backfill job and cutover/remove legacy ingestion path.

---

## Dependencies and Blockers

1. OAuth scope and consent copy must be finalized before Phase 2 rollout.
2. MIME parser must be Worker-compatible and tested for large/encoded payloads.
3. Link canonicalization quality directly impacts dedupe and creator attribution.
4. Product sign-off needed on per-issue item cap and archived-item resurfacing policy.

---

## Risks and Mitigations

1. Risk: inbox spam from newsletters with many links.
   Mitigation: cap + scoring + strict link classification.
2. Risk: wrong links ingested due to boilerplate noise.
   Mitigation: extraction tests with real fixture corpus; issue-level diagnostics.
3. Risk: creator fragmentation due to poor canonical keys.
   Mitigation: creator id keyed by feed canonical key + migration-safe updates.
4. Risk: runtime latency from body parsing and preview calls.
   Mitigation: staged async processing + bounded concurrency + retries.

---

## QA and Validation Plan

1. Unit tests:
   - MIME parsing, link extraction, ranking, URL normalization.
2. Integration tests:
   - issue -> links -> items -> inbox state transitions.
3. Regression tests:
   - dedupe behavior across repeated sync runs.
   - creator view behavior for YOUTUBE/SPOTIFY unchanged.
4. Manual QA:
   - connect Gmail, subscribe feed, sync, verify inbox items are article links.
   - open creator/feed view and verify content list + subscribe state.

---

## Final Acceptance Criteria

1. For ACTIVE newsletter feeds, new inbox items use canonical content links extracted from email bodies.
2. Newsletter creators/publications have a browsable creator/source view showing their content history.
3. Duplicate ingestion remains idempotent across repeated syncs.
4. Opt-in defaults and feed management behavior remain intact.
5. Observability supports debugging at message, link, and item provenance levels.
