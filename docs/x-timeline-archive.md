# X Following Timeline Archive

## Scope

The X archive captures a configurable number of organic entries from the authenticated X Following timeline. It retains posts, replies, repost presentations, quotes, ordering, authors, relationships, metrics, and media links. It excludes ads and does not download media.

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

The receiver listens only on `127.0.0.1`, accepts small browser-extracted batches, uploads chunks of at most 25 primary timeline entries, finalizes the R2 run manifest, then reads the run back for verification.

For an existing capture JSON file:

```bash
bun run --cwd apps/x-collector validate --file capture.json
bun run --cwd apps/x-collector upload --file capture.json
```

## API

All `/api/*` routes require a Zine PAT.

### Write scope

- `POST /api/v1/x-timeline/runs`
- `PUT /api/v1/x-timeline/runs/{runId}/chunks/{chunkIndex}`
- `POST /api/v1/x-timeline/runs/{runId}/complete`

Chunk indexes are idempotent. Reusing an index with the same body succeeds; reusing it with different data returns `409`.

### Read scope

- `GET /api/v1/x-timeline/runs`
- `GET /api/v1/x-timeline/runs/{runId}`
- `GET /api/v1/x-timeline/runs/{runId}/export`
- `GET /api/v1/x-timeline/posts`
- `GET /api/v1/x-timeline/posts/{tweetId}`

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
