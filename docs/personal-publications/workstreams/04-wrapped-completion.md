# Weekly Wrapped completion

Backend implementation is complete and stable in the shared worktree. Native and
live integration evidence remain owned by streams2 and5; automated tests here do
not establish visible app behavior. Nothing was deployed or published by this stream.

## Delivered behavior

- Private Sunday-to-Sunday calendar recaps in a saved IANA timezone, with DST-aware
  boundaries, closed-week availability, history and resumable scheduled catch-up.
  Explicit timezone changes preserve historical windows and assign overlapping
  transition hours to the preceding recap without duplicate attribution.
- Atomic, idempotent SAVED/OPENED/FINISHED evidence for real manual, inbox,
  finish-save, provider auto-save and owned-item open paths. Retry identities do not
  invent repeated interactions; normalized reader progress does not claim playback
  minutes. External navigation never implies completion.
- Exact Today source-open snapshots, including sources not yet saved. Related story
  sources are not counted as opened. Ordinary saving preserves the recap candidate
  identity and resolves it to the canonical saved bookmark.
- Durable private snapshots preserve earlier evidence after later activity or source
  deletion. Coverage labels explain legacy timestamp limits and unavailable exact
  historical Today-source tracking. No automatic selection or public activity data.
- Clerk-authenticated preferences/history/recap routes and explicit selection-to-draft
  adapter. Private/unsaved/foreign choices are rejected; successful idempotent draft
  retries remain replayable after a later unbookmark. Foundation supplies the ordinary
  editable weekly issue and enforces one issue per window.

## Contracts and integration

Shared wire schemas are in `packages/shared/src/schemas/weekly-recaps.ts`; Native
fixtures are in `packages/shared/src/fixtures/weekly-recaps/v1.json`. Candidates can
include optional `originalUrl` for the ordinary save-before-selection flow.

Routes are in `apps/worker/src/routes/api-v1/weekly-recaps.ts`:

- GET/PUT `/api/v1/me/weekly-recap-preferences`
- GET `/api/v1/me/weekly-recaps`
- GET `/api/v1/me/weekly-recaps/:weekStart`
- POST `/api/v1/me/weekly-recaps/:weekStart/issue` with explicit candidate IDs and
  `Idempotency-Key`.

Integration registered routes, shared exports, cron catch-up and account cleanup.
Migration0035 creates private recap storage; migration0038 adds the exact editorial
source snapshot column. Integration mapped both in Drizzle/journal and applied0038
to its local stack. There is no runtime DDL and no hosted migration from this stream.

## Verification

Final focused regression passed152 tests in9 files: Wrapped22, editorial feedback7,
existing calendar recap7, bookmark19, item57, provider-write5, RSS14, newsletter17,
and X bookmark4. Tests use fresh isolated D1 with all migrations and exercise real
state writers, rollback, retry, calendar boundaries, privacy/auth, catch-up,
late evidence, explicit draft replay and unsaved Today save-to-selection mapping.

Worker typecheck passed. Worker lint passed with one existing explicit-any warning
in `routes/api-v1.integration.test.ts`. Integration owns the final broad CI run and
reports authenticated local REST, build/install/launch and Simulator observation
separately. No native UI observation is claimed by this completion report.
