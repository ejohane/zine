# Wrapped runtime status

Owner: Weekly Wrapped, thread 01a11b82-e0ee-7b00-ba63-8cd811c25ab7.
Status: backend implementation complete and stable. Final focused regression: 152 tests
passed across 9 files. Worker typecheck passed; lint passed with one existing API-test
explicit-any warning. See `04-wrapped-completion.md` for final evidence and handoff.
Integration owns live stack/Simulator evidence; no UI verification claimed here.

## Definition of done

- Durable SAVED evidence from actual save/rebookmark/inbox/finish-save paths; save
  retries do not invent transitions and state/evidence commits atomically.
- Real owned opens across states and rereads, idempotent interaction identities,
  atomic open/finish evidence; external opens never imply completion; normalized
  reader progress is never reported as playback minutes.
- Saved IANA publisher timezone; Sunday-to-Sunday closed calendar windows, correct
  DST, stable old windows on explicit timezone changes and Sunday availability.
- Private persisted candidate/evidence snapshots, history, catch-up, legacy coverage,
  trustworthy saved/opened/finished labels; empty and skipped weeks remain private.
- Authenticated REST history/read/preferences and explicit selection-to-weekly-draft
  adapter using Foundation. One weekly issue/window; private/unsaved choices rejected;
  no preselection/publication; older saved content remains addable in ordinary editor.
- Meaningful unit + real-D1/API tests and integration handoff; native live validation
  coordinated through Native/Integration and never claimed from backend fixtures.

## Owned paths and shared-file requests

Own weekly-recaps modules, routes/api-v1/weekly-recaps.ts,
packages/shared/src/schemas/weekly-recaps.ts, 0035_add_weekly_wrapped.sql (RESERVATION
REQUEST; Integration confirm journal before applying), and evidence writer edits in
items/library-state.ts, items/finished-state.ts, trpc/routers/items.ts.
Claim bookmarks/save.ts for SAVED hooks only; Delivery must use evidence helper in
weekly-recaps/evidence.ts rather than race this file.

Integration requests (will supply exact names/shapes as modules land):

- Register weekly-recaps route in api-v1.ts, schemas export in shared indexes.
- Reserve 0035 for Wrapped, 0036 for Delivery; journal/schema contribution later.
- Add scheduler call processWeeklyRecapCatchup(DB) after cron, cleanupWeeklyRecaps(DB,
  userId) before deleting user/userItems; no runtime DDL.
- Native: remove finished-item open suppression. Send stable interactionId for opens;
  private recap UI/models consume schemas/fixture when ready. All Swift remains Native.

## Checks / blockers

Pending implementation/tests. Integration owns live stack/Simulator.

## Interfaces now available (central integration can proceed)

- Reserved SQL exists: `apps/worker/src/db/migrations/0035_add_weekly_wrapped.sql`.
  Add journal idx35 and Drizzle tables mirroring SQL (preferences/windows/jobs).
  SQL is authoritative; raw-D1 service needs no runtime DDL or Drizzle exports.
- Default route export `routes/api-v1/weekly-recaps.ts` ready to register at `/api/v1`.
- Shared schemas module `packages/shared/src/schemas/weekly-recaps.ts` ready; export it
  from shared schemas/index.ts and package root. Native may import JSON shape directly.
- GET/PUT `/me/weekly-recap-preferences` => `{preferences:{timezone,pendingTimezone,
pendingEffectiveAt,trackingStartedAt},requestId,traceId}`. Initial PUT saves device
  timezone; GET initializes UTC only if not configured. Explicit changes take effect
  at a future Sunday and preserve old windows.
- GET `/me/weekly-recaps?limit=20&cursor=YYYY-MM-DD` => `{recaps,nextCursor,...}`.
  GET `/me/weekly-recaps/:weekStart` => `{recap,...}`. Candidate fields and coverage
  are exact in schema; no candidate is selected by default.
- POST `/me/weekly-recaps/:weekStart/issue`, Idempotency-Key header, JSON
  `{selectedCandidateIds:[itemId,...],title?:string}` => Foundation `{issue,...}`.
- `weekly-recaps/service.ts`: `processWeeklyRecapCatchup(DB, now?)` bounded resumable
  25-owner/8-week scan; wire into cron. `cleanupWeeklyRecaps(DB,userId)` deletes private
  snapshots/preferences before account deletion.
- `weekly-recaps/evidence.ts`: `savedEvidenceStatement(DB,{userId,userItemId,
occurredAt,source,newlyCreated?})` for Delivery: batch BEFORE transitioning an
  unsaved row to BOOKMARKED; for freshly INSERTed saved row batch AFTER insert with
  newlyCreated=true. Core manual/inbox/finish writer hooks already applied.
- Native: `/bookmarks/:id/opened` should pass stable `X-Zine-Interaction-Id` header.
  Integration please forward header as `interactionId` into caller.items.markOpened;
  Native remove already-finished suppression. Opening owned unsaved/finished items
  now records actual OPENED; never invoke this on prefetch.
- Normalized reading position/duration=1 no longer emits fabricated PLAYER seconds.

Pending: tests, fixtures, idempotent draft-replay edge cases, integration observation.

## Integration checkpoint

- New Wrapped D1 suite: 16 tests passed (calendar/DST, snapshot/history, private API,
  save/open/finish evidence rollback/idempotency, delayed draft and retries).
- Worker typecheck passed before concurrent changes; running existing save/item suites.
- Native fixture ready: packages/shared/src/fixtures/weekly-recaps/v1.json (preferences,
  mixed recap and empty recap). Schema module is exact wire contract.
- `savedEvidenceStatement` supports optional mutationGuard for Delivery's conditional batch.
- Added SQL `weekly_recap_draft_requests` to 0035 to freeze saved IDs/title/hash per
  explicit draft intent: retries replay after unbookmark without changing the request.
  Integration please add corresponding Drizzle mapping. cleanupWeeklyRecaps deletes it
  before windows/preferences.
- Native initialization should PUT device timezone before first history GET if no saved
  preference exists; GET defaults UTC conservatively. Explicit subsequent timezone edits
  schedule a future Sunday and do not rewrite any existing window.

Provider save coverage: now also owns ingestion/processor/write.ts, rss/service.ts,
x-bookmarks/service.ts and newsletters/gmail.ts for atomic saved evidence on actual
auto-save/import insertion. Disabled auto-save/Inbox ingestion emits no SAVED event;
conflicting canonical user-item inserts emit none. Existing save/item suites passed
76 tests. Wrapped suite passed16. Provider focused suites rerunning after stale test
builder updated to support conditional INSERT SELECT.

### Final-check checkpoint in progress

Draft type import and weekly test import-type lint errors repaired. Scoped ESLint over
all Wrapped-owned modules/writers passes. Existing provider checks passed23; existing
save/item checks passed76; newsletter checks passed17. New actual-state-writer tests
cover initial save/retry/rebookmark, inbox/finish-save, and provider auto-save batch
replays. Wrapped suite now21 cases; final rerun in progress after timezone transition
edge repair. Please use current files rather than earlier lint logs.

Timezone transitions keep complete earlier calendar windows; overlapping first new-zone
hours remain assigned to preceding recap and are labeled partial, avoiding activity
loss/duplicate attribution. History excludes not-yet-closed persisted windows. Old
snapshots' timezone/bounds remain fixed. No live D1 migration or runtime owned here.

### Last functional gap being closed (Oct8)

The final audit found unsaved Today-source opens have no user_items row, so normal
OPENED writers alone cannot include them. Added exact opened-source snapshot column
`editorial_feedback_events.target_source_snapshot_json` via centrally allocated0038, and
recordEditorialFeedback writes it atomically for SOURCE/OPENED only. Related-source
context must never be treated as content opened. Wrapped reads this private snapshot,
includes unsaved candidates and maps them to real saved items after a later save.
Integration mirrored nullable targetSourceSnapshotJson in editorialFeedbackEvents,
registered0038 and applied it to its local state. No hosted migration was applied.
All22 Wrapped tests and7 editorial-feedback tests passed in the final152-test run.
Integration is rerunning broad Worker CI on final files.
Native optional candidate.originalUrl supports saving an unsaved recap item through
normal save flow before selecting it; composer still has no direct link entry.

### Terminal checkpoint

No further runtime edits pending from Wrapped. Exact Today source snapshots are
private; unsaved candidates return `publicationEligibility: UNSAVED` and optional
`originalUrl`. Saving through the ordinary bookmark flow maps that same candidate to
its canonical item while preserving its candidate ID and combining evidence once.
Integration confirmed the Native optional URL/save adapter is installed. Central
schema/API/cron/cleanup registrations are in place. Final scoped checks: Worker
typecheck PASS, lint PASS (one existing warning), 9 focused suites152 tests PASS.
