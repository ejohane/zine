# Publishing foundation: implementation handoff

Assignment date: October 8, 2026. Owner: publishing foundation. Baseline:
[approved contracts](../contracts.md) and [agreed product scope](../product-spec.md).
This document assigns implementation work; it does not claim implemented behavior.
Only this handoff is changed by this assignment.

## Outcome and boundaries

Provide one publication per editor, private issue composition, explicit publication,
anonymous safe reads, subscription storage, and durable lifecycle events. First
unblock a manually publishable independent issue; weekly creation uses the same
service after Wrapped supplies a persisted window. Own schema/migration sequencing,
shared DTO exports and REST/OpenAPI registration. Delivery contributes tables and
handlers through this owner; no competing edits to central registration files.

Do not implement SwiftUI, public HTML, recap ranking, APNs or scheduling here. Do
not reuse provider subscriptions or Today edition tables for this domain.

## Current repository evidence

Inspected files and resulting integration constraints:

- `apps/worker/src/db/schema.ts`: `users` stores Clerk ID and email, but no public
  display name. `items` carries canonical identity plus raw/private metadata and
  article storage keys; `userItems` is the user-specific bookmark relationship.
  Never serialize either record wholesale into a public response.
- `apps/worker/src/routes/api-v1.ts`: Hono composes independent route modules.
  New routes can follow that pattern without extending the tRPC router.
- `apps/worker/src/routes/api-v1/auth.ts`: `apiAuth` accepts Clerk tokens and scoped
  PATs. Existing PAT scopes cover bookmarks, sync and archive, not publishing.
- `apps/worker/src/routes/api-v1/editorial-experiments.ts` and `errors.ts`: current
  resource envelopes carry `requestId` and `traceId`; domain conflict codes use 409.
- `packages/shared/src/api-tokens.ts`: no publication scopes exist. Initial private
  publication routes should use a Clerk-only wrapper around existing verification,
  retaining isolated-test auth support. Explicitly reject PATs with 403 rather than
  grant publishing authority to `bookmarks:write`. PAT support can later introduce
  dedicated scopes; this does not block the agreed native client.
- `apps/worker/src/bookmarks/save.ts`: `saveBookmark` accepts metadata, resolves by
  provider identity and returns `created`, `already_bookmarked` or `rebookmarked`.
  Attribution saving must resolve the selection's canonical item server-side;
  it must not round-trip raw provider data through public clients.
- `apps/worker/src/enrichment/outbox.ts`: durable intent and best-effort dispatch
  already exist; adapt the pattern for publication events, with recipient delivery
  deduplication owned by delivery.
- `apps/worker/src/routes/auth.ts`: account deletion explicitly deletes user items
  then users. Publication tombstoning and dependent foreign-key cleanup must run
  before those deletes. Another reader's bookmark must survive.
- `apps/worker/src/article-body/url-safety.ts` and `lib/link-parser.ts`: reuse URL
  safety/private podcast recognition where applicable; they are not proof that
  arbitrary metadata is public. Existing migrations currently extend through
  `0033_add_podcast_destinations.sql`; allocate new numbers only at implementation
  time, after rechecking the journal and other active work.

## Concrete code ownership

New foundation-owned modules:

| Path                                            | Responsibility                                                               |
| ----------------------------------------------- | ---------------------------------------------------------------------------- |
| `packages/shared/src/schemas/publications.ts`   | Zod inputs, allowlisted owner/public DTOs, operation union and error details |
| `apps/worker/src/publications/service.ts`       | Domain operations and issue transitions                                      |
| `apps/worker/src/publications/repository.ts`    | D1 guarded batches, queries and cursor pagination                            |
| `apps/worker/src/publications/eligibility.ts`   | Public-destination evidence and metadata selection                           |
| `apps/worker/src/publications/projections.ts`   | Explicit owner/public conversion; tombstone resolution                       |
| `apps/worker/src/publications/events.ts`        | Immutable event creation and durable dispatch intent                         |
| `apps/worker/src/publications/assets.ts`        | Owner uploads and public-safe asset serving                                  |
| `apps/worker/src/routes/api-v1/publications.ts` | Foundation route handlers and auth placement                                 |
| `apps/worker/src/publications/fixtures.ts`      | Versioned source fixtures for dependent streams                              |
| Adjacent `*.test.ts`                            | Repository, lifecycle, privacy, eligibility and mutation tests               |

Serialized edits: `db/schema.ts`, migration SQL/journal,
`packages/shared/src/schemas/index.ts`, package root exports, `routes/api-v1.ts`,
`routes/api-v1.openapi.json`, and account deletion integration. Foundation owns
registration, but delivery and Wrapped own implementation bodies of their adapters.
Do not add runtime CREATE/ALTER schema fallbacks like the legacy recap initializer.

## Schema and migration allocation proposal

Allocate logical migrations in this order; no numeric identifiers are reserved here.

1. **Publication core:** `personal_publications`, `personal_publication_assets`,
   `personal_issues`, `personal_issue_sections`, `personal_issue_selections`.
2. **Mutation/event foundation:** `personal_publication_mutations`,
   `personal_publication_events`, `personal_publication_outbox`,
   `personal_publication_subscriptions`.
3. **Wrapped contribution:** saved timezone/preferences, persisted recap windows,
   evidence snapshots and missing prospective event support. Wrapped proposes
   columns/indexes; foundation checks issue-window uniqueness and migration ordering.
4. **Delivery/attribution contribution:** issue visits, activity/delivery identities,
   push installations and discovery references. Delivery supplies retention rules
   and index queries; foundation reconciles foreign keys and deletion ordering.

Use ULIDs, integer Unix milliseconds, explicit enum CHECK constraints and indexes
for each public lookup. Public IDs must never encode Clerk IDs.

- Publication: unique nullable owner ID referencing users with SET NULL on deletion;
  stable unique generated handle; explicit editor display name, optional publication
  name/description, asset reference, revision, timestamps and unavailable timestamp.
  An active owner has one row. Deleted publications retain their ID tombstone, lose
  owner linkage and are never reused. Handles are generated stable identifiers,
  separate from editable names. Native supplies an explicit public editor name;
  never default it to an email address.
- Issue: publication ID, kind/status, title/introduction/cover, revision starting at
  1, publishedAt, deletedAt, and immutable nullable weekly window ID. A unique
  publication/window index allows one weekly issue per window; independent windows
  are null. Hide removed issues; keep the window reservation to prevent ambiguous
  duplicate weekly editions. No unpublish/re-publish transition.
- Sections: issue ID, heading nullable, integer position; create one unheaded section
  for each new issue. Selections always belong to exactly one section of that issue.
- Selections: canonical item ID, validated public metadata snapshot, commentary,
  position, eligibility version/evidence, firstPublishedRevision/At, removedAt.
  Keep canonical content independent of editor bookmark deletion. Soft-remove a
  published selection so references can retain identity; archive in-memory ordering
  excludes removed rows. A weekly removed selection cannot be restored after publish.
- Unique active canonical item per issue; the same item can appear in different
  issues. Removing and readding to an independent issue creates a new selection ID
  and addition event; moves never create additions.
- Subscription: publication/subscriber unique, muted, subscribedAt, updatedAt,
  endedAt. Resubscription starts a new subscription generation so pending deliveries
  from an old subscription cannot revive. Self-subscription is rejected.
- Event: immutable ID, publication/issue/revision, kind, visible selection IDs and
  timestamp. Unique issue/revision/kind. Outbox separates retry state from immutable
  event payload. Mutation log is actor/operation/key unique and retains request hash,
  status and original response for replay.

Retained discovery snapshots belong to the reader, not the editor's deletion graph.
Deleting an editor must scrub their publication content/asset bytes and operational
records while retaining only unavailable IDs needed by reader-owned references.
Delivery owns retained attribution text; no foreign-key cascade may remove it.

## Executable validation defaults

Apply Unicode normalization and trim outer whitespace; count text in Unicode code
points consistently in server/client fixtures. All text is plain text. Reject unknown
input fields. Empty optional text becomes null; an empty draft title is allowed.

| Field / collection              | Default limit                                                     |
| ------------------------------- | ----------------------------------------------------------------- |
| Editor/publication display name | Editor required 1–80; publication optional 1–80                   |
| Publication description         | 500 characters                                                    |
| Issue title                     | 160 characters; required nonempty at publish                      |
| Introduction                    | 5,000 characters                                                  |
| Section heading                 | 120 characters                                                    |
| Selection commentary            | 2,000 characters                                                  |
| Issue size                      | 100 selections, 20 sections, 100 operations/request               |
| List pagination                 | 20 default, 50 maximum; opaque cursor                             |
| Request JSON                    | 256 KiB maximum                                                   |
| Idempotency key                 | 1–128 printable ASCII characters                                  |
| Cover upload                    | JPEG/PNG/WebP, 5 MiB encoded input; decoded maximum 20 megapixels |

Publish requires at least one visible eligible selection. Draft section headings can
be empty; public output omits empty sections. IDs are immutable ULIDs; local clients
can generate section/selection IDs for typed operations, but existing-ID collisions
never confer ownership and return conflict. Return complete owner issue after a
mutation; the size cap bounds decoding and keeps client state authoritative.

Use cover asset IDs, never arbitrary cover URLs in mutation inputs. Add authenticated
`POST /api/v1/me/publication-assets` for bounded multipart upload; issue/publication
PATCH can reference only ready assets owned by that editor. Decode, strip metadata,
re-encode to bounded output, verify MIME and enforce limits before storing bytes.
A draft upload is private until referenced by published presentation. Public-sharing
owns the canonical domain; foundation serves sanitized public bytes behind stable
asset IDs, with fallback cover when null. If the Worker image-transform capability
is unavailable, report that integration dependency; do not serve unchecked uploads.
Extend OpenAPI and fixtures for this necessary asset route alongside the baseline.

## Typed mutation and response contract

Keep baseline paths from contracts.md. Initial POST issue is for INDEPENDENT; Wrapped
calls the same domain create function with a server-resolved closed weekly window.
Clients cannot supply arbitrary weekly dates or owner IDs to bypass Wrapped validation.

```ts
type CreateIssue = { kind: 'INDEPENDENT'; title?: string };
type PatchIssue = { expectedRevision: number; operations: IssueOperation[] };
type IssueOperation =
  | {
      type: 'setPresentation';
      title?: string;
      introduction?: string | null;
      coverAssetId?: string | null;
    }
  | { type: 'addSection'; sectionId: string; heading?: string | null }
  | { type: 'setSectionHeading'; sectionId: string; heading: string | null }
  | { type: 'removeSection'; sectionId: string }
  | {
      type: 'addSelection';
      selectionId: string;
      sectionId: string;
      bookmarkId: string;
      commentary?: string | null;
    }
  | { type: 'setCommentary'; selectionId: string; commentary: string | null }
  | { type: 'removeSelection'; selectionId: string }
  | { type: 'setOrder'; sections: Array<{ sectionId: string; selectionIds: string[] }> };
type PublishIssue = { expectedRevision: number };
```

`setOrder` supplies the complete final permutation, moving selections between sections;
reject omissions, duplicates and foreign IDs. Apply operations sequentially to a
validated working copy, then write the final state in one batch. Section removal
requires it to be empty after preceding operations. No user-authored metadata, URL,
provider payload or content type is accepted by `addSelection`. Resolve bookmark to
canonical item under actor ownership and BOOKMARKED state.

Use `Idempotency-Key` on create, PATCH and publish; DELETE takes expected revision and
key as well. Successful bodies follow existing envelopes:
`{ issue, requestId, traceId }`, `{ publication, requestId, traceId }`,
`{ issues, nextCursor, requestId, traceId }`. Public issue is the approved inner DTO,
without private bookmark/item IDs. Subscription PUT upserts subscribed state; PATCH
sets `{ muted: boolean }`; DELETE ends the current subscription. Subscription writes
are independently idempotent and do not advance issue revision.

Error shape extends the established envelope with optional typed `details`:
`{ error, code, requestId, traceId, details? }`.

| HTTP    | Code                                  | Meaning/details                                                                   |
| ------- | ------------------------------------- | --------------------------------------------------------------------------------- |
| 400     | INVALID_INPUT                         | Field/operation paths; malformed order or invalid timezone                        |
| 401/403 | Existing auth codes                   | Clerk verification failure or unsupported PAT                                     |
| 404     | NOT_FOUND                             | Missing, foreign owner resource, draft on public route or unavailable destination |
| 409     | REVISION_CONFLICT                     | currentRevision; reload before resubmitting                                       |
| 409     | IDEMPOTENCY_CONFLICT                  | Key already used with different normalized request                                |
| 409     | WEEKLY_ISSUE_EXISTS                   | Owner-only existingIssueId                                                        |
| 409     | ISSUE_SELECTION_LOCKED                | Published weekly addition/replacement attempt                                     |
| 409     | DUPLICATE_SELECTION                   | Canonical item already visible in issue                                           |
| 409     | RESOURCE_CONFLICT                     | ID collision, nonempty section or self-subscription                               |
| 422     | INELIGIBLE_SELECTIONS                 | Owner-only selection/operation IDs and safe reason codes                          |
| 422     | ISSUE_NOT_READY                       | Missing title/selections or asset not ready                                       |
| 413/415 | PAYLOAD_TOO_LARGE / UNSUPPORTED_MEDIA | Upload/request limit failures                                                     |

Do not expose private titles, URLs, owner IDs or eligibility reasons in anonymous
errors. Owner failures use actionable enums rather than raw upstream responses.

## Ordering, retries and concurrency

Positions are contiguous integers rewritten from the bounded final permutation.
All issue changes advance revision once per successful PATCH, not once per operation.
A semantic no-op returns the current revision and creates no event. Publication
presentation has its own expected revision; changing its name cannot break links.

Avoid read/check/write races and unsupported interactive transactions. Validate a
working copy outside D1, then commit using one D1 batch whose first statement inserts
a unique mutation guard using SELECT only where owner, expected revision, lifecycle
and relevant source fingerprints still match. Every following issue/section/selection,
event and response write is conditional on that fresh guard ID. A stale guard inserts
nothing and no dependent statement can mutate. A duplicate key aborts the batch;
read its existing response and verify the request hash. D1 batch rollback on SQL
failure must be covered with a real local D1 test, not a mock only.

The eligibility fingerprint includes source/bookmark version and stored public-safety
evidence; source changes between validation and commit cause retry/revalidation.
Do not run network fetches inside the commit. Publish assigns firstPublishedRevision
and timestamp to its visible selections and emits one ISSUE_PUBLISHED event atomically.
Independent additions assign those fields at their new revision; only net new visible
selections in the final state enter SELECTIONS_ADDED. Add-and-remove within one PATCH
sends no addition. Corrections/removals can emit silent audit events. A mixed change
may produce multiple kinds at the same revision, with at most one event of each kind.

Idempotency lookup precedes stale-revision validation, so replay returns the original
response even after later edits. A fresh publish key against an already published
issue is a lifecycle conflict, never another publication. Persist successful replay
results for the resource lifetime, scrubbing them during account deletion. Dispatch
failure leaves committed issue/event/outbox intact. Delivery must deduplicate event
IDs independently, because outbox send is at least once.

## Public eligibility matrix

Eligibility is provenance plus URL safety, not HTTP success. Unknown evidence blocks
selection with a specific owner reason; it does not become publicly safe by default.
Use dedicated sanitized public snapshots, never raw item summaries/provider JSON.

| Source                                                  | Required evidence                                                                | Result                                                       |
| ------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Public WEB/RSS article                                  | Public-origin metadata, safe HTTP(S) destination, no credentials                 | Allow                                                        |
| YouTube public video / public X post                    | Public provider response/destination; private/deleted checks where available     | Allow                                                        |
| Public Spotify/podcast episode                          | Public episode identity; safe public player URL, not private feed/enclosure      | Allow                                                        |
| Paywalled article                                       | Public landing metadata and destination; no authenticated article body           | Allow landing metadata only                                  |
| Newsletter from Gmail                                   | Independently verified public web edition and metadata fetched from that edition | Allow that edition only                                      |
| Private email or newsletter without public edition      | None                                                                             | Reject PRIVATE_SOURCE                                        |
| Private podcast/feed or personalized URL                | Credentials, signed query/path or private provenance                             | Reject PRIVATE_DESTINATION                                   |
| Missing destination or unresolved provenance            | No safely attributable public destination                                        | Reject MISSING_DESTINATION / UNVERIFIED_PUBLIC_SOURCE        |
| Known unavailable original, previously safely published | Keep safe snapshot and unavailable indicator                                     | Retain existing selection; do not expose private replacement |

Strip tracking parameters only through known normalization rules; never strip tokens
and assume the resulting URL is public. Validate redirects and remote artwork using
network protections. Snapshot artwork must be approved safe public media or omitted.
Publication rechecks every selection; after publishing, newly discovered private data
must be suppressed rather than leak because a snapshot once existed. Ordinary dead
links retain their safe metadata and commentary, distinct from a privacy takedown.

## Dependency handoffs and acceptance evidence

- **Native:** deliver schemas plus JSON fixtures for empty draft, ordered issue,
  weekly issue, addition, conflicts and ineligible content. Native owns Swift structs,
  decoding tests and screens. Return bookmark eligibility reason to the owner editor.
- **Public sharing:** provide pure public projection function, stable IDs/URLs,
  anonymous draft/tombstone 404 fixtures, safe asset route and publication archive
  cursor rules. Public sharing owns HTML, universal-link domain and previews.
- **Wrapped:** accept resolved window ID/timezone/UTC boundaries and explicit saved
  selections in the shared create service. Validate closure and uniqueness; no public
  recap fields. Wrapped owns evidence/calendar calculation.
- **Delivery:** provide immutable event IDs/kinds, firstPublishedRevision, subscription
  generation/mute state and availability resolver. Delivery supplies visit/activity,
  digest/APNs and provenance modules; coordinate atomic save/reference retries.

Foundation tests must establish migration application/uniqueness, owner and anonymous
isolation, projection allowlists, provider matrix, complete ordering, weekly locks,
replay/hash mismatch, stale concurrent mutations, rollback after event insertion
failure, one durable publication event, addition/removal event classification, and
editor deletion preserving another reader's bookmark/reference. Publish validation
must be exercised after source eligibility changes, not only at initial selection.

This assignment inspected source and produced documentation only. No runtime,
Simulator, device, authentication, build or behavior verification is claimed.

## Exact next bounded implementation task

Implement the executable shared schema module and versioned JSON fixtures for
publication/owner issue/public issue, typed PATCH operations, errors and lifecycle
transitions; export them through the shared package and validate them in focused
Bun tests. Include privacy-negative fixtures and the provider eligibility matrix.
Foundation then allocates core migrations against the current migration journal.
Native/public/ Wrapped/delivery can consume fixtures immediately without waiting for
live storage. Gate later integration on the guarded D1 batch proof and deletion test.

No new product choice is required by this handoff. Cover infrastructure availability
and source evidence coverage are implementation dependencies, not authorization to
omit agreed first-release capabilities.
