# Delivery and attribution: implementation handoff

Assigned October 8, 2026. Baseline: [contracts](../contracts.md),
[product scope](../product-spec.md), and [foundation handoff](01-foundation-handoff.md).
This assignment produces planning only; no delivery or device behavior is verified.

## Inspected integration points

- `apps/worker/src/db/schema.ts`: `user_notifications` is for connection health;
  its active user/type/provider uniqueness cannot represent issue events. New
  publication activity tables are required. `user_items` already uniquely identifies
  a reader/canonical-item relationship.
- `apps/worker/src/bookmarks/save.ts`: metadata-based save reuses existing bookmarks
  and preserves progress. It also creates canonical items/creators and dispatches
  enrichment; do not pass another reader's private raw metadata through this path.
- `apps/worker/src/enrichment/outbox.ts`: reusable durable-intent/conditional-claim
  pattern, explicitly at-least-once. Publication consumers need their own dedupe.
- `apps/worker/src/index.ts` and `wrangler.toml`: five-minute repair cron exists;
  existing queue routing falls through to sync. New publication queue branches must
  be explicit before that fallback and configured in development/staging/production.
- `apps/worker/src/routes/api-v1/library.ts`: canonical bookmark REST integration.
  Publication-save adapters must return existing bookmark identities/statuses.
- `apps/worker/src/routes/auth.ts`: explicit deletion removes user items before users.
  Delivery cleanup and editor tombstoning must precede this deletion sequence.
- `apps/ios/Configuration/ZineNative.entitlements`: associated webcredentials and
  Apple sign-in exist; no APNs entitlement. No remote-notification registration or
  notification delegate was found under `apps/ios`. Push is a new capability.

## Exclusive implementation ownership

Stream 5 owns new modules:

| Path                                                     | Responsibility                                            |
| -------------------------------------------------------- | --------------------------------------------------------- |
| `apps/worker/src/publications/delivery/fanout.ts`        | Event recipients, checkpoints, activity insertion         |
| `apps/worker/src/publications/delivery/digests.ts`       | Due occurrences, cutoff, visible additions                |
| `apps/worker/src/publications/delivery/outbox.ts`        | Leases, push jobs, retries, repair                        |
| `apps/worker/src/publications/delivery/apns.ts`          | Provider adapter, response classification                 |
| `apps/worker/src/publications/delivery/installations.ts` | Authenticated installation lifecycle                      |
| `apps/worker/src/publications/delivery/activity.ts`      | Recipient-only activity/read operations                   |
| `apps/worker/src/publications/attribution.ts`            | Trusted selection save and reference snapshots            |
| `apps/worker/src/publications/visits.ts`                 | Presented-revision watermark                              |
| `apps/worker/src/publications/delivery/cleanup.ts`       | Recipient cleanup/editor delivery cancellation            |
| `apps/worker/src/routes/api-v1/publication-delivery.ts`  | Activity, installation, visit and selection-save handlers |
| Adjacent `*.test.ts`                                     | Time, race, recipient isolation and save regressions      |

Foundation owns central schema/migrations, shared schema exports, route registry,
OpenAPI, account-deletion integration and immutable publication event creation.
Request `packages/shared/src/schemas/publication-delivery.ts` through foundation.
Supply adapters for `index.ts`, Worker bindings and queue configuration for the
integration owner to apply serially. Do not concurrently modify shared registries.

Stream 2 owns Swift models/API additions, activity UI, bookmark attribution UI,
permission UX, app delegate/token lifecycle and push navigation. Supply versioned
fixtures and exact callbacks rather than editing its app shell. Stream 3 supplies
public issue/publication URLs; push uses the same native destination identities.

## Persistence requests to foundation

Names are proposed; all times Unix milliseconds, identifiers opaque. Add indexes
for each due-work and recipient query. Do not reuse provider subscriptions.

- Fanout state: unique event ID, last recipient cursor, status, lease/version,
  nextAttemptAt. Recipient eligibility uses active subscription generation and
  `subscribedAt <= occurredAt`; no backfill on subscribing. Foundation should expose
  a total event sequence/cursor so late dispatch cannot lose additions.
- Activity: ID, recipient user ID, publication ID, subscription generation,
  ISSUE_PUBLISHED or DAILY_ADDITIONS, logical identity, issue IDs, selection IDs,
  createdAt/readAt. Unique recipient + logical identity. Resolve safe presentation
  through projection; never store subscriber lists/private source metadata in payloads.
- Digest cursor: subscription generation, last covered event sequence, nextDueAt,
  saved IANA timezone, schedule version and due local date. One claimed occurrence
  freezes timezone/date/cutoff. Batch unique recipient + publication + local date;
  record generation separately and never revive an earlier generation's batch.
- Digest membership: batch + event/selection unique; frozen issue groups and cutoff.
  Separate covered events from visible payload so removed additions still advance
  the checkpoint and cannot return forever.
- Push installation: opaque installation ID, current authenticated owner, token,
  APNs environment/topic, token version, enabled/revoked state, timestamps. Token
  is sensitive operational data; never return or log it. Unique environment/topic/token;
  takeover/reassignment requires authenticated registration and old-owner revocation.
- Push job: activity + installation + token version unique, state, attempt count,
  nextAttemptAt, expiring lease, APNs request ID, safe status/reason, terminalAt.
- Visits: reader + issue unique, lastSeenRevision, presentedAt.
- Discovery reference: ID, reader-owned userItemId, stable selection/issue/publication
  IDs, publication-name/issue-title/editor-name/commentary snapshots, savedAt.
  Unique userItemId + selectionId. No cascade from editor-owned entities. Availability
  resolved from tombstones, not stale saved URLs. Sort savedAt then reference ID.

Recipient account deletion removes their subscriptions, cursors, activity, jobs,
installations, visits and references before user-item/user deletion. Editor deletion
cancels pending delivery, removes live content and links, and leaves reader-owned
minimal attribution snapshots intact. Foundation retains unavailable ID tombstones;
full issue/commentary copies must not remain in delivery operational records.

## Fanout, digest and retry rules

1. Foundation atomically commits mutation, immutable event and dispatch intent.
   Consume ISSUE_PUBLISHED immediately; its activity identity is event ID. Emit one
   recipient activity regardless of replays. Never notify the publisher.
2. SELECTIONS_ADDED feeds the daily cursor; initial publication selections never do.
   ISSUE_CORRECTED/REMOVED/UNAVAILABLE never create notification activity.
3. At 09:00 subscriber saved timezone, claim due occurrence and freeze a high-water
   event cursor. Include eligible additions after the previous covered cursor and
   through that cutoff, across all independent issues in the publication. Recheck
   visibility; removed/unavailable selections and unavailable issues are excluded.
   Empty batch advances cursor without activity/push. Events committed after cutoff
   remain for the next occurrence, even if dispatch arrives out of order.
4. Atomically persist activity/batch and checkpoint. Crash before commit retries the
   same occurrence; after commit reuses it. Push retries never create fresh activity.
   Multiple devices may receive the same logical notification, each with one job.
5. Calendar-convert local 09:00 to UTC, never add 24 hours. Due scan every five minutes
   provides delivery at/after 09:00, not an exact-second guarantee. Missing/invalid
   timezone falls back explicitly to UTC until client supplies valid saved IANA zone.
   Native reports a preference; travel does not silently reset it.
6. Timezone change preserves an already claimed occurrence and its identity. Future
   unclaimed scheduling uses the next future 09:00 in the new zone; a local date
   already batched cannot create a second batch. Retry after midnight retains the
   original date/cutoff. A delayed occurrence can cover accumulated changes; do not
   produce empty catch-up alerts for each missed day. Persist last covered sequence
   so timezone changes cannot lose or reinclude covered events.
7. Recheck subscription generation/existence, publication availability and mute at
   each activity commit and immediately before APNs attempt. Unsubscribe cancels
   pending old-generation work; resubscribe cannot revive it. Mute suppresses push
   only; activity remains. A concurrent unsubscribe after external send begins may
   not retract that push; document the send-authorization boundary and test it.
8. Claim by conditional D1 update/version and recover expired leases. Retry network,
   429 and transient 5xx with bounded exponential backoff/jitter and Retry-After.
   Retire invalid/unregistered tokens only if token version still matches; old APNs
   responses must not revoke refreshed tokens. Authentication/configuration failures
   alert operators and halt blind retries. Exhausted jobs remain diagnosable/replayable.

APNs is external: a crash after acceptance and before recording success can resend.
Persist deterministic logical activity ID and use an APNs collapse ID per activity
as mitigation; never claim exactly-once visible push. Exactly-once logical inbox
activity and idempotent writes are testable guarantees. Set bounded push expiration;
retries must not deliver obsolete publication destinations indefinitely.

## Native push capability and diagnostics prerequisites

Enable Push Notifications for `app.zine.native`, correct development/production
`aps-environment` through signing/profiles, and APNs provider authentication with
team ID, key ID, and protected signing key. Provision separate environment/topic
routing and verify archive entitlements. No background remote-notification mode is
required for ordinary visible alerts; do not add it without a concrete need.

Use secretsctl setup/presence checks when implementation needs credentials; this
assignment does not inspect secret values or change Apple capabilities. Native
requests notification permission contextually, registers after authentication,
updates token rotations, revokes on sign-out/account switch and handles denial.
Push payload carries activity/destination IDs only; native authenticates, resolves
current availability and navigates after cold/warm launch. In-app unread is independent
of APNs permission, provider success and push-open behavior.

Expose aggregate pending/oldest/retry/terminal/invalid-token diagnostics through
repo-owned diagnostic integration; structured event/job/request correlation must
exclude tokens and user content. Runbook: inspect backlog/claims → distinguish APNs
config from transient/provider failures → fix config or retire token → replay same
job identity → verify activity dedupe. Mock acceptance is not real phone delivery;
record build, entitlement, install, permission, receipt and tap destination separately.

## Save and visit correctness

Resolve issue + selection using authenticated reader and server public projection;
require currently published, available selection. Ignore client-authored item IDs,
metadata, attribution and commentary. Use its existing canonical item ID to atomically
reuse/restore/create `user_items`, enrichment intent and discovery reference. Preserve
reader notes/tags/progress and canonical identity. Implement trusted-item save adapter
alongside `bookmarks/save.ts`; avoid calling metadata save then attaching attribution
in a second non-atomic write. Guard concurrent item uniqueness conflicts and replay
original result under foundation's mutation/idempotency envelope.

Reference captures save-time commentary; later editor corrections do not rewrite
reader-owned snapshots. Repeated same selection save adds nothing; different issue
selections add references. Unavailable destination loses link, not reader bookmark
or attribution. Deletion racing save must either commit a valid retained snapshot
before tombstoning or return unavailable, never resurrect public content.

Visit endpoint accepts observed revision, rejects future revisions and only advances
monotonically after available public issue validation. Client calls after presentation,
not fetch; send previous stored watermark with initial read so additions are marked
before visit advances. Responses arriving out of order cannot regress state.
New = firstPublishedRevision > prior watermark; initial visit should use an explicit
first-visit state rather than falsely labeling every original selection a new addition.

## Tests and first bounded coding task

Required focused cases: duplicate/out-of-order event fanout; concurrent claims and
lease expiry; atomic batch rollback; initial publication exclusion; additions across
several issues; removals before send; empty digest checkpoint; subscribe/mute/unsubscribe
and resubscribe generations; UTC/non-hour zones/DST/timezone change/midnight retry;
recipient isolation/read state; no push permission; token rotation race; APNs ambiguous
acceptance; save new/existing/rebookmarked content; concurrent saves and rollback;
forged/private/unavailable selection; multiple sources; editor deletion vs reader
deletion; commentary retention; out-of-order visits and future-revision rejection.
Use real local D1 for SQL uniqueness/rollback claims, deterministic clocks/provider
adapters for scheduling, and real physical-device receipt/tap for push release gate.

First task: implement pure digest scheduling/identity and eligibility helpers plus
versioned delivery/attribution fixtures and deterministic tests under the new delivery
folder. Inputs are foundation events/subscription generation and frozen clock/timezone;
outputs are recipient activity identity, due occurrence, cutoff and filtered issue
selection groups. No queues/APNs/central schema changes in this slice. Foundation
then integrates requested tables and adapters before durable D1 implementation.

## Definition of done: runtime implementation

Done requires persisted recipient-only activity, immediate issue fanout, one 09:00
local additions digest per publication/day, generation/mute/availability suppression,
durable push retries and installation rotation, monotonic presented-revision visits,
and atomic trusted selection saving with reader-owned provenance surviving editor
removal. Routes and shared schemas must integrate with actual Foundation, migration
and cleanup seams. Meaningful real local D1 tests must prove duplicates, races,
rollback, scheduling, isolation and provenance; provider mocks prove classification
only. APNs signing/capability/physical-device receipt remain explicitly external
until actually verified. Native UI belongs to stream 2; no backend test is UI proof.
