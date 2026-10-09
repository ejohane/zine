# Auto-tagging tracer bullet

A bookmark is classified in the existing background enrichment queue against a
starting catalog plus that user's manually created tags. Generated suggestions
remain separate from assigned tags. Saving never waits for classification.
Library filtering and additional transcript acquisition are outside this iteration.

## Product scope

The user explicitly removed the precision/recovery shipping gate and additional
case-review loop. The 40 reviewed cases and saved evaluation remain research
artifacts; they do not block this functional slice. Transcript context is future work.
The catalog grows when users create tags, without training the model or sharing
private tag names with other users.

## Implementation

- Starting catalog v3 contains 283 topics. Versions 1 and 2 remain available.
- Jev `jev-1.13.0`, policy 2, threshold 0.8; zero or multiple suggestions, no output cap.
- Existing enrichment messages classify current title, description, creator,
  publisher, content type, and up to 24,000 characters of existing article text.
- Fingerprints bind input, catalog, policy, model, and threshold. Completed repeats
  skip the API; failed attempts retry through the existing queue.
- Tokens fence stale in-flight results. An atomic D1 batch replaces only pending
  suggestions and preserves all accepted/dismissed decisions.
- Acceptance atomically merges an assigned tag and records the decision. Repeated
  acceptance cannot duplicate tags. Dismissal does not remove assigned tags.
- User-owned tag records extend only their own catalog. Matching ignores case and
  whitespace through the existing shared tag normalization.
- Authenticated REST lists suggestions and records decisions with ownership checks.
- Native bookmark detail's Tags sheet separates suggestions from manual tags.
  Add/Dismiss commit immediately; manual tag edits retain the existing Save flow.
  Suggestion decisions require connectivity and surface recoverable errors.

## Configuration and local loop

Apply migration 0034 before running the updated backend. Production generation
is opt-in: `AUTO_TAGGING_ENABLED=true` and a Worker secret `TYPESAFE_API_KEY`.
A disabled flag performs no classification. Existing suggestions can still be
reviewed when generation is disabled. No production deployment is included here.

Use the approved secret profile to start the normal local stack:

```sh
AUTO_TAGGING_ENABLED=true ZINE_DEV_HOST=localhost secretsctl run zine.classifier -- bun run dev:worktree
```

The Worker development wrapper supplies the key through Wrangler's in-memory
API, without writing .dev.vars or putting the key in command arguments. Turbo
passes this secret only to the Worker task. Default development without that key
uses the existing Wrangler CLI. Use real Clerk login and the sanitized snapshot.
Existing saved items receive suggestions when enrichment next runs; this change
does not backfill the entire library or immediately reclassify every bookmark
when a new manual tag is created.

## Verification

Run focused Worker tagging and REST tests, classifier tests, native core tests,
and CLI scenarios. Then verify authenticated local save/enrichment, suggestion
acceptance, dismissal, refresh and relaunch through direct Simulator interaction.
Report automated, build/install/launch, and observed UI evidence separately.

## Verified locally on 2026-10-08

- All 101 Worker test files passed individually with isolated runtimes. Focused
  tagging and REST tests were repeated after the final race fix (86 tests pass).
- Thirty classifier tests, classifier typecheck, repository lint/typecheck,
  formatting, design-system checks, build, and web tests passed.
- Native headless tests passed (22 XCTest cases and three Swift Testing cases),
  including suggestion GET/decision POST behavior. All six native CLI scenarios passed.
- The canonical native app built, installed, and launched on the dedicated
  `iPhone 17 — Zine Tags` Simulator. Both installed API URLs were confirmed as
  `http://localhost:8711`. Real Clerk sign-in loaded the sanitized account.
- Direct Simulator interaction saved an Inbox article, received live Jev
  suggestions, accepted AI, dismissed AI safety, and created a manual tag.
  A repeat save generated a new catalog/input fingerprint while preserving
  accepted/dismissed decisions and assigned tags. Reopening after relaunch
  retained those states. Library, detail, and article content were observed.
- Both light and dark suggestion sheets were observed. Stopping the local API
  produced a recoverable error without removing the pending suggestion;
  restarting the backend and repeating Add succeeded.
- Injected key was absent from scanned runtime artifacts and recent logs.
  Local verification services were stopped afterward.

Private evidence is in `.local-data/tag-classifier/functional-*` and
`suggestions-light.png` / `suggestions-dark.png`. No production deployment,
merge, or physical-device installation is claimed. Existing bookmarks are not
backfilled automatically. Transcripts remain future work.
