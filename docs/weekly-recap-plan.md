# Plan: Weekly Consumption Recap

## Status

Proposed for implementation.

## Purpose

Define a concrete product and technical plan for a weekly recap feature that tells the user:

1. What they consumed in Zine over the last week.
2. What the major trends were versus the prior week.
3. How their time split across reading, watching, and listening.
4. Which other summary signals are useful without being misleading.

This plan is intentionally split into a fast-shipping V1 and a more durable V2 because the current data model can support a useful recap today, but it does not yet capture full consumption history well enough for precise “time spent” reporting.

---

## Requirements (Locked)

1. The feature must be available in-app, not only as a notification or digest.
2. The recap must show a concrete list of consumed items for the window.
3. The recap must show estimated time split by mode:
   - reading
   - watching
   - listening
4. The recap must compare the current window against the previous window.
5. The recap must use honest labeling:
   - “estimated time” when inferred from item metadata
   - “completed” when backed by explicit completion data
   - “started” when backed by open/progress signals
6. The recap must not treat dismissed items as consumed unless they were explicitly finished.

## Non-Goals (Initial Release)

1. LLM-generated prose summaries.
2. Push notifications or email digests.
3. Perfect tracking of actual active minutes spent in external apps or browsers.
4. Cross-user benchmarking (“you read more than other users”).
5. Full historical backfill of past open/progress activity before the new tracking model exists.

---

## Current State and Gaps

## What already exists

- `user_items` already stores:
  - `bookmarked_at`
  - `archived_at`
  - `last_opened_at`
  - `progress_position`
  - `progress_duration`
  - `progress_updated_at`
  - `is_finished`
  - `finished_at`
- `items` already stores the metadata needed for estimated time:
  - `duration`
  - `reading_time_minutes`
  - `word_count`
  - `content_type`
  - `provider`
  - `creator_id`
- The Home tab already acts as the re-entry/discovery surface and is the best place for a recap teaser.

## Gaps that matter for this feature

1. `ARCHIVED` currently means “consumed/dismissed”, so archived state alone cannot be used as a clean consumption signal.
2. `last_opened_at` is currently tied to the bookmarked-item “open from detail” flow rather than a general item-open event.
3. `progress_*` stores only the latest snapshot, not a history of progress deltas.
4. The mobile app defines `useUpdateProgress`, but there are no current runtime call sites, so partial-consumption tracking is not actually wired.
5. Product analytics is not a valid source of truth for this feature; the current analytics layer is a production no-op.

## Implication

V1 should be anchored on explicit completion plus estimated item duration/reading time. V2 should add immutable event history so recap math is not forced to infer everything from mutable snapshot columns.

---

## Product Design

## Primary Surface

Add a “Weekly recap” card near the top of the Home tab.

Recommended contents:

- Headline:
  - “You finished 14 things this week”
- Supporting line:
  - “3h 20m reading, 1h 10m watching, 42m listening”
- Trend chip:
  - “Up 18% vs last week”
- CTA:
  - “See full recap”

## Detail Screen

Add a dedicated route for the full recap screen:

- Suggested route: `apps/mobile/app/recap/weekly.tsx`

Recommended sections:

1. Hero summary
   - completed items
   - estimated total time
   - dominant mode
2. Time split
   - reading vs watching vs listening
3. Trend over time
   - daily bars for the last 7 days
4. Highlights
   - top creator
   - top provider
   - longest completed item
   - median bookmark-to-finish time
5. What you consumed
   - completed items grouped by day
6. Started but not finished
   - items opened or progressed in the window without completion

## Empty State

If the user completed nothing in the window:

- Show a useful empty state instead of zeros-only UI.
- Example:
  - “No completed items in the last 7 days”
  - “You opened 4 items and bookmarked 9”

This avoids making the feature feel broken for lighter-use weeks.

---

## Metric Definitions

## Window Semantics

### In-app recap

- Default window: rolling last 7 days
- Compare against: the 7 days immediately before that
- Use the user’s device timezone

### Future scheduled digest

- If a digest is added later, use previous calendar week in the user’s timezone
- Keep the in-app screen rolling even if the digest becomes calendar-based

## Content Mode Mapping

- `ARTICLE` => reading
- `POST` => reading
- `VIDEO` => watching
- `PODCAST` => listening

Rationale: the product question is “reading vs watching vs listening”, and `POST` maps more naturally to reading than to its own fourth mode.

## V1 Consumption Definitions

### Completed item

An item is “completed” if:

- `user_items.is_finished = true`
- and `user_items.finished_at` falls inside the window

### Started item

An item is “started” if:

- it is currently unfinished
- and one of these is true:
  - `last_opened_at` is in the window
  - `progress_updated_at` is in the window

Known limitation: current `last_opened_at` coverage is incomplete until the open-tracking flow is broadened.

### Consumed item list

For V1, the primary “what you consumed” list should be the completed items list.

Do not mix started-but-unfinished items into the main consumed timeline. Show them in a secondary section so the recap remains trustworthy.

## Estimated Time Rules

### Reading time

Use this fallback order:

1. `reading_time_minutes`
2. derive from `word_count` at 220 words per minute
3. otherwise `0`

### Watching and listening time

Use this fallback order:

1. `duration`
2. otherwise `0`

### Important label

All V1 time numbers should be labeled as estimated time, not time spent.

## Trend Definitions

Compare current window vs previous window for:

- completed item count
- estimated total minutes
- estimated minutes by mode
- creator/provider concentration

## Additional Summary Signals

Recommended V1 extras:

- top creator by completed count
- top provider by completed count
- longest completed item
- median bookmark-to-finish duration
- completion mix by content type

Defer until V2:

- actual active minutes
- revisits/session count
- multi-open or binge-session behavior

---

## Architecture Decision

## High-Level Decision

Implement weekly recap as a separate `insights` tRPC surface rather than extending `items.home`.

Recommended worker shape:

- `apps/worker/src/trpc/routers/insights.ts`
- mount as `insights` in `apps/worker/src/trpc/router.ts`

Recommended mobile shape:

- query hook in `apps/mobile/hooks/use-insights-trpc.ts`
- teaser card on `apps/mobile/app/(tabs)/index.tsx`
- full route at `apps/mobile/app/recap/weekly.tsx`

## Why a separate router

Pros:

- keeps curation/read-model concerns separate from recap/analytics concerns
- avoids turning `items.home` into a broad aggregation endpoint
- creates a clean place for later monthly/yearly recap work

Cons:

- adds a new router surface

Decision: separate router.

## Current implementation touchpoints

The initial implementation should plug into these existing files:

- `apps/worker/src/trpc/router.ts`
  - mount the new `insights` router
- `apps/worker/src/trpc/routers/items.ts`
  - broaden `markOpened`
  - keep `toggleFinished` as the explicit completion signal
- `apps/worker/src/db/schema.ts`
  - add recap indexes now
  - add event schema later in V2
- `apps/mobile/app/(tabs)/index.tsx`
  - add the recap teaser card to Home
- `apps/mobile/hooks/use-items-trpc.ts`
  - current home/item flows are useful reference points for query hooks and cache invalidation
- `apps/mobile/components/home/quick-stats.tsx`
  - existing teaser component that can be reused or replaced
- `apps/mobile/lib/analytics.ts`
  - analytics can mirror recap events later but must not power recap data

---

## API Design

## Query

### `insights.weeklyRecap`

Suggested input:

```ts
type WeeklyRecapInput = {
  timezone?: string; // IANA timezone from device, e.g. "America/Chicago"
};
```

Suggested response:

```ts
type WeeklyRecapResponse = {
  window: {
    timezone: string;
    startAt: string; // ISO8601
    endAt: string; // ISO8601
    comparisonStartAt: string; // ISO8601
    comparisonEndAt: string; // ISO8601
    label: string; // "Last 7 days"
  };
  headline: {
    completedCount: number;
    estimatedTotalMinutes: number;
    dominantMode: 'READING' | 'WATCHING' | 'LISTENING' | 'MIXED' | 'NONE';
    completedDeltaPct: number | null;
    estimatedMinutesDeltaPct: number | null;
  };
  totals: {
    completedCount: number;
    startedCount: number;
    estimatedMinutesByMode: {
      reading: number;
      watching: number;
      listening: number;
    };
    contentTypeCounts: {
      article: number;
      post: number;
      video: number;
      podcast: number;
    };
  };
  trend: Array<{
    date: string; // local date bucket, e.g. 2026-03-11
    completedCount: number;
    estimatedMinutes: number;
    readingMinutes: number;
    watchingMinutes: number;
    listeningMinutes: number;
  }>;
  highlights: {
    topCreators: Array<{
      creatorId: string | null;
      creator: string;
      completedCount: number;
      estimatedMinutes: number;
    }>;
    topProviders: Array<{
      provider: string;
      completedCount: number;
      estimatedMinutes: number;
    }>;
    longestCompletedItem: {
      userItemId: string;
      title: string;
      creator: string;
      estimatedMinutes: number;
      finishedAt: string;
    } | null;
    medianBookmarkToFinishHours: number | null;
  };
  completedItems: Array<{
    userItemId: string;
    itemId: string;
    title: string;
    creator: string;
    provider: string;
    contentType: string;
    finishedAt: string;
    estimatedMinutes: number;
    thumbnailUrl: string | null;
  }>;
  startedItems: Array<{
    userItemId: string;
    itemId: string;
    title: string;
    creator: string;
    provider: string;
    contentType: string;
    lastTouchedAt: string;
    progressPercent: number | null;
    thumbnailUrl: string | null;
  }>;
};
```

## Notes on response design

- Return a mobile-ready shape; do not make the client recompute major metrics.
- Keep rule-based insight generation on the server.
- Keep timestamps explicit in the response so the UI can show exact local labels consistently.

---

## Backend Query Plan (V1)

## Guiding Principle

The recap window is small. Favor a few readable indexed queries plus application-layer aggregation over large timezone-heavy SQL. D1/SQLite can do date math, but local timezone bucketing is easier and safer in worker code once the result set is narrowed to the relevant user and time window.

## Query 1: Completed items across current + comparison windows

Fetch all completed rows for the user in the 14-day comparison span and split them in code.

Suggested SQL shape:

```sql
SELECT
  ui.id AS user_item_id,
  ui.item_id,
  ui.bookmarked_at,
  ui.ingested_at,
  ui.finished_at,
  i.title,
  i.thumbnail_url,
  i.content_type,
  i.provider,
  i.duration,
  i.reading_time_minutes,
  i.word_count,
  c.id AS creator_id,
  c.name AS creator_name
FROM user_items ui
INNER JOIN items i ON i.id = ui.item_id
LEFT JOIN creators c ON c.id = i.creator_id
WHERE
  ui.user_id = ?
  AND ui.is_finished = 1
  AND ui.finished_at >= ?
  AND ui.finished_at < ?
ORDER BY ui.finished_at DESC, ui.id DESC;
```

Use the rows to compute:

- current-window completed count
- comparison-window completed count
- estimated minutes by mode
- daily trend buckets
- top creators/providers
- longest item
- median bookmark-to-finish hours
- completed item timeline

## Query 2: Started-but-unfinished items in current window

Fetch items touched in the current window that are not completed in the current window.

Suggested SQL shape:

```sql
SELECT
  ui.id AS user_item_id,
  ui.item_id,
  ui.last_opened_at,
  ui.progress_position,
  ui.progress_duration,
  ui.progress_updated_at,
  ui.is_finished,
  ui.finished_at,
  i.title,
  i.thumbnail_url,
  i.content_type,
  i.provider,
  c.name AS creator_name
FROM user_items ui
INNER JOIN items i ON i.id = ui.item_id
LEFT JOIN creators c ON c.id = i.creator_id
WHERE
  ui.user_id = ?
  AND ui.is_finished = 0
  AND (
    (ui.last_opened_at IS NOT NULL AND ui.last_opened_at >= ? AND ui.last_opened_at < ?)
    OR
    (ui.progress_updated_at IS NOT NULL AND ui.progress_updated_at >= ? AND ui.progress_updated_at < ?)
  )
ORDER BY
  COALESCE(ui.progress_updated_at, ui.last_opened_at) DESC,
  ui.id DESC;
```

Use `COALESCE(progress_updated_at, last_opened_at)` as the display timestamp for `lastTouchedAt`.

## Query 3: Optional teaser stats only

If Home needs a lighter payload than the full recap screen, add:

- `insights.weeklyRecapTeaser`

This can return only:

- completed count
- estimated total minutes
- estimated minutes by mode
- delta vs previous week

This avoids loading the full completed-item timeline on every Home render.

## Aggregation Strategy in Worker Code

Do the following in TypeScript after query execution:

1. normalize rows into recap entries with derived `estimatedMinutes`
2. split rows into current vs comparison windows
3. bucket current rows by local day label
4. group by creator/provider/content mode
5. calculate percentages and deltas
6. generate highlights

## Why aggregate in code instead of SQL

- easier timezone bucketing
- easier fallback logic for reading-time estimation
- easier highlight generation
- lower maintenance cost than large nested SQL for a 7-day per-user summary

---

## Data Model and Index Changes (V1)

## Recommended V1 indexes

Add indexes to make the recap queries cheap on larger libraries:

```sql
CREATE INDEX IF NOT EXISTS user_items_finished_window_idx
  ON user_items (user_id, is_finished, finished_at DESC);

CREATE INDEX IF NOT EXISTS user_items_progress_window_idx
  ON user_items (user_id, progress_updated_at DESC);

CREATE INDEX IF NOT EXISTS user_items_last_opened_general_idx
  ON user_items (user_id, last_opened_at DESC);
```

Notes:

- `finished_at`, `progress_updated_at`, and `last_opened_at` are legacy ISO8601 text fields.
- ISO8601 UTC strings sort lexicographically, so range queries remain valid as long as the stored format stays consistent.
- New recap-specific tables should use Unix ms `INTEGER`, not text.

## Recommended V1 behavior change

Broaden the existing open tracking flow so “item opened” is not bookmark-only.

Implementation recommendation:

- keep `last_opened_at` updates on `user_items`
- update it for any item state, not only `BOOKMARKED`
- keep Home’s current “Jump Back In” query restricted to bookmarked items

This improves recap fidelity immediately without changing Home semantics.

---

## Durable Event Model (V2)

## Why V2 is needed

V1 can answer “what did you complete?” and “how much estimated time did that represent?”

V1 cannot reliably answer:

- how many times you revisited an item
- how much active time you spent before completion
- partial-consumption trends over time
- true started/completed funnel behavior

The root cause is that current open/progress fields are mutable snapshots, not immutable history.

## New Table: `user_item_consumption_events`

Suggested columns:

- `id` TEXT PK
- `user_id` TEXT NOT NULL
- `user_item_id` TEXT NOT NULL
- `item_id` TEXT NOT NULL
- `event_type` TEXT NOT NULL
  - `OPENED`
  - `FINISHED`
  - `UNFINISHED`
  - `PROGRESS_DELTA` (defer using until in-app playback/reader exists)
- `occurred_at` INTEGER NOT NULL
- `position_seconds` INTEGER NULL
- `duration_seconds` INTEGER NULL
- `delta_seconds` INTEGER NULL
- `source` TEXT NOT NULL
  - `ITEM_DETAIL_OPEN`
  - `MANUAL_FINISH_TOGGLE`
  - `PLAYER`
  - `READER`
- `metadata` TEXT NULL

Indexes:

- unique primary key on `id`
- index `(user_id, occurred_at DESC)`
- index `(user_id, event_type, occurred_at DESC)`
- index `(user_item_id, occurred_at DESC)`
- index `(item_id, occurred_at DESC)`

## Event-write rules

### `markOpened`

Write:

- `OPENED`

### `toggleFinished`

Write:

- `FINISHED` when toggled on
- `UNFINISHED` when toggled off

### `updateProgress`

Future behavior:

- write `PROGRESS_DELTA` only when Zine actually owns in-app progress updates
- do not emit high-frequency noisy events before there is a real playback or reading surface

## Important guardrail

Do not block the V1 recap on the V2 event table. The event table is the durability upgrade, not the prerequisite for shipping the first useful recap.

---

## Mobile Implementation Plan

## Home Tab

Update `apps/mobile/app/(tabs)/index.tsx` to add a recap teaser card near the top of the screen.

Recommended behavior:

- fetch teaser data only
- show skeleton/loading state with the rest of Home
- navigate to full recap route on press

## Detail Screen

Create:

- `apps/mobile/app/recap/weekly.tsx`

Suggested UI breakdown:

- `apps/mobile/components/insights/weekly-recap-card.tsx`
- `apps/mobile/components/insights/weekly-recap-chart.tsx`
- `apps/mobile/components/insights/weekly-recap-list.tsx`

## Hook

Create:

- `apps/mobile/hooks/use-insights-trpc.ts`

Suggested exports:

- `useWeeklyRecap()`
- `useWeeklyRecapTeaser()`

## Design Notes

- use the Home tab only as the entry point, not the entire recap experience
- prefer stacked bars or segmented rows over a pie chart for the mode split
- keep item rows consistent with existing `ItemCard` metadata patterns
- label all estimated-time UI explicitly

---

## Worker Implementation Plan

Create:

- `apps/worker/src/trpc/routers/insights.ts`
- `apps/worker/src/lib/weekly-recap.ts`

Update:

- `apps/worker/src/trpc/router.ts` to mount `insights`
- `apps/worker/src/db/schema.ts` if V2 event table is added
- new migration file for recap indexes

Recommended layering:

1. tRPC router validates input and returns response
2. service module computes window boundaries and runs queries
3. pure aggregation helpers transform rows into the final recap DTO

This keeps the recap logic testable without invoking the full router stack.

---

## Phased Rollout

## Phase 1: Ship a useful recap with current data

Scope:

- Home teaser
- full recap screen
- `insights.weeklyRecap`
- estimated time from finished items
- trend vs previous 7 days
- started-but-unfinished section from open/progress snapshots
- indexes for `finished_at`, `last_opened_at`, `progress_updated_at`
- broaden `markOpened` behavior to all item states

Success criteria:

1. Users can see what they completed in the last 7 days.
2. Time split by mode is clear and correctly labeled as estimated.
3. Trends vs previous week are correct.
4. Archived-but-unfinished items do not pollute completed totals.

## Phase 2: Add immutable consumption history

Scope:

- `user_item_consumption_events`
- writes on open and finish/unfinish
- recap logic prefers events where available

Success criteria:

1. Open activity is preserved historically.
2. Completion toggles do not destroy prior recap history.
3. Started-item and revisit metrics become reliable.

## Phase 3: Optional richer recap delivery

Scope:

- recap notification card
- optional digest generation
- cached weekly summary snapshots if needed

Success criteria:

1. Recap is discoverable even for users who do not visit Home often.
2. Snapshot generation does not become the source of truth; it is only a cache or delivery artifact.

---

## Testing Strategy

## Worker tests

Add coverage for:

- rolling-window boundary math by timezone
- current vs comparison split
- reading-time fallback from `word_count`
- mode mapping
- archived-but-not-finished exclusion
- started-item derivation
- median bookmark-to-finish calculation

## Mobile tests

Add coverage for:

- Home teaser rendering and navigation
- recap screen loading, empty, and success states
- correct labeling of estimated time
- correct ordering/grouping of completed items by day

## Manual verification

Use seeded local data to verify:

1. item list matches finished items in D1 for the window
2. mode split matches item metadata
3. trend changes when test data moves between windows
4. empty-state behavior is useful, not blank

---

## Implementation Checklist

1. Add recap indexes migration.
2. Add `insights` router and mount it in root tRPC router.
3. Implement `weeklyRecap` service and aggregation helpers.
4. Broaden open tracking so `last_opened_at` is not bookmark-only.
5. Add mobile tRPC hooks for recap queries.
6. Add Home teaser card.
7. Add full recap screen route.
8. Add worker tests for recap calculation.
9. Add mobile tests for teaser and screen behavior.
10. Ship Phase 1 before event-history work.
11. Add `user_item_consumption_events` in Phase 2.
12. Update recap logic to prefer immutable event history when present.

---

## Recommendation

Ship Phase 1 now.

Reason:

- it delivers immediate user value
- it fits the existing Home + worker architecture cleanly
- it avoids blocking on a larger event-history refactor
- it keeps the product honest by framing time as estimated

Then add Phase 2 once the recap has real usage and the team is ready to invest in durable consumption-event history.
