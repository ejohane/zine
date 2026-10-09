# Weekly Wrapped: implementation handoff

Assignment date: October 8, 2026. Owner: Wrapped evidence/service; native presentation
belongs to stream 2. Baseline: [product](../product-spec.md),
[contracts](../contracts.md), [brief](04-wrapped.md). This is a code audit and proposed
implementation assignment, not evidence of shipped behavior.

## Current implementation and evidence audit

| Path                                                                                                                                | Observed behavior                                                                                                                                                                                                                                                              | Required treatment                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/worker/src/lib/weekly-recap.ts`                                                                                               | `getWeeklyRecapWindow` already returns the previous completed Sunday–Sunday calendar week, converts local midnights separately, and compares against the previous week. Tests cover spring DST and equal Sunday/Monday results.                                                | Reuse calendar arithmetic; this is **not a rolling window**, despite wording in the original brief. Existing optional `weekAnchorDate` is the end boundary, not the new REST `weekStart`. It accepts any valid local date, including non-Sundays. |
| `apps/worker/src/trpc/routers/insights.ts`                                                                                          | Private recap/teaser accept caller timezone and optional anchor; invalid timezone falls back to UTC in the service.                                                                                                                                                            | Preserve existing callers. New REST resolves persisted publisher timezone/window, rejects invalid settings and future/unclosed windows.                                                                                                           |
| `apps/worker/src/trpc/routers/items.ts`                                                                                             | `markOpened` writes immutable OPENED after updating mutable last-opened, but only for BOOKMARKED items. `updateProgress` writes positive rounded PROGRESS_DELTA with source PLAYER after mutable update.                                                                       | Make state and evidence atomic; add interaction identity for retries; support explicit opens of owned unsaved items without treating them as saved.                                                                                               |
| `apps/worker/src/items/finished-state.ts`                                                                                           | Shared FINISHED/UNFINISHED writer records transitions; repeated same-state sets do not add transitions. Finish can also bookmark. Ordinary state update and event are separate writes; save-through-finish batches them.                                                       | Preserve idempotent finish semantics; batch state and event on all paths and add save evidence when completion actually saves.                                                                                                                    |
| `apps/worker/src/bookmarks/save.ts`; `items/library-state.ts`                                                                       | Initial save, rebookmark and inbox bookmark mutate `bookmarkedAt`; no durable SAVED event. Rebookmark replaces timestamp; unbookmark clears it.                                                                                                                                | Capture prospective transitions in the same batch as save/enrichment intent. Already-saved retries must not fabricate another save.                                                                                                               |
| `apps/ios/ZineNative/App/AppRootView.swift`; `Features/Library/BookmarkDetailView.swift`; `Features/Reader/ArticleReaderView.swift` | Shared onRead/external-open callbacks reach `markOpened`. Library callback excludes already finished bookmarks; Home callback uses same endpoint. Opens retry without an event identity and are not durably queued offline.                                                    | Coordinate with native owner to record actual reader/external opens including rereads of finished content, independently of Home promotion policy; preserve identity on retries. Warming/prefetching is not opening.                              |
| `Features/Today/TodayStore.swift`                                                                                                   | Known user-item opens call `markOpened`; editorial feedback records opens separately, including sources without a saved user-item.                                                                                                                                             | Audit/bridge editorial feedback as partial observed-open evidence; require save before selection. Do not silently assume ordinary consumption-event coverage.                                                                                     |
| `Core/API/APIClient.swift`; `Features/Reader/ArticleReaderStore.swift`                                                              | Reader progress sends normalized fraction with duration=1. Server rounds as seconds and labels source PLAYER.                                                                                                                                                                  | Existing events cannot establish reading minutes or playback time. Preserve progress state, but identify READER/fraction semantics before using new evidence. External navigation proves opening only.                                            |
| `apps/worker/src/lib/weekly-recap.ts` aggregation                                                                                   | Completion transitions are durable; legacy completion reads current finished state. Started candidates use mutable last-opened/progress and exclude currently finished/archived items. SAVED and immutable OPENED are not used for candidate history. Metadata is joined live. | Build an evidence-based candidate adapter; later visits, finishing, archiving or metadata changes must not erase an older recap. Legacy snapshots are explicitly limited.                                                                         |

`db/schema.ts` / migration `0008_add_weekly_recap_support.sql` already define indexed
`user_item_consumption_events` with user/item/user-item ownership and Unix-ms times.
Declared event types alone do not prove writers or historical completeness. Current
foreign keys and inner item joins also require explicit handling of deletion before
claiming historical availability. No saved publisher timezone field was found in
`db/schema.ts` during this audit.

## Concrete implementation boundaries and interfaces

Proposed new modules (names coordinated before editing):

- `apps/worker/src/weekly-recaps/windows.ts`: strict Sunday local-date parsing,
  persisted timezone/window resolution and closed-window checks. Reuse existing
  timezone calendar math rather than duplicating fixed-duration arithmetic.
- `apps/worker/src/weekly-recaps/evidence.ts`: shared prospective SAVED/OPENED writers,
  source/unit validation and deterministic aggregation of event evidence.
- `apps/worker/src/weekly-recaps/service.ts`: private recap history/snapshot reads.
- `apps/worker/src/weekly-recaps/draft.ts`: explicit selections to foundation service.
- `apps/worker/src/routes/api-v1/weekly-recaps.ts`: authenticated history/read/create
  adapter registered by foundation through the existing REST conventions.
- Shared runtime recap schemas/export and Swift decoding fixtures are contributed
  through foundation's shared-file ownership. Stream 2 owns `WeeklyRecapView`, its
  store and `APIClient` wiring; Wrapped supplies fixtures and observed-label rules.

Minimum private resource: stable recap/window ID, local Sunday `weekStart`, IANA
`timezone`, ISO UTC `startAt`/`endAt`, coverage, candidate IDs, nullable current saved
bookmark IDs, canonical item IDs, private presentation, and observed activity labels
with source/time. Deduplicate candidates by canonical item, retain multiple evidence
labels. No preselected IDs. Do not collapse opened and finished into consumed.

Coverage must be per signal: `reliableSince` (actual deployed tracking start), state
COMPLETE/PARTIAL/LEGACY_SNAPSHOT, known gaps and reason. Per-week overall coverage is
conservative. Never use migration creation date as proof all writers worked then.
Estimated duration is content length, never time actually spent. Patterns require
supported data; absent evidence gives a useful empty/partial recap, not invented
activity. Private-only content may appear privately but is visibly ineligible for
publication under foundation's eligibility service.

## Persistence, historical windows and privacy

Propose private `weekly_recap_windows` keyed by owner + stable window identity,
carrying saved timezone/local start, UTC bounds, generated-at, evidence revision and
coverage. Candidate snapshot rows retain only needed private presentation/evidence,
nullable current bookmark linkage and source event identities. Foundation owns final
schema/migration ordering; Wrapped contributes columns/index/query requirements.
Private snapshot retention/account deletion must follow the account data lifecycle,
not public attribution tombstone rules.

Persist closed-week snapshots at Sunday closure via an idempotent task with catch-up
for missed runs; lazy first access is a recovery path, not sole archival strategy.
Use stable evidence cutoff/revision and explicitly handle late offline events:
refresh private snapshots idempotently from new accepted evidence without changing
published issues. Live ownership/public eligibility is always rechecked at draft
creation/publication even when historical metadata survives privately. Account
isolation applies to windows, candidates and history cursors; none of their activity
fields or counts enter public issue projection/events.

The saved publisher timezone changes only by explicit setting. Previously persisted
windows retain their timezone and bounds. Coordinate effective-date behavior with
foundation before supporting timezone edits: retain existing window assignments and
avoid overlapping ownership of the same event during a switch. Travel/device timezone
must not rewrite anything. Sunday availability is `now >= endAt`. History `weekStart`
resolves persisted identity; legacy tRPC anchors need an explicit +7-local-days adapter.

## Selected-candidate draft adapter

`POST /api/v1/me/weekly-recaps/:weekStart/issue` accepts explicit candidate IDs and an
idempotency key; actor comes from Clerk. Resolve the persisted **closed** window,
validate candidates belong to this owner/window and currently refer to saved content,
then call foundation's weekly creation service with server-resolved window ID and
saved selections in chosen order. Reject unsaved/ineligible entries with actionable
errors; user saves first, then retries. Empty choices are valid for viewing Wrapped;
creating an issue requires at least one eligible selected item. Do not preselect or
publish. Return the ordinary editable issue DTO. Foundation enforces one weekly issue
per publication/window and idempotency; generic issue creation remains INDEPENDENT.
The ordinary editor can then add older saved items beyond recap candidates.

## Verification and first bounded coding task

First task: implement prospective **SAVED evidence only** in the shared save/state
paths and finish-and-bookmark, with transactional persistence, no-op repeat behavior,
and a tested coverage-start contract. Coordinate schema enum/comment/metadata changes
with foundation; leave REST recap/publication/UI changes for subsequent slices.
Test initial save, inbox save, rebookmark, finish-and-save, already-saved retry and
failed batch rollback. Audit provider import paths separately: ingestion is not an
intentional save unless that provider behavior explicitly establishes it.

Next slices: repair open writer coverage/idempotency, freeze private snapshot/window
schema, REST history/candidates, draft adapter, then native integration. Required tests:

- Exact Sunday midnight inclusion/exclusion; Saturday final instant; spring 167-hour
  and fall 169-hour weeks; year boundary; invalid/non-Sunday/future local dates.
- Saved timezone differs from device/server timezone; old windows survive changes.
- Older bookmark reopened this week; next-week reopen/finish/archive does not erase
  prior evidence; reread of a finished item; unsaved open; repeated retry identity.
- Native normalized reading progress never becomes watched/listened seconds;
  external open never becomes finished; archive alone never indicates consumption.
- Mixed legacy/new coverage, missed Sunday job catch-up, late-event replay and empty
  week; stable private history after permissible content removal.
- Foreign candidate/window rejected; unsaved/private selection rejected; explicit
  order, concurrent one-window creation and idempotency; no automatic publication.
- Public DTO/event serialization contains no recap statistics/activity timestamps;
  cross-account recap/history requests cannot read another owner's evidence.

Run focused Worker unit/D1 integration checks for each slice. Swift fixtures prove
decoding only; native integration additionally needs the repo local-development skill,
authenticated local stack and direct Simulator interaction owned/coordinated by stream 2.

## Active implementation definition of done

See [runtime status](04-runtime-status.md) for the current definition of done,
interface availability, migration reservation and verification evidence. The active
assignment covers the entire stream, beyond the historical first-task proposal above.
