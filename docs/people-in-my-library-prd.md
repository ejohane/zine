# PRD: People in My Library

## Status

Proposed for discussion.

## Purpose

Build a focused first version of people-aware enrichment in Zine:

> Help users see which people appear across the content they have intentionally saved.

This is not a global knowledge graph, public profile system, or external account resolver. V1 is a private, user-scoped index over the user's bookmarked library.

---

## Problem

Zine already extracts useful entities during item enrichment, but those entities currently remain trapped inside item-level enrichment JSON. A user can see that one item mentions a person, but cannot answer broader library questions such as:

1. Which people show up most often in the things I save?
2. What saved items involve this person?
3. Where did this person appear recently?
4. Is this person a recurring interest in my library?

Existing creator pages partially solve this for provider-native creators, but they do not cover people who are mentioned, interviewed, guests, subjects, or otherwise present in saved content.

---

## Goals

1. Create a private "People in my library" index for each user.
2. Convert high-confidence `PERSON` entities from enrichment into queryable rows.
3. Let users browse and search people found in their bookmarked library.
4. Let users open a person detail page and see bookmarked items involving that person.
5. Keep matching conservative and explainable.
6. Preserve a clean path toward aliases, manual merges, creator linking, and external profiles later.

---

## Non-Goals

1. Global entity graph.
2. Cross-user people popularity or recommendations.
3. Automatic Twitter/X, YouTube, Spotify, Wikidata, or website linking.
4. Internet crawling.
5. Fuzzy person merges.
6. Manual merge/split UI.
7. People from Inbox or Archived items.
8. Perfect named-entity recognition.
9. Claims that a detected person is the official owner of an external account.
10. Replacing the existing `creators` model or creator pages.

---

## User Stories

1. As a user, I want to see people who frequently appear in my saved library, so I can understand recurring interests.
2. As a user, I want to tap a person and see all saved items involving them, so I can revisit related content.
3. As a user, I want person matches to feel trustworthy, so I do not see unrelated people incorrectly merged.
4. As a user, I want item detail entity chips to be navigable when Zine can resolve them to a person in my library.
5. As a user, I do not want private reading interests exposed to other users or global surfaces.

---

## Product Scope

## V1 Definition

V1 indexes people from bookmarked content only:

- Source items: `user_items.state = BOOKMARKED`
- Source enrichment: latest complete item enrichment for the canonical item
- Entity filter: `type = PERSON` or a normalized equivalent
- Confidence threshold: default `>= 0.65`
- Identity rule: same user plus exact normalized name

Example:

- `Joe Rogan` and `joe rogan` resolve to the same `user_people` row.
- `Joseph Rogan` does not auto-merge with `Joe Rogan`.
- `Rogan` does not auto-merge with `Joe Rogan`.
- `Sam Harris` is a separate private person record for that user, with no global assumption.

## Primary Surfaces

### Library People View

Add a people-oriented library surface.

Recommended entry points:

- Library tab segmented view or filter: `Items | Tags | People`
- Search result section: `People`

Each person row should show:

- display name
- saved item count
- latest saved item title or latest seen date
- optional confidence/status treatment if needed

### Person Detail Page

Add a mobile route:

- `apps/mobile/app/person/[id].tsx`

Recommended sections:

1. Header
   - name
   - saved item count
   - latest seen date
2. Saved items
   - bookmarked items involving this person
   - sorted by bookmarked date descending
3. Optional relationship grouping
   - only if relationship extraction is available with acceptable quality
   - initial groups: `About`, `Created/Hosted`, `Mentioned`

### Item Detail

Update existing enrichment entity chips:

- Person chips are tappable when they resolve to a `user_people` record.
- Unresolved entity chips remain plain metadata.
- Tapping navigates to `/person/[id]`.

---

## Data Model

## New Tables

### `user_people`

One private person record per user-normalized-name pair.

Suggested columns:

- `id` TEXT PRIMARY KEY
- `user_id` TEXT NOT NULL REFERENCES `users`(`id`)
- `display_name` TEXT NOT NULL
- `normalized_name` TEXT NOT NULL
- `item_count` INTEGER NOT NULL DEFAULT 0
- `latest_seen_at` INTEGER
- `created_at` INTEGER NOT NULL
- `updated_at` INTEGER NOT NULL

Indexes:

- unique `(user_id, normalized_name)`
- index `(user_id, item_count, latest_seen_at)`
- index `(user_id, latest_seen_at)`

### `user_person_mentions`

One row per user/person/item association. V1 should deduplicate repeated mentions of the same person within the same item.

Suggested columns:

- `id` TEXT PRIMARY KEY
- `user_id` TEXT NOT NULL REFERENCES `users`(`id`)
- `user_person_id` TEXT NOT NULL REFERENCES `user_people`(`id`)
- `user_item_id` TEXT NOT NULL REFERENCES `user_items`(`id`)
- `item_id` TEXT NOT NULL REFERENCES `items`(`id`)
- `item_enrichment_id` TEXT NOT NULL REFERENCES `item_enrichments`(`id`)
- `raw_name` TEXT NOT NULL
- `raw_type` TEXT NOT NULL
- `relationship` TEXT NOT NULL DEFAULT 'MENTIONED'
- `confidence` REAL NOT NULL
- `evidence_text` TEXT
- `is_active` INTEGER NOT NULL DEFAULT 1
- `created_at` INTEGER NOT NULL
- `updated_at` INTEGER NOT NULL

Indexes:

- unique `(user_id, user_item_id, user_person_id)`
- index `(user_person_id, is_active, updated_at)`
- index `(user_id, item_id)`
- index `(user_id, is_active, confidence)`

## Name Normalization

Use a deliberately simple normalizer in V1:

1. trim
2. lowercase
3. collapse whitespace
4. remove surrounding punctuation
5. preserve internal punctuation initially

Do not remove middle initials, suffixes, nicknames, or titles in V1 unless the title is a simple honorific such as `Mr.`, `Ms.`, `Dr.` and this can be tested safely.

---

## Pipeline

## Write Path

After canonical item enrichment completes:

1. Load all bookmarked `user_items` for the enriched `item_id`.
2. Parse latest complete `item_enrichments.entities_json`.
3. Filter to person-like entities above threshold.
4. Normalize each person name.
5. Upsert `user_people` by `(user_id, normalized_name)`.
6. Upsert `user_person_mentions` by `(user_id, user_item_id, user_person_id)`.
7. Recompute or increment `item_count` and `latest_seen_at`.

`latest_seen_at` should be Unix ms derived from the user's library relationship, preferably `bookmarked_at` when present and `ingested_at` as fallback.

## Backfill

Add an admin/backfill path that:

1. Scans bookmarked `user_items`.
2. Finds the latest complete enrichment for each `item_id`.
3. Indexes people using the same write path.
4. Is idempotent and safe to rerun.

Backfill should support:

- `dryRun`
- `limit`
- optional `userId`
- progress logging
- retry-safe pagination

## State Changes

People counts must remain consistent when a user item leaves the library.

Required handling:

- On `BOOKMARKED -> ARCHIVED`, remove or deactivate the mention from active people counts.
- On `ARCHIVED -> BOOKMARKED`, reindex the item if enrichment exists.
- On item deletion/removal, remove or deactivate mentions.

Use `is_active` on `user_person_mentions` instead of hard-deleting rows. This preserves provenance for debugging and makes state transitions reversible.

---

## API Requirements

## New Router

Add a `people` tRPC router.

### `people.list`

Input:

- `query?: string`
- `limit?: number`
- `cursor?: string`
- `sort?: 'count' | 'recent'`

Returns:

- people
- next cursor

Person shape:

- `id`
- `displayName`
- `itemCount`
- `latestSeenAt`
- `latestItemTitle`

### `people.get`

Input:

- `personId`

Returns:

- person profile
- aggregate counts

### `people.listItems`

Input:

- `personId`
- `limit`
- `cursor`

Returns:

- bookmarked item views
- mention metadata when available
- next cursor

## Existing API Updates

### `items.getEnrichment`

Augment person entities with `personId` when a resolved `user_people` row exists for the current user.

Do not expose person IDs for other users.

### `search.query`

Optionally include a `people` section after the base people list exists.

Search should only return people with:

- `item_count > 0`
- active bookmarked mentions

---

## UX Requirements

1. People are a library browsing feature, not a social/profile feature.
2. Empty state should explain that people appear after saved items are enriched.
3. People rows should be dense and scannable, similar to creator search rows.
4. Person detail should reuse existing item card patterns.
5. Do not show confidence percentages in primary UI.
6. Do not imply official identity or account ownership.
7. If relationship labels are uncertain, use neutral wording like `Appears in`.

---

## Privacy and Safety

1. All V1 people records are user-scoped.
2. A user's people list must never include counts or items from other users.
3. No cross-user aggregation.
4. No public profile URLs.
5. No external account inference.
6. No analytics event should include raw person names unless analytics policy explicitly allows it.
7. Logs should prefer IDs/counts over names where possible.

---

## Ranking

Default list ranking:

1. `item_count` descending
2. `latest_seen_at` descending
3. `display_name` ascending

Person detail item ranking:

1. bookmarked date descending
2. ingested date descending
3. mention confidence descending

Future ranking signals:

- title mention
- creator/host/guest relationship
- high salience
- repeated appearances across categories
- user opens/finishes involving that person

---

## Analytics

Recommended events:

- `people_library_opened`
- `person_profile_opened`
- `person_item_opened`
- `item_person_chip_tapped`

Event properties should use IDs and counts:

- `personId`
- `itemCount`
- `source`
- `provider`
- `contentType`

Avoid raw person names in analytics events.

---

## Success Metrics

Product signals:

1. Percentage of active users with at least one indexed person.
2. People list open rate from Library/Search.
3. Person detail open rate.
4. Item opens from person detail.
5. Item detail person-chip tap rate.

Quality signals:

1. Average people per bookmarked item.
2. Percentage of person mentions above threshold.
3. Duplicate-looking people rate from common normalized variants.
4. Support/debug reports of incorrect people.

Operational signals:

1. Backfill completion rate.
2. Enrichment-to-people-index latency.
3. Failed indexing jobs.
4. People count consistency after state changes.

---

## Edge Cases

1. Enrichment missing: item contributes no people until enrichment completes.
2. Low-confidence entity: ignored in V1.
3. Same person appears multiple times in one item: one mention association.
4. Person name changes across items: not merged in V1 unless normalized name is exact.
5. Ambiguous names: not disambiguated in V1.
6. Creator name equals person name: no automatic creator-person link in V1.
7. Archived item: not counted.
8. Re-enrichment removes a person: deactivate or remove stale mention for that user item.
9. Re-enrichment changes confidence: update mention confidence.
10. User has no people: show empty state.

---

## Implementation Phases

## Phase 1: Indexing Foundation

1. Add migrations and Drizzle schema for `user_people` and `user_person_mentions`.
2. Add person normalization helper and tests.
3. Add indexing service that consumes latest complete item enrichment.
4. Call indexing after enrichment completion.
5. Add admin backfill with dry-run support.

Exit criteria:

- Existing enriched bookmarked items can produce stable user-scoped people rows.
- Re-running backfill is idempotent.

## Phase 2: API

1. Add `people` router.
2. Add `people.list`, `people.get`, `people.listItems`.
3. Augment `items.getEnrichment` with resolved `personId`.
4. Add API tests for multi-tenant isolation.

Exit criteria:

- A user can query their people and related bookmarked items.
- Another user cannot observe or infer those rows.

## Phase 3: Mobile UX

1. Add People library view or search section.
2. Add person detail route.
3. Make resolved person chips tappable on item detail.
4. Add empty/loading/error states.

Exit criteria:

- A user can browse people and open saved items from a person page.

## Phase 4: Quality Pass

1. Run local backfill on seeded data.
2. Inspect common names and false positives.
3. Tune confidence threshold.
4. Add telemetry for coverage and indexing failures.

Exit criteria:

- The feature is useful without creating noisy or misleading people pages.

---

## Open Questions

1. Should V1 include only `BOOKMARKED`, or should it include unfinished Library items that were previously saved but archived later?
2. Should person rows live in the Library tab, Search tab, or both at launch?
3. Should item detail show all person chips, or only high-confidence resolved people?
4. What confidence threshold produces the best balance on real local data?
5. Should relationship labels ship in V1 if the current enrichment schema does not extract them explicitly?

---

## V2 Candidates

1. Manual aliasing and merge/split.
2. Creator-to-person linking within a user's library.
3. Relationship extraction: author, host, guest, about, mentioned.
4. External links only from explicit provider/source metadata.
5. People-based recommendations.
6. Weekly recap integration: recurring people this week.
7. "People you save most" insights.
