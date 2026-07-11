---
name: zine-daily-editorial
description: Build, validate, render, publish, and verify Zine's daily editorial from the X Following archive, Zine inbox, and Zine bookmarks. Use when the user asks to generate, run, produce, or test the daily Zine editorial or morning edition.
---

# Zine Daily Editorial

Act as a selective, evidence-driven editor. Do not produce a generic feed summary.

## Requirements

- Work from the Zine repository root.
- Require `ZINE_ACCESS_TOKEN`; never print it.
- Read `docs/daily-editorial.md` and `packages/editorial-schema/src/index.ts` before drafting.
- Use the current local date in `America/Chicago` unless the user requests another edition date.

## Workflow

1. Create `.local-data/editorial/<YYYY-MM-DD>/` and build the production snapshot:

   ```bash
   bun run editorial:snapshot -- --date <YYYY-MM-DD> --output .local-data/editorial/<YYYY-MM-DD>/snapshot.json
   ```

2. Inspect snapshot provenance before analysis. If all primary sources are unavailable, stop. If one is partial or unavailable, continue only when the remaining corpus is useful and disclose the gap in `coverageNotes`.
3. Analyze hierarchically rather than treating every item as an independent story:
   - canonicalize the subject behind repeated X reactions and Zine links
   - identify candidate events, conversations, trends, and analysis
   - use engagement as an attention signal, never as factual verification
   - use bookmarks as personal-relevance signals, never as factual verification
   - compare the primary window with the seven-day context
4. Research the most important candidate stories against primary or reliable external sources. Only add an external source when it verifies or materially contextualizes a story already present in the snapshot. Add each external source to the snapshot document catalog, increment the provenance count, and set external verification status accurately.
5. Write `.local-data/editorial/<YYYY-MM-DD>/draft.json` matching `DailyEditionSchema`:
   - target 5–8 stories, 3–7 recommendations, and no more than 4 emerging signals when the corpus supports them
   - target a 10-minute edition; omission is an editorial act
   - distinguish FACT, INFERENCE, OPINION, RUMOR, PREDICTION, and JOKE_OR_SATIRE
   - preserve exact source and claim references
   - prefer original artifacts in recommendations
   - do not recommend the same canonical source twice
6. Perform a separate critic pass. Score the six rubric categories skeptically and revise the draft for unsupported claims, false synthesis, repetition, weak recommendations, and generic analysis.
7. Validate and finalize:

   ```bash
   bun run editorial:validate -- \
     --file .local-data/editorial/<YYYY-MM-DD>/draft.json \
     --output .local-data/editorial/<YYYY-MM-DD>/edition.json \
     --report .local-data/editorial/<YYYY-MM-DD>/validation.json
   ```

   Fix validation failures and repeat. Do not bypass the validator.

8. Render Markdown and review it as a reader:

   ```bash
   bun run editorial:render -- \
     --file .local-data/editorial/<YYYY-MM-DD>/edition.json \
     --output .local-data/editorial/<YYYY-MM-DD>/edition.md
   ```

9. Publish the validated bundle:

   ```bash
   bun run editorial:publish -- \
     --edition .local-data/editorial/<YYYY-MM-DD>/edition.json \
     --snapshot .local-data/editorial/<YYYY-MM-DD>/snapshot.json \
     --validation .local-data/editorial/<YYYY-MM-DD>/validation.json \
     --markdown .local-data/editorial/<YYYY-MM-DD>/edition.md
   ```

10. Read the published edition back from `/api/v1/editorial/editions/<edition-id>` and require matching ID, revision, headline, source count, and quality score before reporting success.

## Editorial invariants

- Every story originates in the captured X/Zine corpus.
- X can prove that people are talking; it cannot by itself prove the underlying claim.
- Multiple reactions to one artifact form one story, not multiple stories.
- Clearly label uncertainty and disagreement.
- Do not let bookmarks crowd out unexpected high-signal material.
- Do not hide partial inputs, failed verification, validation errors, or upload failures.
- Retain source pointers and metadata; do not duplicate source content into the edition.
