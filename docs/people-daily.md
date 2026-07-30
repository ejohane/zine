# People Daily

People Daily is Zine's canonical native Today product. It is a finite, precomputed edition of real X conversations: Favorites establish the agenda, Following can add nearby context, and every section resolves to exact posts and thread structure.

## Daily lifecycle

One stable logical build ID moves through these durable states:

1. `COLLECTING` — registered before browser collection starts.
2. `BUILDING` — exact frozen Favorites and Following run IDs have been supplied; thread units, topic candidates, embeddings, and overview copy are built.
3. `VALIDATING` — every section, thread, and post reference is checked.
4. `PUBLISHED` — the immutable R2 artifact exists, its D1 edition index exists, and the active pointer is updated in the same D1 batch.
5. `FAILED` — the sanitized failing stage is retained. The previously active edition is not changed.

Retries use the same build ID. Reusing it with changed inputs is rejected. Publishing an already-published build returns the retained edition without rerunning generation.

## Inputs and editorial boundary

- Favorites is the configured X list captured over the rolling previous 24 hours. `5000` is a safety guard, not a target.
- Following is the latest 500 unique organic entries.
- For You is never accepted.
- Exact conversation IDs, reply parents, quotes, reposts, links, authors, media metadata, source positions, membership, collection policy, and partial-coverage warnings come from the frozen archive runs.
- Deterministic topic membership is fixed before copy generation. Workers AI may write a short section title and description from the supplied posts; it cannot add, remove, or move a conversation.
- Topic membership is exclusive across the edition. The strongest eligible section claims a conversation once; lower-ranked sections can use only unassigned conversations, and publication rejects any repeated thread or post.
- X posts show what people are discussing. Generated copy must not present post claims as verified facts.

## Storage

- `people_daily_builds` retains the resumable generation lifecycle and stage timings.
- `people_daily_editions` indexes immutable editions, exact run IDs, membership snapshot, versions, coverage, counts, hashes, and R2 keys.
- `people_daily_active_editions` is the single user-scoped active pointer.
- Full content-addressed artifacts live under `people-daily/users/<user>/<date>/r<revision>/<sha256>/edition.json` in the existing R2 binding.

An upload may leave an unreferenced R2 object if the later D1 transaction fails; it can never replace Today without a valid edition row and active pointer. Account deletion removes both the metadata and the user-scoped R2 prefix.

## API

- `GET /api/v1/today` returns only edition metadata, coverage, sources, overview sections, facepile authors, and counts. It performs no AI, embedding, clustering, or archive scan and supports `ETag`/`304`.
- `GET /api/v1/today/sections/:sectionId` lazily reads the active immutable artifact and returns only the referenced thread units and posts. `more` is the reserved standalone-conversation section.
- `GET /api/v1/today/authors/:authorKey` preserves the existing today/week author activity read model.
- `POST /api/v1/today/builds` registers a stable morning build.
- `POST /api/v1/today/builds/:buildId/publish` builds, validates, uploads, and atomically publishes from explicit archive run IDs.
- `POST /api/v1/today/builds/:buildId/failure` retains a collection or readback failure.
- `GET /api/v1/today/builds/:buildId` returns durable status and timings.
- `GET /api/v1/today/editions` lists retained immutable history and the active pointer.
- `POST /api/v1/today/editions/:editionId/activate` validates and reactivates an existing artifact for rollback without recollection.

The former `/api/v1/editorial/today` and `/api/v1/today/feed` routes remain available for one release as rollback surfaces. The native app does not use them.

## Morning automation

The single 5:00 AM America/Chicago task must:

1. Fetch and verify current `origin/main` from a fresh worktree.
2. Choose one stable build ID and register it before collection.
3. Collect and verify Favorites rolling 24 hours, membership, and exact context.
4. Collect and verify Following 500 after explicitly selecting Following and rejecting For You.
5. Publish using the two verified run IDs.
6. Read back build state, `/api/v1/today`, one section, today author activity, and week author activity.
7. Decode the exact production overview and section JSON through the shipped Swift models.
8. Report collection, generation, validation, upload, publication, readback, and decode states separately.

Favorites is the edition's agenda and must finish with verified rolling-window boundary evidence. A missing, unverified, or incomplete Favorites run records the matching failure stage and does not publish. Following is secondary context: after all bounded recovery is exhausted, a receiver-verified `PARTIAL` Following run may still publish when its source is verified and its structure coverage is exact. The resulting edition must remain visibly `PARTIAL` and retain the requested/collected counts, termination reason, and failure warning. Authentication failures, source ambiguity, For You contamination, unverified uploads, or partial thread structure still prevent publication. If publication succeeds but readback fails, the task records/reports the readback failure without misrepresenting the already-published edition.

## Native behavior

The Today tab renders the last saved overview immediately, then refreshes in the background. It replaces the cache only after complete decoding. Opening a section makes the lazy detail request; the overview never downloads the full post corpus. Exact inline threads and author activity retain the existing native presentation.

## Rollback

Application rollback is a deployment of the prior Worker/native release. Data rollback calls the edition activation endpoint for an already-valid immutable edition; it never requires recollection. The old editorial artifact store and API are retained during the initial People Daily release.
