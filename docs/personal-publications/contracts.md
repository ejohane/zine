# Shared contracts: proposed implementation baseline

Status: technical baseline approved by Erik on October 8, 2026. The integration
owner coordinates executable schema details before dependent implementations merge.
Route names below are proposals, not existing endpoints. Use Clerk-authenticated
`/api/v1` for private operations and explicit anonymous projections for public reads.
No parallel native-only API or new native tRPC dependency.

## Entities and ownership

| Entity                   | Minimum contract                                                                                                                                                   | Owner                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| Publication              | Stable ID, unique owner user ID, stable public handle, optional display name, description, cover reference, editor public identity                                 | Foundation                            |
| Issue                    | Stable ID, publication ID, WEEKLY/INDEPENDENT kind, DRAFT/PUBLISHED status, title, cover, introduction, revision, publishedAt; weekly window reference when weekly | Foundation                            |
| Section                  | Stable ID, issue ID, optional heading, ordered placement                                                                                                           | Foundation                            |
| Selection                | Stable ID, issue/section ID, canonical item ID, public metadata snapshot, commentary, order, firstPublishedRevision/At                                             | Foundation                            |
| Publication subscription | Subscriber user ID + publication ID unique, muted flag, subscribedAt                                                                                               | Foundation storage; delivery behavior |
| Issue visit              | Reader user ID + issue ID, lastSeenRevision                                                                                                                        | Delivery                              |
| Publication event        | Immutable ID, publication/issue IDs, revision, kind, visible selection IDs, occurredAt                                                                             | Foundation                            |
| Activity/delivery        | Recipient, event or digest identity, read state, delivery state, retry metadata                                                                                    | Delivery                              |
| Discovery reference      | Reader bookmark ID, selection/issue/publication IDs, attribution/commentary snapshot, savedAt, destination availability                                            | Attribution                           |
| Weekly recap             | Owner, saved timezone, local start date, UTC start/end, evidence coverage, candidates with observed activity labels                                                | Wrapped                               |

Proposed new persistence uses stable opaque IDs and Unix milliseconds. REST timestamps
are ISO8601 UTC strings. Weekly local dates and IANA timezone are separate fields.
Provider subscription tables must not be reused as publication subscriptions.

## Issue transitions and concurrency

Proposed transition rules:

| Operation                                | Draft | Published weekly            | Published independent           |
| ---------------------------------------- | ----- | --------------------------- | ------------------------------- |
| Edit title/cover/introduction/commentary | Yes   | Correction                  | Yes                             |
| Reorder or edit section headings         | Yes   | Correction, no notification | Yes, no notification            |
| Add a selection                          | Yes   | Rejected                    | Yes, emits addition event       |
| Remove a selection                       | Yes   | Yes, silent correction      | Yes, silent correction          |
| Replace content with another item        | Yes   | Rejected as a new selection | Remove + add; addition notifies |
| Publish                                  | Once  | Idempotent replay only      | Idempotent replay only          |

Weekly replacement by a new item is deliberately rejected to enforce the agreed
no-new-selections rule; correcting the URL of the same original is a correction.
These correction rules are part of the accepted baseline. Deletion/unpublishing
and account deletion need a consistent implementation policy before persistence is frozen; never cascade-delete another
reader's bookmark or retained attribution text. Accepted baseline: owner removal
hides the public destination and retains minimal attribution tombstones.

All writes validate ownership and expected revision. Stale writes return a conflict
with current revision; never silently overwrite another device's edits. Publish
rechecks public eligibility for every selection and returns actionable failures.
Publication succeeds atomically with one durable published event; queue dispatch can
retry afterward. Publishing and selection saves accept idempotency keys; replay
returns the original result without duplicate events, selections, or references.

Proposed defaults: publishing needs a title and at least one selection; cover has a
neutral fallback. One weekly issue per publication/window. Stable links use IDs so
renaming does not break them. Freeze validation limits, cover asset handling, page
sizes, and duplicate-selection rules alongside executable schemas before clients
implement them. Text is plain text initially, escaped in public rendering.

## Public and private projection

Public DTOs are allowlists: editor public name, publication presentation, published
issue presentation/order, public metadata and commentary. Never serialize owner
library IDs/state, private user IDs, consumption timestamps, statistics, raw provider
payloads, email identities, private asset URLs, article bodies, or subscriber lists.
Use a safe public projection for cover/artwork too. An anonymous lookup of a draft
must not reveal that draft's contents or title.

Eligibility is server-enforced at selection time and publication. Freeze a provider
eligibility matrix and fixtures: public article/video/podcast/post; paywalled public
landing page; public newsletter edition; private email/feed; signed/tokenized URL;
missing destination. Do not equate HTTP 200 or a canonical URL with permission to
expose private metadata. Cover uploads require public-safe storage references and
limits; provider preview fetching must follow existing URL/network protections.

## Proposed REST surface

| Access    | Operation                                | Proposed route                                                                     |
| --------- | ---------------------------------------- | ---------------------------------------------------------------------------------- |
| Owner     | Read/create/update own publication       | GET/POST/PATCH `/api/v1/me/publication`                                            |
| Owner     | List own draft and published issues      | GET `/api/v1/me/publication/issues`                                                |
| Owner     | Create/read/edit/remove own issue        | POST `/api/v1/me/publication/issues`; GET/PATCH/DELETE `/api/v1/me/issues/:id`     |
| Owner     | Manage sections/order/selections         | Versioned PATCH `/api/v1/me/issues/:id` using typed operations                     |
| Owner     | Publish explicitly                       | POST `/api/v1/me/issues/:id/publish`                                               |
| Anonymous | Read publication and published archive   | GET `/api/v1/publications/:id`; GET `/api/v1/publications/:id/issues`              |
| Anonymous | Read published issue                     | GET `/api/v1/issues/:id`                                                           |
| Signed in | Subscribe/unsubscribe/mute               | PUT/DELETE/PATCH `/api/v1/publications/:id/subscription`                           |
| Owner     | Paginated private subscriber list        | GET `/api/v1/me/publication/subscribers`                                           |
| Signed in | Subscription list                        | GET `/api/v1/me/publication-subscriptions`                                         |
| Signed in | Save issue selection with provenance     | POST `/api/v1/issues/:id/selections/:selectionId/save`                             |
| Signed in | Record observed issue revision           | PUT `/api/v1/issues/:id/visit`                                                     |
| Signed in | Read/mark activity                       | GET `/api/v1/me/publication-activity`; PATCH `/api/v1/me/publication-activity/:id` |
| Signed in | Register/revoke push installation        | PUT/DELETE `/api/v1/me/push-installations/:installationId`                         |
| Owner     | Read private recap/history               | GET `/api/v1/me/weekly-recaps`; GET `/api/v1/me/weekly-recaps/:weekStart`          |
| Owner     | Create draft from explicit recap choices | POST `/api/v1/me/weekly-recaps/:weekStart/issue`                                   |

Use existing API error/envelope conventions, cursor pagination, shared runtime
schemas, OpenAPI updates, and Swift decoding fixtures. Server determines actor from
authentication; clients cannot supply arbitrary owner/subscriber IDs. Exact paths
and mutation operation shapes must be reconciled with existing route conventions
at contract freeze. A missing public selection returns unavailable without trusting
client-supplied provenance or copied private metadata.

## Example public issue payload (inner resource)

```json
{
  "id": "issue_example",
  "publication": {
    "id": "publication_example",
    "displayName": "Loose Threads",
    "editor": { "displayName": "Erik Johansson" }
  },
  "kind": "INDEPENDENT",
  "title": "Thinking about cities",
  "coverUrl": null,
  "introduction": "Three perspectives that stayed with me.",
  "revision": 4,
  "publishedAt": "2026-10-08T15:00:00Z",
  "sections": [
    {
      "id": "section_example",
      "heading": "Places and people",
      "selections": [
        {
          "id": "selection_example",
          "contentType": "ARTICLE",
          "title": "An essay about cities",
          "creatorName": "Example author",
          "sourceName": "Example publication",
          "originalUrl": "https://example.org/cities",
          "artworkUrl": null,
          "commentary": "An interesting way to look at the street outside.",
          "firstPublishedRevision": 4,
          "originalAvailability": "UNKNOWN"
        }
      ]
    }
  ]
}
```

## Event and delivery contract

Proposed event kinds: ISSUE_PUBLISHED, SELECTIONS_ADDED, ISSUE_CORRECTED,
SELECTIONS_REMOVED, ISSUE_UNAVAILABLE. Only the first two are notification sources.
Event contains IDs and revision, never consumption/private provider data. Readers
resolve public presentation through an allowlisted projection.

New-issue fanout and daily batches persist recipient delivery identities. Proposed
batch key: recipient + publication + local delivery date; retrying cannot create a
second logical notification. Proposed morning default: 09:00 in subscriber timezone
(technical default accepted with this baseline). Suppress self-notifications. Exclude additions
already covered by initial publication; remove additions no longer visible before
sending. Group multiple changed issues in one digest. Read/unread state is separate
from push delivery state. APNs failures do not undo publication or in-app activity.

Subscription deletion suppresses pending delivery. Mute is checked at send time and
suppresses push only. Invalid push tokens are retired; retries/backoff and terminal
failures are observable. Define digest checkpoint and timezone-change behavior before
scheduler implementation, including DST and retry-after-midnight cases.

Persist lastSeenRevision only after the client actually presents that revision;
background fetch must not clear new markers. Mark selections with
firstPublishedRevision greater than the saved visit revision as new on return.
Anonymous readers need no server visit identity; local marking is an optional
presentation choice, not a prerequisite to reading.

## Save and attribution contract

Save uses the server's issue selection identity to reuse canonical content and the
existing bookmark save semantics. Bookmark ownership and personal notes remain with
the reader. Discovery references are unique per reader bookmark + issue selection;
retrying the same save cannot multiply them. Different issues may add references to
the same bookmark. Sort by savedAt plus stable ID for deterministic first attribution.

Proposed provenance snapshots capture publication name, issue title, editor display
name, and selection commentary at save time. Live destination availability is
resolved separately. Deletion removes links but preserves minimal attribution text
and the reader's bookmark. Account deletion behavior and retention must be reconciled
before foreign-key cascades are chosen.

## Weekly evidence contract

Window is `[Sunday 00:00, next Sunday 00:00)` in saved publisher timezone, converted
to UTC instants. Do not subtract 168 hours across DST. Persist window identity and
timezone for past recaps so changing timezone later does not rewrite old weeks.

Candidate evidence includes observed saves/opens/finish transitions, their sources,
and coverage (complete since tracking started, partial, or legacy snapshot). Existing
consumption events are reusable only after auditing writers. Mutable last-opened
fields alone cannot preserve older weeks after later visits. Capture any missing
save/open history prospectively; do not fabricate events for historical periods.

Historical recaps need persisted evidence or a private snapshot, plus honest coverage
labels for periods before reliable tracking. A list of candidates is distinct from
selected IDs: empty selection is valid for recap viewing; draft creation receives
explicit saved candidate IDs and preserves the normal editor. No statistics cross
into public issue DTOs. Existing recap aggregation must be adapted behind REST rather
than exposing its tRPC input/window semantics as this contract.
