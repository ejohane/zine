# Article-body foundation (phase 1)

Phase 1 makes article-body availability a durable, observable backend primitive without changing acquisition behavior. Phase 2 installed and validated the processor and bounded cohort controls. Phase 3's native reader and staged enrollment contract are documented in [Native article reader beta](./article-reader-beta.md).

The extraction and review implementation that builds on this contract is documented in [Article-body extraction quality](./article-body-extraction.md).

## Definition of done

- D1 owns explicit per-item lifecycle state: pending, processing, available, degraded, or unavailable.
- Every successful body is an immutable, schema-versioned, extractor-versioned, content-addressed R2 artifact.
- D1 points to the current artifact and retains version metadata, quality signals, retry state, and error codes.
- Queue retries are bounded and exhausted jobs leave a durable D1 DLQ audit event.
- `/api/v1/bookmarks/:id/article-content` remains compatible with legacy HTML and exposes truthful availability, provenance, quality, and failure metadata.
- `/health/queues` reports safe aggregate article-body state and DLQ counts without item or user identifiers.
- The queue and DLQ are configured in development, staging, and production, while `ARTICLE_BODY_PIPELINE_ENABLED` remains `false` in all three.
- Phase 1 shipped without ingestion, bookmark, reader-open, or backfill enrollment; phase 2b adds only the protected bounded backfill described below.

## Storage contract

Artifacts use `articles/v2/<encoded item id>/<sha256>.json`. The hash covers normalized content and provenance, but not extraction time, so replaying the same extraction is idempotent. Existing objects are read and integrity-checked rather than overwritten.

R2 is written before D1 metadata. If D1 publication fails, the result is an unreferenced immutable object rather than a database pointer to missing bytes. A later repair job can safely publish or clean up that object.

## Lifecycle contract

`article_body_states` contains one mutable row per canonical item. `article_body_versions` is append-only in normal operation. A state may report available or degraded to clients only when it resolves to a current version and R2 key; otherwise the API reports unavailable and adds `MISSING_CURRENT_VERSION`. A failed refresh does not hide the last good version: it remains readable as degraded with `LATEST_ACQUISITION_FAILED_USING_CURRENT_VERSION`.

Legacy `items.article_content_key` content remains readable. It is labeled `LEGACY` and `LEGACY_UNNORMALIZED` rather than being presented as equivalent to a verified versioned artifact. If a current version points to a missing R2 object but legacy HTML exists, the API serves the fallback as degraded and reports `CURRENT_ARTIFACT_MISSING_FALLBACK_LEGACY`.

## Queue contract

Messages carry an item ID, target extractor version, trigger, enqueue time, optional trace ID, and up to two source-first embedded candidates. Candidate JSON is capped at 80 KiB so the full job remains comfortably below the Cloudflare Queue message limit; an oversized candidate is omitted and public-page acquisition remains available. Invalid poison messages are acknowledged. Transient network, rate-limit, and server failures retry with bounded exponential delay; terminal extraction failures are acknowledged with an explicit unavailable reason. Exhausted messages are recorded in `article_body_dlq_events` and the item becomes unavailable with `QUEUE_RETRIES_EXHAUSTED`.

The real processor loads canonical item metadata, runs the source-first/public fallback acquisition cascade, publishes immutable artifacts, and mirrors exact reading metrics onto the item. The dry-run-first `/admin/article-bodies/backfill` endpoint selects only canonical article items already accepted into at least one user's Zine. It never inserts `items` or `user_items`, so bounded cohorts cannot create historical inbox content or bypass latest-only source seeding.

## Phase 2b activation checklist

1. Keep `ARTICLE_BODY_PIPELINE_ENABLED=false` while deploying the code, queue configuration, and migration.
2. Configure `ARTICLE_BODY_BACKFILL_SECRET` and call `POST /admin/article-bodies/backfill` with `{ "dryRun": true, "limit": 10 }`; manually inspect the returned canonical-item cohort.
3. Confirm `/health/queues` is healthy and article-body pending, processing, unavailable, and DLQ counts are at their expected baseline.
4. Enable `ARTICLE_BODY_PIPELINE_ENABLED` only for the environment being piloted. Automatic ingestion enrollment is not installed, so this switch alone does not create a broad cohort.
5. Execute exactly one reviewed page with `{ "dryRun": false, "limit": 10 }`. Repeating the request is safe: pending/processing jobs and current extractor versions are skipped.
6. Wait for terminal states, manually read beginning/middle/end from every produced artifact, and inspect degraded/unavailable reasons and DLQ counts.
7. Disable the flag if the cohort misses the quality gate. Do not add automatic feed or bookmark enrollment until the staged cohort passes.

## Manual verification checklist

1. Apply migration `0024_add_article_body_foundation.sql` to an isolated local D1 database.
2. Verify foreign keys, unique indexes, item-delete cascade, and DLQ item `SET NULL` behavior.
3. Run the article-body artifact, storage, service, consumer, diagnostics, API, and OpenAPI tests.
4. Confirm the feature flag is false and both queue consumers are configured in all environments.
5. Verify the admin cohort is the only production enrollment caller; automatic ingestion, bookmark, and reader-open enrollment should remain absent.
