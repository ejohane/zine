# Delivery and attribution implementation report

October 8, 2026. Backend implementation is present in the shared worktree; no commit,
deployment, production write or message to a real person was made by this stream.
Native/Web and integrated live verification belong to their dispatched owners.

## Definition-of-done reconciliation

| Requirement              | Implementation and evidence                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Immediate issue delivery | `delivery/fanout.ts` consumes Foundation outbox events into recipient-only activity; sortable event-time ULIDs, paged durable checkpoint/lease, generation/subscription-time/availability checks and unique logical identities. Concurrent/replayed fanout tests pass. Integration invokes delivery after publish and on cron.                                                                                                                                    |
| Daily additions          | `delivery/digests.ts` initializes subscription-generation cursors, claims a frozen cutoff/local date, reads immutable event sequence independent of dispatch order, groups visible independent additions across issues, commits activity and checkpoint atomically, and schedules next local 09:00. DST/non-hour zones, concurrent claims, batch rollback/lease recovery, removals including commit-time races, empty checkpoint and delayed dispatch tests pass. |
| Reader timezone          | Preferences distinguish absent from explicitly saved UTC; initializeOnly atomically initializes without overwriting a saved choice. Updates preserve claimed occurrence and reconcile future schedule. Native/Web must initialize after auth/subscribe.                                                                                                                                                                                                           |
| Muting/unsubscribe       | In-app activity remains when muted. Push checks active subscription generation, mute, current issue/publication availability and installation version immediately before external send. Resubscription does not revive old jobs. Tests exercise mute, generation changes, revocation and token rotation.                                                                                                                                                          |
| Push jobs                | `delivery/outbox.ts` persists installation-version jobs, conditional expiring leases, bounded exponential retries and terminal safe reasons. Disabled APNs does not consume provider retry budget. No historical activity backlog on new registration. Operator replay retains the original job/activity identity. Exactly-once logical activity is tested; exactly-once visible APNs is not promised.                                                            |
| APNs adapter             | `delivery/apns.ts` implements protected ES256 provider JWT, sandbox/production host, topic, alert/collapse/expiry headers, ID-only navigation, request timeout, safe response classification, retry-after and token retirement. Tests sign actual ephemeral ES256 keys and inspect injected HTTP requests/responses. Real APNs credentials, hosted network acceptance and physical receipt/tap are unverified; APNS_ENABLED remains false under Integration.      |
| Saving with provenance   | `attribution.ts` resolves server-trusted currently public canonical selection, preserves reader item/notes/tags/progress, and atomically commits bookmark state, SAVED evidence, enrichment intent, immutable reference snapshot and mutation replay. Concurrent new saves, repeated intents, rebookmark, multiple source issues, private/forged/unavailable selections and forced rollback tests pass.                                                           |
| Retention                | `delivery/cleanup.ts` removes recipient operational records/references on their deletion, cancels editor delivery, and deliberately preserves other readers' reference text. Editor deletion leaves bookmark and unavailable attribution without links. Tests use actual Foundation cleanup and D1.                                                                                                                                                               |
| New markers              | `visits.ts` supports explicit first-visit null and monotonically increasing observed revisions; future revisions are rejected. Native must call only after presentation. Tests cover no-write reads, stale/out-of-order and future visits.                                                                                                                                                                                                                        |
| Routes/contracts         | Authenticated Clerk-only REST handlers, shared strict Zod resources/inputs, versioned JSON fixtures and aggregate health/replay helpers are present. Auth isolation and timezone/save/visit routes are tested. Integration owns OpenAPI/export registration and diagnostic wiring.                                                                                                                                                                                |

## Changed paths owned by this stream

- `apps/worker/src/publications/delivery/{activity,apns,cleanup,digests,fanout,installations,outbox,service,time}.ts`
- `apps/worker/src/publications/delivery/{delivery.integration,time}.test.ts`
- `apps/worker/src/publications/{attribution,visits}.ts`
- `apps/worker/src/routes/api-v1/publication-delivery.ts`
- `apps/worker/src/db/migrations/0036_add_publication_delivery.sql`
- `apps/worker/src/db/migrations/0037_add_publication_fanout_checkpoint.sql`
- `packages/shared/src/schemas/publication-delivery.ts`
- `packages/shared/src/fixtures/publication-delivery/v1.json`
- `packages/shared/test/publication-delivery.test.ts`
- This report, stream handoff definition of done and `05-runtime-status.md`.

Central shared exports, Drizzle/journal, registry/OpenAPI, Worker config/cron and account
cleanup were contributed through Integration. Wrapped supplied guarded SAVED evidence
in its owned helper; this stream did not race edits to bookmarks/save.ts or Swift.

## Checks performed

- Worker focused suite: **47 passed**, 35 real-D1/Hono integration cases and 12
  calendar/provider cases. The test runtime uses workerd/D1 with real migration SQL;
  Clerk verification and outbound APNs are injected, not production credentials.
- Shared contract suite: **2 passed**, actual fixture decoding and private/unknown
  field rejection. An initial invalid fixture ID was corrected before the passing run.
- Worker typecheck passed; this is a whole Worker check across parallel edits.
- ESLint on this stream's owned runtime/schema files passed. A broad Worker lint run
  at an earlier checkpoint found Wrapped's type-only import error and the existing
  api-v1 warning; this stream did not edit the other owner's file.
- Formatting is checked on owned files only, avoiding concurrent repository-wide writes.

Integration is rerunning the authenticated local REST scenario after applying 0037.
This stream did not start or stop a shared live stack, claim native UI verification,
or build/install/launch on a physical iPhone. Those evidence states remain with
Integration/Native. Backend implementation readiness is not complete feature-release
readiness.

## Operational behavior and external prerequisites

APNs requires protected APNS_TEAM_ID, APNS_KEY_ID and APNS_PRIVATE_KEY, with
APNS_ENABLED=true only after provisioning. Topic defaults to app.zine.native; every
installation records sandbox/production. Native must register an account/API-scoped
opaque installation ID, revoke on sign-out, and request permission contextually.
A token moved to a new installation atomically retires the old token's jobs. Do not
log or return device tokens/provider keys.

Run `publicationDeliveryHealth(DB)` to inspect aggregate pending/event/job states.
For failed pushes, distinguish configuration/permanent from transient problems,
correct the cause, then use trusted `retryFailedPublicationPush(DB,id)` for the same
job identity. Stale events/expired destinations are suppressed at send. Invalid token
responses retire only the matching token version. An unsubscribe after APNs has
accepted a request cannot retract it. Apple can repeat visible delivery following an
ambiguous network outcome; stable collapse identity mitigates this without claiming
an impossible exactly-once external guarantee.

Provider behavior follows Apple's [request contract](https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns)
and [response contract](https://developer.apple.com/documentation/usernotifications/handling-notification-responses-from-apns).

Migration0037 is idempotent for the in-flight local state that applied the identical
checkpoint table in an early0036 revision. A focused test executes actual0037 queries
against the already-existing table and passes without restore/data deletion.
