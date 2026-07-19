# Daily Editorial Pipeline

## Scope

The daily editorial pipeline turns the user's X Following archive, Zine inbox, and Zine bookmarks into a grounded, versioned morning edition for the native iOS Today experience. X supplies the daily agenda; Zine history adds personal context when saved, unfinished, or previously read material genuinely matches the conversation.

The canonical output is validated JSON. Markdown is a deterministic review rendering. Snapshots, ranked candidate artifacts, validation reports, JSON editions, and Markdown editions are retained in Cloudflare R2 and indexed in D1.

## Components

- `packages/editorial-schema`: versioned snapshot, candidate, edition, feedback, publication, and validation contracts.
- `apps/editorial`: local Bun CLI for snapshot creation, deterministic candidate ranking, validation, rendering, and upload.
- `apps/worker`: authenticated edition persistence, native Today read model, and editorial-feedback API.
- `apps/ios`: supported SwiftUI Today experience with cache-first issue loading and explicit preference feedback.
- `.codex/skills/zine-daily-editorial`: Codex editor and critic workflow.

## Editorial window

The primary window begins at the `through` timestamp of the previous successfully published edition. When no prior edition exists, it falls back to 24 hours. The previous seven days provide comparison context.

- X entries come from archive runs completed since the primary cutoff. If none exist, the latest usable run is retained only as explicitly partial fallback coverage; when no complete or partial run exists, X coverage is unavailable.
- Inbox entries are selected by `ingestedAt`.
- Recent bookmarks are selected by `bookmarkedAt`.
- Up to 200 older bookmarks are retained as bounded taste context, including finished/read material; unfinished items from the comparison window are prioritized, then the most recently opened or saved history.
- Canonical source IDs deduplicate content that appears in both Inbox and Bookmarks.

## Commands

All commands require `ZINE_ACCESS_TOKEN`. The snapshot command uses `ZINE_X_ARCHIVE_TOKEN` when present and otherwise reuses `ZINE_ACCESS_TOKEN`.

```bash
mkdir -p .local-data/editorial/2026-07-11

bun run editorial:run:start -- \
  --run-id <stable-run-id> \
  --date 2026-07-11 \
  --workflow-version x-led-v1 \
  --prompt-version daily-editorial-v1 \
  --model <model>

bun run editorial:snapshot -- \
  --date 2026-07-11 \
  --output .local-data/editorial/2026-07-11/snapshot.json

bun run editorial:rank -- \
  --file .local-data/editorial/2026-07-11/snapshot.json \
  --output .local-data/editorial/2026-07-11/candidates.json

# If research changes snapshot.json or its provenance, rerun this rank command
# before validation and publication.

bun run editorial:validate -- \
  --file .local-data/editorial/2026-07-11/draft.json \
  --output .local-data/editorial/2026-07-11/edition.json \
  --report .local-data/editorial/2026-07-11/validation.json

bun run editorial:render -- \
  --file .local-data/editorial/2026-07-11/edition.json \
  --output .local-data/editorial/2026-07-11/edition.md

bun run editorial:publish -- \
  --edition .local-data/editorial/2026-07-11/edition.json \
  --snapshot .local-data/editorial/2026-07-11/snapshot.json \
  --candidates .local-data/editorial/2026-07-11/candidates.json \
  --validation .local-data/editorial/2026-07-11/validation.json \
  --markdown .local-data/editorial/2026-07-11/edition.md
```

The run ID is an idempotency key for one generation attempt and must match `edition.generation.generatorRunId`. Reuse it when retrying a command. On any pre-publication failure, record the exact failed stage:

```bash
bun run editorial:run:fail -- \
  --run-id <stable-run-id> \
  --stage VALIDATE \
  --message "Edition did not meet the grounding threshold."
```

Run start, failure, and publication form one server-owned lifecycle: `PREPARING` → `FAILED` or `PUBLISHED`. An identical retry is idempotent; conflicting reuse is rejected. Successful recovery may promote a failed run to published. Do not mark a run failed after publication merely because readback verification failed.

## X-led candidate model

`editorial:rank` groups repeated reactions to the same captured link or topic into one candidate. Each candidate retains its X sources, representative independent voices, canonical links, matching Zine sources, and a score trace. The initial strategy weights:

- breadth of the X conversation
- explicit read, watch, and listen endorsements
- momentum across observations and archive runs
- novelty in the edition window
- resonance with the user's Zine history
- underlying-source quality, with penalties for thin or single-voice signals

The artifact is deterministic and inspectable. It establishes the daily agenda and gives the editor evidence for selection; it does not turn engagement into truth or replace the external verification and critic passes.

### Explicit feedback loop

The snapshot also captures a bounded tuning profile derived from the native Today controls. Only four explicit signals tune future candidates:

- `MORE_LIKE_THIS` adds affinity.
- `LESS_LIKE_THIS` subtracts affinity.
- `DISMISSED` subtracts affinity at three quarters of the strength of an explicit dislike.
- `ALREADY_KNEW` lowers novelty without treating the topic or creator as unwanted.

At event-write time, the Worker resolves the target against the immutable edition and stores only normalized topic tokens, creator keys, canonical URLs, and source IDs alongside the event. The read model considers at most 500 explicit events from the prior 180 days with a 60-day half-life. Per-key affinity and novelty are capped, and a candidate's final adjustment is capped to eight points in either direction. Every adjusted candidate retains its untouched X-led base score, split affinity and novelty adjustments, matched keys, and a score reason. Feedback can reorder close calls; it cannot replace the X agenda or factual verification.

Feedback-profile collection is best effort. If it is unavailable, snapshot creation continues with an explicit coverage warning and no tuning adjustment. Existing account deletion removes the feedback rows with the rest of the user's editorial data.

## Edition limits

- One date can have multiple immutable revisions.
- Maximum 8 stories.
- Maximum 7 recommendations.
- Maximum 4 emerging signals.
- Target a 10-minute, roughly 1,500–2,500-word reading experience.
- External research may verify a story, but the story must originate in the captured X/Zine snapshot.

## Rubric

Each category is scored from 0–5. The validator computes the weighted total.

| Category             | Weight | Standard                                                                                          |
| -------------------- | -----: | ------------------------------------------------------------------------------------------------- |
| Grounding and trust  |    25% | Claims are supported and fact is separated from inference, opinion, rumor, prediction, and satire |
| Editorial judgment   |    20% | Important stories are selected while empty virality and repetition are excluded                   |
| Synthesis            |    20% | Related sources become coherent stories rather than source-by-source summaries                    |
| Personal utility     |    15% | Recommendations reflect user interest and clearly justify the time investment                     |
| Novelty and momentum |    10% | New developments are distinguished from recurring conversation                                    |
| Clarity and economy  |    10% | The edition is concise, readable, and non-repetitive                                              |

An edition needs a total score of 80 and a grounding score of at least 4. Scores from 90–100 are exceptional; 80–89 are publishable; 70–79 require revision; lower scores are rejected.

## Hard validation gates

Publication is rejected when:

- The schema is invalid.
- IDs are duplicated or references do not resolve.
- A factual claim has no source.
- A high-confidence factual claim relies only on social signal.
- A source is recommended more than once.
- The weighted quality score is below 80 or grounding is below 4.
- The server receives an edition that was not validated.

The critic must also inspect semantic failures that schemas cannot prove: misleading citations, repeated stories under different wording, popularity treated as truth, shallow generic analysis, excessive single-source dependence, and undisclosed input gaps.

## Storage API

The production base URL is `https://api.myzine.app`. Routes use the existing Zine PAT scopes so the user's single full-access token continues to work.

- `POST /api/v1/editorial/editions` — store a validated edition bundle (`bookmarks:write`).
- `POST /api/v1/editorial/runs` — idempotently register a server-timestamped generation attempt (`bookmarks:write`).
- `POST /api/v1/editorial/runs/{id}/failure` — terminally record a sanitized pre-publication failure stage (`bookmarks:write`).
- `GET /api/v1/editorial/editions` — list edition metadata (`bookmarks:read`).
- `GET /api/v1/editorial/editions/latest` — retrieve the latest JSON edition (`bookmarks:read`).
- `GET /api/v1/editorial/editions/{id}` — retrieve one JSON edition (`bookmarks:read`).
- `GET /api/v1/editorial/editions/{id}/artifacts/{markdown|snapshot|candidates|validation}` — retrieve a retained artifact (`bookmarks:read`).
- `GET /api/v1/editorial/today` — retrieve the latest issue as a native-client read model, including freshness, generation state, warnings, and hydrated Zine presentation state (`bookmarks:read`).
- `POST /api/v1/editorial/feedback` — idempotently record an impression, open, save, finish, dismissal, or explicit preference signal (`bookmarks:write`).
- `GET /api/v1/editorial/feedback/profile` — retrieve the bounded, normalized tuning read model used by the next snapshot (`bookmarks:read`).

Publishing the same edition ID and content is idempotent. Reusing an edition ID for different content returns a conflict.
