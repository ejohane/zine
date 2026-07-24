# Native article reader beta (phase 3)

Phase 3 turns the article-body foundation into a user-facing native reading experience. The supported client is `apps/ios`; the deprecated Expo client is intentionally unchanged.

## Definition of done

- Article bookmarks expose a native **Read** action while every reader state retains **Open Original**.
- A readable current artifact or truthful degraded legacy fallback renders with native typography, light and dark appearance, Dynamic Type scaling, semantic article markup, responsive media, and external-link handoff.
- Active content cannot execute JavaScript, submit forms, embed frames, open network connections, or persist website data inside the reader.
- Reader demand can enroll one eligible canonical article through the authenticated REST API and observes loading, preparing, available, degraded, unavailable, retryable failure, and offline-cache states without inventing content.
- Scroll progress is restored and saved through the existing bookmark progress API. Opened and finished state continue to use the existing bookmark contracts.
- The protected cache is isolated by authenticated user, stores only readable responses, and retains at most 50 immutable article documents.
- Enrollment is staged independently from queue processing with `ARTICLE_BODY_ENROLLMENT_MODE=off|reader|saved|all`. Terminal failures at the current extractor version are not repeatedly enqueued by ordinary product triggers; repair jobs and extractor upgrades remain available.
- Bookmark and RSS enrollment are best effort and never make the primary save or ingestion operation fail.
- Article acquisition is intentionally serialized in one-message queue batches so a bounded cohort cannot create a burst of requests that trips publisher rate limits.
- `/health/queues` reports safe aggregate enrollment outcomes, source mix, latency, failure codes, pending age, and DLQ count without exposing item or user identifiers.
- The production rollout passes the reader-demand, saved-item, and new-RSS-entry stages; the reviewed production cohort meets the extraction quality gate; the native app is built, installed, launched, and manually checked on a physical iPhone.
- The merged `main` Worker deployment is verified by release SHA and production health/API readback.

## REST contract

`GET /api/v1/bookmarks/:id/article-content` remains a read-only status and content lookup. It does not enroll work.

`POST /api/v1/bookmarks/:id/article-content` is the reader-demand request. It verifies that the user owns the bookmark and that the canonical item is an article, attempts idempotent enrollment when reader enrollment is enabled, and returns the same content/status envelope plus a `request` result. A newly queued or already-active request returns `202`; current, terminal, disabled, or otherwise non-queued results return `200`. Non-article items return `422`.

The iOS client performs GET first, POSTs only when no readable body exists, and polls the GET endpoint for at most 45 seconds. A terminal acquisition result becomes an explicit unavailable state. A polling timeout or transport failure is retryable and never substitutes partial page text.

## Enrollment ladder

Queue processing and enrollment use separate controls:

1. `ARTICLE_BODY_PIPELINE_ENABLED=true`, `ARTICLE_BODY_ENROLLMENT_MODE=reader`: only explicit native reader demand enrolls.
2. `ARTICLE_BODY_ENROLLMENT_MODE=saved`: reader demand plus newly saved article bookmarks enroll.
3. `ARTICLE_BODY_ENROLLMENT_MODE=all`: reader demand, new saved articles, and newly ingested RSS articles enroll. Full RSS/Atom content is carried as a source-first candidate when available.

Changing the enrollment mode to `off` stops new automatic work without hiding already published artifacts. Setting `ARTICLE_BODY_PIPELINE_ENABLED=false` is the stronger queue-processing kill switch. Neither rollback deletes artifacts or lifecycle history.

## Production verification

At every stage:

1. Confirm the deployed Worker release matches the intended commit.
2. Read `/health/queues` before and after the action. Pending work must drain; DLQ must not unexpectedly increase; trigger/source aggregates must match the action.
3. Inspect the authenticated API response and the immutable R2 artifact rather than inferring success from queue submission.
4. Read the beginning, middle, and end of every pilot artifact. Reject topic mismatch, truncation, navigation boilerplate, duplicated blocks, missing conclusions, or active markup.
5. Verify the corresponding native state, original-source escape hatch, progress restoration, completion toggle, and cached reopen behavior.

Advance from `reader` to `saved`, and from `saved` to `all`, only after the preceding stage is terminal and correct. Return enrollment to `off` if pending age grows unexpectedly, the DLQ changes, acquisition quality misses the gate, primary save/ingestion regresses, or the client presents a misleading state.

## Local verification

- Run the worker article-body, RSS, REST, diagnostics, and OpenAPI tests.
- Apply migrations to an isolated local D1 database and confirm the new nullable diagnostic columns preserve existing lifecycle rows.
- Run native unit tests and build the `ZineNative` scheme.
- Launch the deterministic reader and unavailable fixtures in light and dark appearance, inspect screenshots, and run the full native test target.
- Complete the repository format, design-system, lint, typecheck, test, and build gates before publishing the change.
