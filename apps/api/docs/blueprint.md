# Product contract and implementation blueprint

Status: implementation in progress. This document records agreed behavior and
implementation decisions; it is not verification evidence.

## Boundary

Complete independent rewrite in `apps/api`, deployed entirely on new Cloudflare
resources. No existing application code, schema, resource bindings, or backwards
compatibility. Reuse credentials/account access only. Existing Zine stays running.
An isolated import of the user's existing data is required for verification.
Mobile work is explicitly outside scope. A web authentication/inspection surface
may be built when needed.

## Product invariants

1. Save succeeds only after reference and supplied personal context are durable.
   Provider fetches, AI, indexes and queue delivery cannot gate that success.
2. Capture one-off references and subscribe to sources. Content stays on source
   platforms; rich metadata includes text, threads and transcripts. Articles may
   retain readable copies. No source-edit monitoring or revision history.
3. Content identity differs from the personal item. Strong identifiers merge
   duplicates; similar titles do not. Separate platform editions remain related.
   Existing IDs must remain resolvable after identity reconciliation.
4. Metadata access differs from identity. Public source information may be reused;
   private source material and contributed enrichment retain access boundaries.
   Derived information inherits all input restrictions. Personal context is private.
5. Received/saved/dismissed are lifecycle states. Deletion removes personal data
   and leaves minimal suppression. Explicit saving reactivates archive/dismissal;
   after deletion it creates fresh personal data. Automatic ingestion never changes
   an existing decision, including received. Archive and completion are independent.
6. Context accumulates on explicit repeated saves. Idempotent retries do not append
   context again. Track authenticated contributor, provenance and capture time.
7. Subscriptions support source/format filters, review-first/automatic-save. Initial
   intake is latest matching item plus future items. Setting changes affect future
   intake only; unsubscribe preserves existing items. Historical imports and topic
   filters are deferred.
8. One library with optional tags and flat ordered many-to-many personal collections.
   Collections have description/notes/synthesis with supporting references. Deleting
   a collection preserves items; archive preserves membership. Saving a platform
   collection does not save members or subscribe to future additions.
9. Track position separately from completion. Reset/mark completion explicitly;
   opening never implies completion or archive. Annotations support whole-item notes,
   text anchors and timestamps; they are editable/deletable.
10. Search known identity, browse/filter and keyword/semantic/hybrid search combine.
    Default retrieval includes all saved items including archived. Deleted excluded;
    received/dismissed require explicit selection. Search provides match evidence.
11. Contributions include source data, generated understanding, and corrections,
    preserving contributor/source. Own contributions are correctable. Conflicts
    do not use silent last-write-wins. Personal corrections take explicit priority
    for that user; they cannot mutate global source facts.
12. Capture necessary thread/quote context without creating personal items for it.
    Broader comments/replies are optional.

## Technical decisions

- TypeScript Worker, Hono routing, Zod validation, JSON REST under `/v1`, OpenAPI.
  Maintained third-party libraries are allowed; no legacy Zine implementation reuse.
- D1 is authoritative for identities, personal state, provenance, permissions and
  transactional job outbox. SQL is explicit and bound; batches are atomic.
- R2 holds large information artifacts, accessed only through authorized API reads.
  Source public/private boundaries are represented on every enrichment contribution.
- Vectorize is a derived index. SQL access checks and filters apply to results;
  vector index metadata alone never authorizes disclosure. Private material must not
  be indexed into a public partition. Keyword evidence must respect the same ACLs.
- Queue delivery is at-least-once. Durable jobs use leases, bounded retry/backoff,
  error classification and recovery; cron recovers unsent jobs and expired leases.
- Idempotency keys are user/operation scoped and payload-bound. A save and its
  occurrence/context/outbox entries commit atomically. Same key, different request
  is a conflict. Concurrent retries produce one effect.
- Auth uses verified issuer, expiry and audience/authorized-party constraints.
  Public health/docs are separate from authenticated personal data. No manual auth
  bypass. Server-side outbound fetches validate protocols/addresses and redirects,
  cap body sizes, time out, and do not forward user credentials to arbitrary hosts.
- Independent deployment, migration and verification scripts own only rewrite
  resources. Logs include request/job IDs and sanitized error codes, not secrets
  or private content.

## API surface to deliver

| Area          | Operations                                                         |
| ------------- | ------------------------------------------------------------------ |
| Saves         | POST /v1/saves with Idempotency-Key                                |
| Items         | GET /v1/items, GET/PATCH/DELETE /v1/items/:id                      |
| Search        | POST /v1/items/search with filters, mode, evidence and cursor      |
| Material      | GET /v1/items/:id/transcript, /article, /thread; optional includes |
| Context       | GET/POST /v1/items/:id/context; PATCH/DELETE individual entries    |
| Progress      | PATCH /v1/items/:id/progress                                       |
| Annotations   | List/create/update/delete per item                                 |
| Collections   | CRUD, ordered membership, notes/synthesis and item references      |
| Sources       | Resolve/list/get sources and discover delivery routes              |
| Subscriptions | CRUD, sync requests, status and ingestion occurrences              |
| Enrichment    | List/contribute/correct, request retry, per-component availability |
| Jobs          | Owner-scoped status and failure/retry visibility                   |
| Access        | Real authentication, revocation behavior, owner isolation          |
| Portability   | Owner-scoped export and account data deletion                      |
| Adapters      | API CLI and MCP tools over the same HTTP contract                  |

## Delivery and completion evidence

Build complete vertical journeys, retaining a requirement-to-evidence ledger.
Stages are build order, not reduced final scope:

1. Contract, migrations, auth, durable save/retrieve/lifecycle and isolation.
2. Personal state, collections, contributions and keyword search.
3. Six-provider extraction/subscriptions, operational jobs and recovery.
4. Semantic/hybrid search, API docs, CLI/MCP and authentication web surface.
5. Fresh remote resources/deployment, isolated real-library import and manual
   authenticated HTTP journeys for every provider and capability.
6. Audit every invariant and provider row against current evidence. Completion
   requires deployed real integration proof, manual artifacts and passing gates.

Never treat mocked providers, static screenshots, successful build/deploy or a
health check as proof of authenticated end-to-end behavior. Evidence must disclose
fixture/live, local/remote, imported/native and observed/automated boundaries.
