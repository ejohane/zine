# Delivery and attribution runtime status

Status: implementing. Owner: chat 01a11b82-e550-7fe2-a54c-e1906dd44eea.

## Claimed files

`apps/worker/src/publications/delivery/*`, `publications/attribution.ts`,
`publications/visits.ts`, `routes/api-v1/publication-delivery.ts`,
`packages/shared/src/schemas/publication-delivery.ts`, migration SQL
`0036_add_publication_delivery.sql` (reserve with Integration; Wrapped takes 0035).
No edits to central schema/journal/exports/registry/cron/config/auth cleanup.

## Integration requests

- Register default route module `./api-v1/publication-delivery` at `/api/v1`.
- Export `./schemas/publication-delivery` from shared schemas/root exports.
- Allocate migration 0036 after Wrapped 0035 and add Drizzle declarations if needed.
- Schedule `runPublicationDelivery(env)` from delivery/service.ts in cron; call
  `fanoutPendingPublications(env.DB)` via executionCtx.waitUntil after a successful
  publication POST so new-issue activity does not wait for the next cron.
- Cleanup: call `cleanupPublicationDelivery(env.DB, userId)` from delivery/cleanup.ts
  before Foundation owner cleanup and before deleting user_items/users.
- APNs adapter uses optional structural config APNS_TEAM_ID, APNS_KEY_ID,
  APNS_PRIVATE_KEY, APNS_TOPIC (default app.zine.native), APNS_ENABLED string.
  No secret values inspected; Integration owns bindings/config.

## Native/web interfaces (planned now; executable schema follows)

GET /me/publication-activity -> { activities, nextCursor, requestId, traceId }
PATCH /me/publication-activity/:id -> mark read
PUT/DELETE /me/push-installations/:installationId -> { installation: { id, enabled } }
PUT /me/publication-delivery-preferences -> { preferences: { timezone } }
GET /me/publication-delivery-preferences -> same
GET/PUT /issues/:id/visit -> { visit: { lastSeenRevision: number|null } }
POST /issues/:id/selections/:selectionId/save -> { itemId,userItemId,status,discoveryReferences }
GET /bookmarks/:id/discovery-references -> { discoveryReferences }
All authenticated, Clerk-only. Save requires Idempotency-Key. Visit PUT takes
{ observedRevision }. Installation PUT takes { token, environment: sandbox|production }.
Preferences PUT takes { timezone: IANA }. Activity types ISSUE_PUBLISHED/DAILY_ADDITIONS
contain publicationId, issueIds, selectionIds, createdAt, readAt and safe public labels.
References contain publicationId,issueId,selectionId,publicationName,issueTitle,
editorName,commentary,savedAt,available; links use IDs only when available.

## Checks and blockers

No runtime checks yet. APNs credentials/capability and physical receipt unverified.
Integration owns live dev stack and Simulator; no independent live stack will start.

### Available now / coordination details

0036 SQL and shared publication-delivery.ts schema are on disk. Foundation fanout
now generates actual sortable ULIDs per recipient page (random-hex draft replaced).
Confirmed exports will be runPublicationDelivery, fanoutPendingPublications and
cleanupPublicationDelivery. Drizzle declarations can mirror 0036 SQL directly.

Wrapped helper request: savedEvidenceStatement needs optional mutationGuard:string
and appended `AND EXISTS(SELECT 1 FROM personal_publication_mutations WHERE id=?)`
when provided. Trusted save batches must not emit evidence when Foundation's guard
inserts nothing. Please add this optional field/helper condition in evidence.ts;
Delivery will call it before existing-state update, after new-row insert.

### Modules ready for central integration

All named entrypoints now exist. Route module exists and imports shared exports;
Integration can register/export now. Migration 0036 uses eight tables:
personal_delivery_preferences, personal_publication_activity, personal_digest_cursors,
personal_push_installations, personal_push_jobs, personal_issue_visits,
personal_discovery_references, personal_publication_fanout (all columns in SQL). It is safe to mirror SQL.

runPublicationDelivery({DB, ...optional APNS\_\* config}) runs fanout, digest, enqueue,
and push. Cron works without APNs (in-app activity still commits). Successful publish
should waitUntil fanout + enqueue/process or runPublicationDelivery for immediate push.
Standalone backend focused D1 tests underway. No live stack started.

### Checkpoint

29 focused tests passed (23 real-D1 integration + 6 time/provider checks). Current
fanout uses event-timestamp ULIDs so pagination reflects chronological events even
when dispatch is delayed. Shared schema and all route modules are ready.
Extra rollback, multi-issue, APNs response and lease tests being added. Native
interfaces are implemented as listed above; please consume exported executable types.

Added personal_publication_fanout to 0036 with durable recipient cursor and expiring
lease. Batches limit 250 recipients/invocation and resume, preventing restart
starvation on large publications. Please mirror this eighth table too.

### Verification checkpoint 2

44 focused tests pass: 32 real-D1 integration tests + 12 scheduling/APNs tests.
Worker typecheck passes. Worker lint currently fails only in Wrapped's
weekly-recaps/draft.ts type-only import, plus the pre-existing api-v1 warning.
This stream's files have no lint errors. Integration owns live/native verification.

Native registration rule: use an account-scoped installation ID or a new ID after
account switch. Server refuses taking over another owner's installation ID, but
registering the same token under a new ID atomically removes the old installation
and its pending jobs. Revoke on sign-out; tokens are never returned in responses.

Available utility: publicationDeliveryHealth(DB) returns aggregate status counts,
retryFailedPublicationPush(DB,id) resets a FAILED job under its same logical identity
for trusted operator replay. Integration may expose aggregate health in diag tooling.

### Native preference initialization request implemented

GET/PUT preferences now return `{timezone, configured: boolean}`. `configured:false`
means there is no stored preference, distinct from explicit UTC. PUT accepts optional
`initializeOnly:true` to atomically set only when absent, avoiding cross-device races.
Use this after auth/subscribe with device IANA timezone; never silently overwrite an
existing configured timezone on travel. Explicit user editing PUT omits initializeOnly.
Shared output schema DeliveryPreferencesResourceSchema available for OpenAPI.

### Migration follow-up (important for live stack)

Fanout checkpoint table is now in additive 0037_add_publication_fanout_checkpoint.sql
rather than changing already-possibly-applied 0036. Please reserve journal idx37, map
personalPublicationFanout, and apply this new migration before live delivery calls.
0036 contains the original seven delivery tables; no running local state touched.
This avoids relying on migration checksum changes to rerun an applied migration.

## Terminal backend handoff

Backend implementation complete, awaiting Integration's live/native/physical evidence.
Report: 05-delivery-completion.md. 45 Worker tests + 2 shared tests pass. Migration0037
is registered by Integration; no further structural changes planned. All requested
entrypoints and resource fixtures are ready. APNs physical receipt is unverified and
APNS_ENABLED stays false pending protected provider/signing provisioning. No commits.

0037 uses CREATE TABLE IF NOT EXISTS to support the in-flight local state where
Integration applied the earlier 0036 version with that identical table. This is SQL
migration compatibility, not runtime DDL; no data restore or deletion required.

Final check: 47 Worker tests (35 real-D1/Hono + 12 time/APNs) and 2 shared tests pass.
Owned files ESLint and formatting pass. Final regression cases include in-flight0037
compatibility and removing selections between digest read and commit. Backend handoff
is ready; no further writes planned unless Integration finds a correction.
