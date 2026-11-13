# Building an experience on the API

Use <https://api-next.myzine.app/docs> for exact request/response schemas. Every
personal-data request needs `Authorization: Bearer …`. Store a personal API token
in your server or approved secret configuration. The examples below use placeholder
IDs; no credential values belong in source files or chat. MCP at `/mcp` uses the
same bearer authorization and REST behavior.

## Capture first, enrich asynchronously

`POST /v1/saves` accepts a URL, optional context, tags and collection IDs:

```json
{
  "url": "https://example.com/article",
  "context": { "text": "Useful for the project", "origin": "explicit" },
  "tags": ["research"]
}
```

Send an `Idempotency-Key` and reuse it for network retries. A successful response
means the reference and supplied context are durable. It does not promise that a
platform is accessible or that transcript extraction, AI or indexing has finished.
Use `GET /v1/items/{itemId}`, its enrichment components, and
`GET /v1/items/{itemId}/jobs` to observe those independent outcomes.

A deliberate later save uses a new key and can add context. Replaying a key does
not append context. Reusing a key with a changed body returns 409. After deletion,
an old save receipt returns 410; an intentional new save starts fresh personal
state. Archive, completion and position are independent fields.

## Read and retrieve

`GET /v1/items` defaults to saved items, including archived items. Select
`status=received` for triage or `status=dismissed` explicitly. Browse filters use
singular query names such as `platform`, `tag`, `sourceId`, `subscriptionId` and
`collectionId`; comma-separated values select multiple values. Follow `nextCursor`
with the same filters. Do not decode or repurpose cursors.

Search uses `POST /v1/items/search`:

```json
{
  "query": "How organizations assign accountability when adopting AI",
  "match": "hybrid",
  "filters": { "types": ["podcast_episode"] },
  "limit": 20
}
```

Modes are `keyword`, `semantic` and `hybrid`. Match evidence can include a source
contribution ID, excerpt, timestamp or text anchor. Indexing is eventually
consistent; inspect pending counts rather than treating an empty semantic result
as proof that a durable save is missing. There is no silent semantic-to-keyword
fallback on service failure.

Large retained material is opt-in: `GET /v1/items/{itemId}/transcript`, `/article`
or `/thread`, or the corresponding `include` options on item retrieval. Inspect
provenance and coverage: a metadata-only summary does not establish what a video
or podcast actually discusses.

## Subscribe without importing history

1. `POST /v1/sources/resolve` with `{ "url": "https://publisher.example/feed" }`.
2. Choose one of the returned routes.
3. `POST /v1/subscriptions` with the returned `sourceId`, `routeId`, `autoSave`
   and optional `filters.types`.
4. Read subscription status and the returned job. Initialization is asynchronous.
5. Browse items by `subscriptionId` and lifecycle state.

`autoSave: false` delivers undecided items as received; `true` saves new arrivals.
Initial intake includes the latest matching item preceding subscription creation,
plus all matching arrivals since creation, even when the first poll was delayed.
It does not import a source's entire history. Repeated polling is deduplicated.
Existing received/saved/dismissed/deleted decisions survive automatic arrivals,
including a mode change. Unsubscribing preserves existing items.

Explicit sync and retry operations return jobs. Provider cooldowns still apply:
a pending job with a future `availableAt` is not evidence of lost work. Resumable
source snapshots and queue recovery continue in the background.

## Organize and contribute

Items can belong to multiple flat, ordered collections. Collection notes/synthesis
can reference owned items. Removing a collection preserves those items. Position
and completion use `PATCH /v1/items/{itemId}/progress`; for example,
`{ "position": 320, "unit": "seconds", "completed": false }`.

Agents can add enrichment through `POST /v1/items/{itemId}/enrichment`. Supply a
field, validated value, category and provenance. Source contributions, generated
understanding and personal corrections are distinct; a correction takes explicit
precedence for its owner. Input contribution references must be accessible to that
owner. Retained material and derived output remain private.

Saving a platform playlist, album or show saves that reference. It neither saves
all its members nor creates a subscription. `GET /v1/items/{itemId}/members` pages
available members; capture selected member URLs or subscribe explicitly.

## Credentials and portability

Interactive Clerk authentication can issue/revoke API tokens and manage Google
grants. API tokens and MCP cannot create more credentials, manage provider grants
or erase the account. Google grant import verifies the grant before retaining an
independently encrypted, owner-bound envelope. Public YouTube extraction and the
authorized Data API path have different access requirements; consult
[provider coverage](providers.md) and [live evidence](verification.md).

Account export provides a manifest and paginated sections, including retained
material and excluding credentials. Its consistency is explicitly live. Account
erasure immediately removes authoritative personal data and revokes credentials;
large artifact/vector cleanup is asynchronous. It requires interactive sign-in.

## Identity and relationships

Use `GET /v1/items/{itemId}/identity` to inspect the canonical personal ID and its
aliases. Old IDs continue resolving after verified reconciliation. Responses expose
`Content-Location` and `X-Zine-Canonical-Item` when a path is redirected internally.
`POST /v1/items/{itemId}/reconcile` verifies source redirects or authoritative
platform identifiers; a caller-supplied target is an assertion to check, not proof.
`GET /v1/items/{itemId}/reconciliations` returns private merge receipts, including
conflicting lifecycle, collection-position and progress observations.

Use `POST /v1/items/{itemId}/relationships` with `kind` and either `targetItemId`
or `targetUrl` to connect separate editions or related material. URL targets do
not save an item. List incoming/outgoing edges using `direction=incoming|outgoing|both`.
Relationships and their provenance remain private. Identity reconciliation needs
strong evidence; titles and arbitrary canonical tags never establish identity.

Large retained uploads register their keys before writing to R2. Deleting an item
removes access and queues physical cleanup; cleanup has a one-hour settling period
and rechecks live references to protect successful commits with lost responses.

## Account erasure and in-flight work

An authenticated operation carries the account generation observed at authentication.
Data-creating commits check that generation in the same database transaction as
its writes. Erasure advances the generation. A connection exchange, source discovery,
capture or cache write begun before erasure cannot repopulate the account afterward;
it returns `409 account_data_erased`. Start a fresh request for intentional new work.
Internal alias and MCP dispatch preserve the original operation generation.

Google refresh also checks the encrypted grant it originally read. A stale refresh
response cannot overwrite or expire a different connection installed while that
refresh was pending. Disconnect removes only this service's local connection.

## Personal Home

`GET /v1/home` returns one ordered list of sections. Jump back in and Just
saved are computed from the current library. Editorial sections contain a
title and ordered cards. Completion, archive, deletion, ownership, and format
eligibility are checked during every read. Live sections win duplicate cards.
A collection is omitted when fewer than two eligible cards survive.

`POST /v1/home/preview` renders an unpublished draft through the same
assembler. Both read operations require `library:read` for personal tokens.
An authorized editorial caller can use `PUT /v1/home/edition` with
`library:write`, supplying `expectedEditionId` from its Home read (or null
before the first edition) and the `draft` returned by the preview tool.
Publication uses a conditional atomic write; a 409 means to rebuild using
current state. Preview and model failures leave the published edition intact.

From `apps/api`, the `scripts/home-preview.ts` command supports three modes:

- `candidates` checks recent saves and hybrid search and prints only counts.
  It works against the existing Next deployment with the approved Clerk login.
- `draft` makes one OpenAI Responses call and prints the validated draft and
  token usage. It requires an allowlisted `OPENAI_API_KEY` for a Zine project
  under the linked API organization. The request sends bounded titles,
  summaries, and card metadata. It sets `store: false`.
- `preview` runs the same generation and adds the assembled Home response.
  Use an API environment with the preview route deployed. The command does
  not publish or print credentials. Treat draft and preview output as private.

The model defaults to `gpt-6.1-sol` and can be overridden with
`ZINE_HOME_MODEL`. Set `ZINE_HOME_IMPORT_THROUGH` to the end of a known bulk
import when those timestamps should be treated as unknown recency. This setting
does not rewrite saves or change the live Just saved order. Set
`ZINE_HOME_COMPARE_MODEL=gpt-6.1-terra` to compare both models on the same
shortlist before enabling a daily trigger.
