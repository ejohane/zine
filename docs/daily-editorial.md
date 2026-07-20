# Daily Editorial Pipeline

For durable A/B comparison and phone review of editorial changes, see [Editorial experiments](./editorial-experiments.md).

## Scope

The daily editorial pipeline turns the user's X Following archive, current Zine inbox and bookmarks, and a bounded outside-lens discovery artifact into a grounded, versioned morning edition for the native iOS Today experience. No subject or product has a privileged ranking path: the day's agenda is discovered from canonical artifacts, corpus-relative language, independent voices, source quality, personal relevance, and recent-edition history.

The canonical output is validated JSON. Markdown is a deterministic review rendering. Snapshots, ranked candidate artifacts, validation reports, JSON editions, and Markdown editions are retained in Cloudflare R2 and indexed in D1.

## Components

- `packages/editorial-schema`: versioned snapshot, candidate, edition, feedback, publication, and validation contracts.
- `apps/editorial`: local Bun CLI for snapshot creation, topic-neutral clustering, portfolio selection, replay auditing, validation, rendering, and upload.
- `apps/worker`: authenticated edition persistence, native Today read model, and editorial-feedback API.
- `apps/ios`: supported SwiftUI Today experience with cache-first issue loading and explicit preference feedback.
- `.codex/skills/zine-daily-editorial`: Codex editor and critic workflow.

## Editorial window

The primary window begins at the `through` timestamp of the previous successfully published edition. When no prior edition exists, it falls back to 24 hours. The previous seven days provide comparison context.

- X entries come from archive runs completed since the primary cutoff. If none exist, the latest usable run is retained only as explicitly partial fallback coverage; when no complete or partial run exists, X coverage is unavailable.
- Inbox entries are selected by `ingestedAt`.
- Recent bookmarks are selected by `bookmarkedAt`.
- Up to 200 older bookmarks are retained as bounded taste context, including finished/read material; unfinished items from the comparison window are prioritized, then the most recently opened or saved history.
- The prior 14 editions are summarized into story topics and canonical URLs so the selector can detect yesterday's story wearing a new headline.
- A validated outside-lens artifact may contribute up to 500 current `EXTERNAL` documents from trusted reporting or primary sources. Its source list is a provenance boundary, not a topic list.
- Canonical source IDs deduplicate content that appears in both Inbox and Bookmarks.

## Commands

All commands require `ZINE_ACCESS_TOKEN`. The snapshot command uses `ZINE_X_ARCHIVE_TOKEN` when present and otherwise reuses `ZINE_ACCESS_TOKEN`.

```bash
mkdir -p .local-data/editorial/2026-07-11

bun run editorial:run:start -- \
  --run-id <stable-run-id> \
  --date 2026-07-11 \
  --workflow-version editorial-v2 \
  --prompt-version daily-editorial-v2 \
  --model <model>

bun run editorial:snapshot -- \
  --date 2026-07-11 \
  --discovery .local-data/editorial/2026-07-11/external-discovery.json \
  --output .local-data/editorial/2026-07-11/snapshot.json

bun run editorial:rank -- \
  --file .local-data/editorial/2026-07-11/snapshot.json \
  --output .local-data/editorial/2026-07-11/candidates.json

# Only when editorial judgment departs from the algorithmic portfolio:
bun run editorial:portfolio:override -- \
  --file .local-data/editorial/2026-07-11/candidates.json \
  --output .local-data/editorial/2026-07-11/candidates.json \
  --candidate-id <candidate-id> \
  --action include \
  --reason "Concise evidence-based reason for the override"

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

The optional external-discovery file has `schemaVersion`, `generatedAt`, `coverageNotes`, and `documents`. Each document uses the normal snapshot-document contract, must have `source.origin: "EXTERNAL"`, and must preserve a canonical URL, source role, creator or publisher when known, timestamps, and a concise summary. Do not paste full copyrighted source content into it.

The run ID is an idempotency key for one generation attempt and must match `edition.generation.generatorRunId`. Reuse it when retrying a command. On any pre-publication failure, record the exact failed stage:

```bash
bun run editorial:run:fail -- \
  --run-id <stable-run-id> \
  --stage VALIDATE \
  --message "Edition did not meet the grounding threshold."
```

Run start, failure, and publication form one server-owned lifecycle: `PREPARING` → `FAILED` or `PUBLISHED`. An identical retry is idempotent; conflicting reuse is rejected. Successful recovery may promote a failed run to published. Do not mark a run failed after publication merely because readback verification failed.

## Topic-neutral candidate and portfolio model

`editorial:rank` runs every current X, Zine, and external discovery document through the same deterministic clustering path. Exact canonical artifacts are strongest; rare corpus-relative unigrams and bigrams can connect semantically compatible documents. There are no named bundles, subject keywords, product patterns, or category quotas. Each candidate retains every source, representative independent voices, canonical links, matching Zine context, history similarity, and a score trace. V2 considers:

- breadth across independent voices and origins
- X attention and explicit read, watch, and listen endorsements
- momentum across observations and archive runs
- freshness and similarity to the prior 14 editions
- capped personal relevance from current and historical Zine material
- evidence and source quality
- cross-source corroboration
- serendipity for strong material outside the established affinity profile

Signals are normalized against the current corpus. The ranker then applies a maximum-marginal-relevance portfolio pass: it rewards base quality while penalizing semantic redundancy, repeated creators/domains, and recent-edition repetition. This controls concentration without requiring fixed culture, politics, technology, or other slots. The artifact retains selected and omitted candidates, score traces, decision reasons, origin mix, pairwise similarity, and concentration diagnostics.

The artifact is deterministic and inspectable. It gives the editor evidence for selection; it does not turn engagement into truth or replace verification and critic passes. Text-only clusters need enough recurring substantive language across independent voices to preserve a recoverable editorial subject; a canonical non-social artifact also satisfies that eligibility boundary. X-only repetition is conversation evidence, so its evidence-quality score is capped and its cross-source corroboration score is zero. `MMR_PORTFOLIO_V2` also prevents a near-semantic duplicate from taking a second portfolio slot. Ineligible candidates and duplicate pressure remain in the artifact with omission reasons. An editor may depart from the algorithmic portfolio only through `editorial:portfolio:override`, which retains the candidate, action, and reason in the uploaded artifact.

Every v2 candidate also carries deterministic extractive framing. The ranker prefers an authoritative non-X source title and summary, then captured link-card metadata, then a concise passage from the strongest source. Headlines are bounded and stripped of raw URLs, handles used only as trailing post furniture, shouting case, and accidental mid-sentence truncation. Summaries retain useful source context and preserve an explicit ellipsis when the captured source itself was truncated. The `framing` object records `EXTRACTIVE_EDITORIAL_V1`, the headline and summary methods, and the exact source IDs used. This improves shortlist readability without inventing facts or hiding thin evidence; the later drafting and critic passes remain responsible for full editorial synthesis.

### Explicit feedback loop

The snapshot also captures a bounded tuning profile derived from the native Today controls. Only four explicit signals tune future candidates:

- `MORE_LIKE_THIS` adds affinity.
- `LESS_LIKE_THIS` subtracts affinity.
- `DISMISSED` subtracts affinity at three quarters of the strength of an explicit dislike.
- `ALREADY_KNEW` lowers novelty without treating the topic or creator as unwanted.

At event-write time, the Worker resolves the target against the immutable edition and stores only normalized topic tokens, creator keys, canonical URLs, and source IDs alongside the event. The read model considers at most 500 explicit events from the prior 180 days with a 60-day half-life. Per-key affinity and novelty are capped, and a candidate's final adjustment is capped to eight points in either direction. Every adjusted candidate retains its untouched topic-neutral base score, split affinity and novelty adjustments, matched keys, and a score reason. Feedback can reorder close calls; it cannot replace evidence quality, historical novelty, or factual verification.

Feedback-profile collection is best effort. If it is unavailable, snapshot creation continues with an explicit coverage warning and no tuning adjustment. Existing account deletion removes the feedback rows with the rest of the user's editorial data.

## Edition limits

- One date can have multiple immutable revisions.
- Maximum 8 stories.
- Maximum 7 recommendations.
- Maximum 4 emerging signals.
- Target a 10-minute, roughly 1,500–2,500-word reading experience.
- Every story must originate in the captured X, current Zine, or bounded external-discovery snapshot. Later research may verify or contextualize it, but may not silently introduce a new story after ranking.

## Replay and rollout

Run retained snapshots through v2 before changing a scheduled job:

```bash
bun run editorial:replay -- \
  --directory .local-data/editorial \
  --output .local-data/editorial/replay-v2.json
```

The report records v1/v2 candidate counts when a prior artifact exists plus portfolio size, creator/domain diversity, pairwise similarity, topic concentration, origin mix, and historical-repeat risks. For a production cutover, first retain several v2 shadow runs without publishing, inspect their artifacts, then change the scheduled run metadata to `editorial-v2` / `daily-editorial-v2`. Rollback is redeploying the prior application version; old `X_LED_V1` artifacts remain valid and readable throughout.

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
