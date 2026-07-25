# X Following Timeline Archive

## Scope

The X archive captures source-aware organic entries from the authenticated X Following timeline and configured X Lists. It retains posts, replies, repost presentations, quotes, ordering, authors, relationships, metrics, and media links. It excludes ads and does not download media.

Collection is intentionally separate from Zine Inbox, bookmarks, enrichment, and analysis.

## Components

- `.codex/skills/zine-x-timeline-collector`: Chrome or integrated Codex browser collection workflow.
- `apps/x-collector`: local receiver, validator, chunked uploader, and verification client.
- `apps/x-archive`: dedicated Cloudflare Worker providing ingestion and read APIs.
- `packages/x-archive-schema`: shared versioned capture contracts.
- Dedicated D1 databases: query index, run ordering, relationships, and idempotency.
- Dedicated R2 buckets: one canonical compressed JSON object per post and one pointer-only manifest per run.

## Identity and deduplication

Canonical post identity is `(Zine user ID, X tweet ID)`. Repeated collection updates `last_seen_at` and the single canonical payload; it does not create another post. Each run stores lightweight ordered pointers to canonical posts.

Permalink-expanded thread posts are associated with the frozen run in a separate immutable context table. They never receive a primary timeline position or count toward the requested source total. Each run also stores bounded context coverage, including attempted, completed, truncated, and failed expansion counts.

Reposts are modeled as run-item presentation metadata pointing to the original canonical tweet. Quote, reply, and repost relationships point to target tweet IDs instead of embedding duplicate post records.

## Authentication

Create a Zine API token in web Settings with:

- `Read X archive`
- `Collect X timeline`

Set it locally without committing it:

```bash
export ZINE_X_ARCHIVE_TOKEN="zine_pat_..."
```

The production archive API defaults to `https://x-archive-api.myzine.app`.

## Collection

Ask Codex to use the `zine-x-timeline-collector` skill, or start its receiver explicitly:

```bash
bun run x:archive:receive -- --count 500
```

That command is for Following. A Favorites list uses a rolling window instead of a post target:

```bash
bun run --cwd apps/x-collector receive \
  --source-type FAVORITES \
  --source-url https://x.com/i/lists/<id> \
  --window-hours 24 \
  --safety-limit 5000
```

The receiver listens only on `127.0.0.1`, accepts small browser-extracted batches, and exposes a checkpoint that lets browser control reconnect without changing the run or item positions. The collector performs bounded up/down recovery after transient X stalls before falling back to a partial run. On completion, the receiver uploads chunks of at most 25 primary timeline entries, finalizes the R2 run manifest, then reads the run back for verification.

For an existing capture JSON file:

```bash
bun run --cwd apps/x-collector validate --file capture.json
bun run --cwd apps/x-collector upload --file capture.json
```

Favorites-first Daily View collection uses two immutable runs: a rolling-24-hour `FAVORITES` run for the configured list and a separate 500-post `FOLLOWING` run for secondary context. The Favorites receiver also accepts list-member batches at `/source-members`, rolling-window evidence with each `/batch`, and per-thread coverage records at `/context-status`; completion stores an immutable roster snapshot linked directly to its run. Roster status is finalized independently, so a complete timeline cannot hide a partial member capture. A Favorites run is complete only after it records enough older non-repost entries to prove the time boundary, with no missing publication timestamps. Reposts are retained according to their verified list activity position because X exposes the original post timestamp rather than a reliable repost-event timestamp; the reposter remains explicit. The numeric guard is recorded separately and produces partial coverage if reached first. Run metadata records the exact source type, stable list ID, name, URL, collection policy, termination reason, window coverage, and context coverage. Never substitute For You for either source.

## API

All `/api/*` routes require a Zine PAT.

### Write scope

- `POST /api/v1/x-timeline/runs`
- `PUT /api/v1/x-timeline/runs/{runId}/chunks/{chunkIndex}`
- `POST /api/v1/x-timeline/runs/{runId}/complete`
- `PUT /api/v1/x-timeline/daily-sources/{sourceId}`

Chunk indexes are idempotent. Reusing an index with the same body succeeds; reusing it with different data returns `409`.

### Read scope

- `GET /api/v1/x-timeline/runs`
- `GET /api/v1/x-timeline/runs/{runId}`
- `GET /api/v1/x-timeline/runs/{runId}/export`
- `GET /api/v1/x-timeline/posts`
- `GET /api/v1/x-timeline/posts/{tweetId}`
- `GET /api/v1/x-timeline/daily-sources`

Post listing uses an opaque keyset cursor.

## Development and verification

```bash
bun run x:archive:test
bun run --cwd apps/x-archive typecheck
bun run --cwd apps/x-collector typecheck
bun run --cwd apps/x-archive build
```

Apply and deploy production resources:

```bash
bun run --cwd apps/x-archive db:migrate:production
bun run --cwd apps/x-archive deploy:production
```

The archive health endpoint is `GET /health`.
