---
name: zine-daily-editorial
description: Build, rank, validate, render, publish, and verify Zine's topic-neutral daily editorial from the X Following archive, current Zine material, bounded outside-lens discovery, and retained edition history. Use when the user asks to generate, run, produce, or test the daily Zine editorial or morning edition.
---

# Zine Daily Editorial

Act as a selective, evidence-driven editor. Do not produce a generic feed summary or force the day into predefined topics.

## Requirements

- Work from the Zine repository root.
- Require `ZINE_ACCESS_TOKEN`; never print it.
- Read `docs/daily-editorial.md` and `packages/editorial-schema/src/index.ts` before drafting.
- Use the current local date in `America/Chicago` unless the user requests another edition date.
- Use `editorial-v2` and `daily-editorial-v2` for new runs. Retained `X_LED_V1` artifacts remain readable if the application deployment is rolled back.

## Workflow

1. Choose one stable run ID for the attempt and register it before collecting inputs. Reuse this exact ID in `edition.generation.generatorRunId`; retries must not invent a new ID.

   ```bash
   bun run editorial:run:start -- \
     --run-id <run-id> \
     --date <YYYY-MM-DD> \
     --workflow-version editorial-v2 \
     --prompt-version daily-editorial-v2 \
     --model <model>
   ```

2. Create `.local-data/editorial/<YYYY-MM-DD>/external-discovery.json` as a bounded outside-timeline lens. Scan a modest set of trusted primary/reporting sources across their current output without using topic queries, product keywords, or category quotas. The artifact must match `EditorialExternalDiscoveryArtifactSchema`, use `EXTERNAL` origin, preserve canonical URLs and provenance, summarize rather than copy source text, and record coverage gaps. Trusted-source selection is a quality boundary, not a subject bundle.

3. Build the production snapshot. Omit `--discovery` only when outside-lens collection genuinely failed, and disclose that absence.

   ```bash
   bun run editorial:snapshot -- \
     --date <YYYY-MM-DD> \
     --discovery .local-data/editorial/<YYYY-MM-DD>/external-discovery.json \
     --output .local-data/editorial/<YYYY-MM-DD>/snapshot.json
   ```

4. Inspect snapshot provenance before analysis. The snapshot should include X, current Zine Inbox/bookmarks, the bounded outside lens, a capped feedback profile, and up to 14 prior editions of story history. If all current discovery sources are unavailable, fail at `SNAPSHOT`. When one source is partial or unavailable, continue only when the remaining corpus is useful and disclose the gap.

5. Build the deterministic topic-neutral candidate and portfolio artifact:

   ```bash
   bun run editorial:rank -- \
     --file .local-data/editorial/<YYYY-MM-DD>/snapshot.json \
     --output .local-data/editorial/<YYYY-MM-DD>/candidates.json
   ```

   Inspect all discovered clusters, corpus-relative component scores, capped feedback adjustments, source origins, recent-edition similarity, the selected portfolio, omitted-finalist reasons, creator/domain diversity, pairwise similarity, concentration, coverage notes, and extractive framing. Confirm selected candidates have a recoverable editorial subject or canonical artifact, X-only clusters do not receive cross-source corroboration credit, near-semantic duplicates do not take separate portfolio slots, and headlines/summaries are concise and self-contained without obscuring thin evidence. Each new v2 candidate must retain `EXTRACTIVE_EDITORIAL_V1` methods and exact framing source IDs. The ranker has no named subject bundles or category slots. Engagement is an attention signal, never factual verification.

6. Treat the portfolio as the default editorial shortlist. If editorial judgment includes or excludes a different candidate, record the override before drafting:

   ```bash
   bun run editorial:portfolio:override -- \
     --file .local-data/editorial/<YYYY-MM-DD>/candidates.json \
     --output .local-data/editorial/<YYYY-MM-DD>/candidates.json \
     --candidate-id <candidate-id> \
     --action <include|exclude> \
     --reason "<concise evidence-based reason>"
   ```

7. Analyze hierarchically rather than treating every source as an independent story:
   - canonicalize repeated reactions and reports about the same artifact or event
   - compare X attention, Zine relevance, and outside-lens consequence without making one source the automatic agenda
   - compare the primary window with both seven-day context and retained edition history
   - preserve a concentrated edition when evidence truly warrants it; do not manufacture breadth
   - use personal relevance as a bounded utility signal and retain high-quality serendipity

8. Verify the most important candidate stories against primary or reliable sources. Research may verify or materially contextualize an existing candidate. If research reveals a genuinely new story, add it as a validated `EXTERNAL` discovery document, rebuild the snapshot, and rerun ranking before drafting. Never introduce an unranked story silently.

9. Write `.local-data/editorial/<YYYY-MM-DD>/draft.json` matching `DailyEditionSchema`:
   - target 5–8 stories, 3–7 recommendations, and no more than 4 emerging signals when the corpus supports them
   - target a 10-minute edition; omission is an editorial act
   - let the strongest grounded developments lead, regardless of subject
   - explain what X is discussing, what current/traditional Zine material adds, and what the outside lens contributes when each is relevant
   - populate `whyToday`, `representativeXVoices`, and `zineConnections` only when evidence supports them
   - distinguish FACT, INFERENCE, OPINION, RUMOR, PREDICTION, and JOKE_OR_SATIRE
   - preserve exact source and claim references
   - set generation metadata exactly equal to the registered run
   - prefer original artifacts in recommendations and never recommend one canonical source twice

10. Perform a separate critic pass. Score the six rubric categories skeptically and revise for unsupported claims, false synthesis, repetition, source concentration, weak recommendations, missing outside context, and unexplained portfolio overrides.

11. Validate and finalize. Fix validation failures and repeat; never bypass the validator.

```bash
bun run editorial:validate -- \
  --file .local-data/editorial/<YYYY-MM-DD>/draft.json \
  --output .local-data/editorial/<YYYY-MM-DD>/edition.json \
  --report .local-data/editorial/<YYYY-MM-DD>/validation.json
```

12. Render Markdown and review it as a reader.

```bash
bun run editorial:render -- \
  --file .local-data/editorial/<YYYY-MM-DD>/edition.json \
  --output .local-data/editorial/<YYYY-MM-DD>/edition.md
```

13. Publish the validated bundle, including the exact candidate/portfolio artifact that informed the edition.

```bash
bun run editorial:publish -- \
  --edition .local-data/editorial/<YYYY-MM-DD>/edition.json \
  --snapshot .local-data/editorial/<YYYY-MM-DD>/snapshot.json \
  --candidates .local-data/editorial/<YYYY-MM-DD>/candidates.json \
  --validation .local-data/editorial/<YYYY-MM-DD>/validation.json \
  --markdown .local-data/editorial/<YYYY-MM-DD>/edition.md
```

14. Read the published edition back from both `/api/v1/editorial/editions/<edition-id>` and `/api/v1/editorial/today`. Require matching ID, revision, headline, source count, quality score, workflow version, and current-date freshness. A readback failure after successful publication is a verification failure, not a generation failure; do not downgrade the already-published run.

On any failure before publication, record the terminal stage with a concise, sanitized message:

```bash
bun run editorial:run:fail -- \
  --run-id <run-id> \
  --stage <SNAPSHOT|RANK|RESEARCH|DRAFT|CRITIC|VALIDATE|RENDER|PUBLISH> \
  --message "<sanitized failure summary>"
```

## Editorial invariants

- Every story originates in the captured X, current Zine, or bounded external-discovery corpus.
- No subject, product, company, creator, or industry has a hand-authored ranking bundle.
- X proves that people are talking; it cannot by itself prove the underlying claim.
- Zine supplies current discovery and personal context; affinity never automatically outranks stronger evidence.
- Multiple reactions to one artifact form one story, not multiple stories.
- The portfolio controls semantic, creator, domain, and historical repetition without category quotas.
- A ranking score is a traceable selection aid, not an editorial verdict.
- Editorial departures from the portfolio require retained override reasons.
- Clearly label uncertainty and disagreement.
- Do not hide partial inputs, failed verification, validation errors, or upload failures.
- Retain source pointers and metadata; do not duplicate full source content into the edition.
