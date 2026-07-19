---
name: zine-daily-editorial
description: Build, rank, validate, render, publish, and verify Zine's daily X-led editorial from the X Following archive, Zine inbox, and Zine bookmarks. Use when the user asks to generate, run, produce, or test the daily Zine editorial or morning edition.
---

# Zine Daily Editorial

Act as a selective, evidence-driven editor. Do not produce a generic feed summary.

## Requirements

- Work from the Zine repository root.
- Require `ZINE_ACCESS_TOKEN`; never print it.
- Read `docs/daily-editorial.md` and `packages/editorial-schema/src/index.ts` before drafting.
- Use the current local date in `America/Chicago` unless the user requests another edition date.

## Workflow

1. Choose one stable run ID for the attempt and register it before collecting inputs. Reuse this exact ID in `edition.generation.generatorRunId`; retries must not invent a new ID.

   ```bash
   bun run editorial:run:start -- \
     --run-id <run-id> \
     --date <YYYY-MM-DD> \
     --workflow-version x-led-v1 \
     --prompt-version daily-editorial-v1 \
     --model <model>
   ```

2. Create `.local-data/editorial/<YYYY-MM-DD>/` and build the production snapshot:

   ```bash
   bun run editorial:snapshot -- --date <YYYY-MM-DD> --output .local-data/editorial/<YYYY-MM-DD>/snapshot.json
   ```

3. Inspect snapshot provenance before analysis. If all primary sources are unavailable, fail the run at `SNAPSHOT`. If one is partial or unavailable, continue only when the remaining corpus is useful and disclose the gap in `coverageNotes`.
4. Build the deterministic X-led candidate artifact:

   ```bash
   bun run editorial:rank -- \
     --file .local-data/editorial/<YYYY-MM-DD>/snapshot.json \
     --output .local-data/editorial/<YYYY-MM-DD>/candidates.json
   ```

   Inspect the highest-ranked clusters, their X-led base scores, bounded feedback adjustments, component scores, score reasons, representative X sources, canonical links, and Zine matches. Rankings are attention and relevance hypotheses, not factual verification. Keep lower-ranked candidates when editorial judgment shows that they are more consequential, and record why.

5. Analyze hierarchically rather than treating every item as an independent story:
   - canonicalize the subject behind repeated X reactions and Zine links
   - identify candidate events, conversations, trends, and analysis
   - use engagement as an attention signal, never as factual verification
   - use bookmarks as personal-relevance signals, never as factual verification
   - compare the primary window with the seven-day context
6. Research the most important candidate stories against primary or reliable external sources. Only add an external source when it verifies or materially contextualizes a story already present in the snapshot. Add each external source to the snapshot document catalog, increment the provenance count, and set external verification status accurately. When research changes the snapshot or its provenance, rerun `editorial:rank` so the final candidate artifact references the exact snapshot that will be published.
7. Write `.local-data/editorial/<YYYY-MM-DD>/draft.json` matching `DailyEditionSchema`:
   - target 5–8 stories, 3–7 recommendations, and no more than 4 emerging signals when the corpus supports them
   - target a 10-minute edition; omission is an editorial act
   - lead with what the X conversation says is happening now, then connect it to saved, unfinished, or previously finished Zine material when the match is real
   - populate `whyToday`, `representativeXVoices`, and `zineConnections` when the evidence supports them
   - distinguish FACT, INFERENCE, OPINION, RUMOR, PREDICTION, and JOKE_OR_SATIRE
   - preserve exact source and claim references
   - set `generation.generatorRunId` to the registered run ID and keep its workflow, prompt, and model metadata identical to `editorial:run:start`
   - prefer original artifacts in recommendations
   - do not recommend the same canonical source twice
8. Perform a separate critic pass. Score the six rubric categories skeptically and revise the draft for unsupported claims, false synthesis, repetition, weak recommendations, and generic analysis.
9. Validate and finalize:

   ```bash
   bun run editorial:validate -- \
     --file .local-data/editorial/<YYYY-MM-DD>/draft.json \
     --output .local-data/editorial/<YYYY-MM-DD>/edition.json \
     --report .local-data/editorial/<YYYY-MM-DD>/validation.json
   ```

   Fix validation failures and repeat. Do not bypass the validator.

10. Render Markdown and review it as a reader:

```bash
bun run editorial:render -- \
  --file .local-data/editorial/<YYYY-MM-DD>/edition.json \
  --output .local-data/editorial/<YYYY-MM-DD>/edition.md
```

11. Publish the validated bundle, including the candidate artifact that informed the edition:

```bash
bun run editorial:publish -- \
  --edition .local-data/editorial/<YYYY-MM-DD>/edition.json \
  --snapshot .local-data/editorial/<YYYY-MM-DD>/snapshot.json \
  --candidates .local-data/editorial/<YYYY-MM-DD>/candidates.json \
  --validation .local-data/editorial/<YYYY-MM-DD>/validation.json \
  --markdown .local-data/editorial/<YYYY-MM-DD>/edition.md
```

12. Read the published edition back from both `/api/v1/editorial/editions/<edition-id>` and `/api/v1/editorial/today`. Require matching ID, revision, headline, source count, quality score, and current-date freshness before reporting success. A readback failure after successful publication is a verification failure, not a generation failure; do not downgrade the already-published run.

On any failure before publication, record the terminal stage with a concise, sanitized message before reporting the run unsuccessful:

```bash
bun run editorial:run:fail -- \
  --run-id <run-id> \
  --stage <SNAPSHOT|RANK|RESEARCH|DRAFT|CRITIC|VALIDATE|RENDER|PUBLISH> \
  --message "<sanitized failure summary>"
```

## Editorial invariants

- Every story originates in the captured X/Zine corpus.
- X determines the initial agenda; Zine history adds personal relevance when it genuinely matches.
- X can prove that people are talking; it cannot by itself prove the underlying claim.
- Multiple reactions to one artifact form one story, not multiple stories.
- A ranking score is a traceable selection aid, not an editorial verdict.
- Clearly label uncertainty and disagreement.
- Do not let bookmarks crowd out unexpected high-signal material.
- Do not hide partial inputs, failed verification, validation errors, or upload failures.
- Retain source pointers and metadata; do not duplicate source content into the edition.
