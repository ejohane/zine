# Daily Editorial Pipeline

## Scope

The daily editorial pipeline turns the user's X Following archive, Zine inbox, and Zine bookmarks into a grounded, versioned morning edition. It intentionally does not render or integrate with the Zine Home experience yet.

The canonical output is validated JSON. Markdown is a deterministic review rendering. Snapshots, validation reports, JSON editions, and Markdown editions are retained in Cloudflare R2 and indexed in D1.

## Components

- `packages/editorial-schema`: versioned snapshot, edition, publication, and validation contracts.
- `apps/editorial`: local Bun CLI for snapshot creation, validation, rendering, and upload.
- `apps/worker`: authenticated edition persistence and readback API.
- `.codex/skills/zine-daily-editorial`: Codex editor and critic workflow.

## Editorial window

The primary window begins at the `through` timestamp of the previous successfully published edition. When no prior edition exists, it falls back to 24 hours. The previous seven days provide comparison context.

- X entries come from archive runs completed since the primary cutoff. If none exist, the latest usable run is used.
- Inbox entries are selected by `ingestedAt`.
- Recent bookmarks are selected by `bookmarkedAt`.
- Unfinished bookmarks from the comparison window may be included as contextual taste signals.
- Canonical source IDs deduplicate content that appears in both Inbox and Bookmarks.

## Commands

All commands require `ZINE_ACCESS_TOKEN`. The snapshot command uses `ZINE_X_ARCHIVE_TOKEN` when present and otherwise reuses `ZINE_ACCESS_TOKEN`.

```bash
mkdir -p .local-data/editorial/2026-07-11

bun run editorial:snapshot -- \
  --date 2026-07-11 \
  --output .local-data/editorial/2026-07-11/snapshot.json

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
  --validation .local-data/editorial/2026-07-11/validation.json \
  --markdown .local-data/editorial/2026-07-11/edition.md
```

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
- `GET /api/v1/editorial/editions` — list edition metadata (`bookmarks:read`).
- `GET /api/v1/editorial/editions/latest` — retrieve the latest JSON edition (`bookmarks:read`).
- `GET /api/v1/editorial/editions/{id}` — retrieve one JSON edition (`bookmarks:read`).
- `GET /api/v1/editorial/editions/{id}/artifacts/{markdown|snapshot|validation}` — retrieve a retained artifact (`bookmarks:read`).

Publishing the same edition ID and content is idempotent. Reusing an edition ID for different content returns a conflict.
