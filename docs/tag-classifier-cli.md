# Local topic-classifier experiment

This read-only CLI evaluates local Zine bookmarks against a versioned catalog of
228 topics. It does not assign tags, mutate bookmarks, enqueue jobs, or write to
production. Real classification sends the prepared content to TypeSafe's hosted
API. Local reads and replay do not need an API key or a running Worker/Simulator.

## Setup

Use Bun 1.3.4 and the repository dependencies. Provision this worktree's sanitized
D1/R2 snapshot using the existing workflow (stop its Worker before restoring):

```sh
bun run data:prod:local -- --yes --include-article-bodies
bun run tags:cli -- help
bun run tags:cli -- list
```

`list` returns user-item bookmark IDs belonging to the snapshot owner. `--user`
may explicitly select that owner; it cannot remap a different account. `--state`
selects another local sanitized state directory, never a remote database.

```sh
bun run tags:cli -- inspect --bookmark BOOKMARK_ID --out .local-data/tag-classifier/input.json
```

The input allowlists title, description, content text, type, and attribution.
It excludes raw provider payloads, credentials, mailbox metadata, and user activity.
V2 article artifacts are checked with the existing schema/hash verifier; legacy
HTML is stripped. Non-article bookmarks use available title/description; no
transcript is invented. Missing referenced bodies fail with refresh guidance.
Oversized article text retains its beginning and end and explicitly reports
partial coverage and `MIDDLE_OMITTED`. Descriptions are bounded to 2,000 characters.
This is an experiment preparation policy, not a claim of full-document recall.

## Real classification

On this development host, `TYPESAFE_API_KEY` is stored in Bitwarden Secrets
Manager under `agent-local` and allowlisted in the `zine.classifier` profile.
Other hosts need their own approved profile setup. Check metadata and readiness
before the first use, then launch the CLI through it:

```sh
secretsctl metadata zine.classifier
secretsctl check zine.classifier
```

```sh
secretsctl run zine.classifier -- bun run tags:cli -- classify --bookmark BOOKMARK_ID
```

Do not put API keys in arguments or files. The client calls only
`https://api.typesafe.ai/v1/systemone`, with one Noul question per catalog topic.
Defaults: pinned `jev-1.13.0`, threshold 0.8, estimated input price $0.042/M tokens.
All are explicit options except the fixed API destination. The price is an
estimate, not an invoice; check current pricing before changing it.

Output lists all probabilities, which meet the threshold, coverage/warnings,
model/catalog/policy versions, latency, usage, and estimated cost. A versioned JSON
run stores the prepared input, complete catalog, hashes, and all probabilities
under `.local-data/tag-classifier/` by default. Treat these files as private
bookmark content. Custom outputs should also stay under gitignored `.local-data`.

```sh
bun run tags:cli -- replay --run RUN_FILE --threshold 0.9
```

Replay never calls Jev. Changing instructions, input, catalog, or model requires a
fresh classification. A request times out after 60 seconds; failures give concise
instructions without echoing response bodies or credentials. Rate limits and
overload fail explicitly: retry later rather than hiding cost behind automatic
retries. Completed case files survive a failed multi-case evaluation. Repeating eval in
the same output directory reuses matching completed cases; use a new directory
for a fresh run. Mismatched inputs, catalogs, policies, or requested models fail.

## Accuracy evaluation

Export at least 20 contrasting bookmarks before looking at their model output:

```sh
bun run tags:cli -- dataset --bookmarks ID_1,ID_2 --out .local-data/tag-classifier/evaluation.json
```

Each case contains its exact input and two label lists using stable catalog IDs:

- `expected`: topics a useful classifier should recover from this available input.
- `acceptable`: useful additional topics that are valid but not required.

Review the source text and catalog definitions, label every case (including empty
lists where nothing qualifies), then set the dataset's `reviewed` field to `true`.
Unreviewed exports are rejected. Do not infer labels from the title when full text
says something different, and do not expect unseen transcript topics.
Keep labels fixed before API evaluation. Labels by an agent are an initial review,
not a substitute for the product owner's judgment or independent ground truth.

```sh
secretsctl run zine.classifier -- bun run tags:cli -- eval --dataset .local-data/tag-classifier/evaluation.json --out .local-data/tag-classifier/runs
bun run tags:cli -- report --dataset .local-data/tag-classifier/evaluation.json --runs .local-data/tag-classifier/runs --threshold 0.9
```

`report` reads saved results only. It rejects input/catalog mismatches and reports
micro precision (useful suggestions / suggestions), recall (expected tags found /
expected tags), wrong suggestions, and missed tags for every bookmark. Undefined
metrics are null rather than a misleading perfect score. The initial target flag
requires at least 20 cases, precision >=90%, and recall >=80%. A small, personal,
topic-skewed sample does not establish general accuracy. Do not tune on these cases
and present the same cases as an independent holdout.

## Checks

```sh
bun run test:tag-classifier
bun run --cwd packages/shared typecheck
bun run typecheck:tag-classifier
```

Tests cover real local SQLite/R2 reads, unchanged bookmark DB bytes, owner scoping,
zero/multiple results, complete response validation, error handling, input cleanup,
and precision/recall calculations. CI checks use injected responses. Real Jev
quality and cost require explicit live evaluation.

Catalog: `packages/shared/src/tag-classifier/catalog.json`. Pure contract and
selection: `packages/shared/src/tag-classifier/core.ts`. Shared input reader:
`scripts/tag-classifier/local.ts`. HTTP adapter: `scripts/tag-classifier/jev.ts`.
No UI, suggestion persistence, acceptance/dismissal, backfill, or automatic triggers
are included in this slice.
