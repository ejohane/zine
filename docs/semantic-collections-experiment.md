# Semantic collection experiment

This experiment tests whether evidence-backed article understanding can produce coherent,
explainable collections before Zine adds generated membership, refresh behavior, or product UI.

## Boundary

The experiment is deliberately read-only:

- it runs one fixed `SELECT` against the production D1 database;
- the SQL guard rejects additional statements and write or administrative keywords;
- it never calls a Zine mutation, queue, R2 write, D1 write, or Vectorize write;
- it writes only gitignored local artifacts under `.local-data/semantic-collections/`;
- it does not create or update a production collection.

The input cohort contains only the user's bookmarked articles whose latest schema-v3 enrichment is
`COMPLETE`, has non-null deep understanding, and still matches the recorded article-body source
hash. Titles, creators, and publishers are included for presentation. Membership decisions must
cite exact semantic signal IDs derived from evidence-backed summaries, topics, claims, answered
questions, concepts, perspectives, audiences, or actionable takeaways.

## Run

Required environment variables:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN` with production D1 read and Workers AI inference access

Optional environment variable:

- `COLLECTION_GENERATION_MODEL` defaults to `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. Article
  understanding remains independently configured through `ARTICLE_UNDERSTANDING_MODEL`; changing
  the collection experiment does not change saved semantic records.

From the repository root:

```bash
bun run semantic-collections:experiment
```

Use a previously retained corpus snapshot without reading production again:

```bash
bun run semantic-collections:experiment -- \
  --corpus .local-data/semantic-collections/<run-id>/corpus.json
```

Resume a failed replay from already-validated theme and primary artifacts:

```bash
bun run semantic-collections:experiment -- \
  --corpus .local-data/semantic-collections/<run-id>/corpus.json \
  --themes .local-data/semantic-collections/<run-id>/themes.json \
  --primary .local-data/semantic-collections/<run-id>/proposals.json
```

Retained artifacts are accepted only when they pass the current schemas and semantic gates and
match the exact corpus hash, collection model, and prompt version.

Override the user-directed lens:

```bash
bun run semantic-collections:experiment -- \
  --user-lens "How engineers create meaningful impact beyond writing code."
```

## Artifacts

Each run writes:

```text
.local-data/semantic-collections/<run-id>/
  corpus.json
  themes.json
  proposals.json
  replay-proposals.json
  validation.json
  stability.json
  review.md
```

The corpus is content-addressed independently of its generation timestamp. The first generation
contains one user-directed proposal and three AI-discovered proposals. Discovered themes retain
their evidence-backed seed item IDs so later proposal generation cannot silently collapse distinct
themes back into the same broad portfolio. The replay uses the same corpus and fixed lenses with
different seeds, isolating membership stability from theme-discovery variance.

## Automated gates

A run passes only when:

- all four proposals pass schema and semantic validation;
- every corpus item is scored exactly once in every proposal;
- every selected item and near miss exists in the corpus;
- every selected-item and near-miss explanation cites semantic signals belonging to that article,
  inheriting validated source block IDs;
- every proposal selects 3–6 unique articles with consecutive ranks;
- AI-discovered portfolios do not exceed `0.60` pairwise Jaccard overlap;
- each AI-discovered theme retains an exact three-item seed core and may add at most one article;
- theme-discovery seed portfolios do not exceed `0.40` pairwise Jaccard overlap and collectively
  cover at least `70%` of the corpus;
- generated prose is complete and collection titles are not generic categories;
- every fixed lens retains at least `0.70` of its smaller core portfolio on replay.

The generated Markdown is the human review surface. It records collection-level and item-level
checkboxes plus a final `Stop`, `Tune`, or `Productize` decision. No human decision is inferred from
the automated score.

## Non-goals

This experiment does not add database tables, collection persistence, Home integration, native or
web UI, refresh scheduling, notifications, historical article backfill, other content types,
recommendation impressions, or learned personalization. A successful review authorizes none of
those automatically; durable generated membership is a separate productization decision.
