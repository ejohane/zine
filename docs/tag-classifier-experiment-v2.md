# Revised tagging experiment

On 2026-10-05, the user's review of all twenty baseline cases informed catalog
version 2 (244 tags) and classification policy 2. The baseline catalog remains
in `packages/shared/src/tag-classifier/catalog-v1.json`. Original labels and runs
remain unchanged in private local storage.

## Changes

Added sixteen topics, including PostgreSQL, Interview, Principal engineer,
Staff engineer, fitness terms, Business, Tech industry, Design, Design
engineering, Data, Playwright, Vibecode, and Harness. Stable existing IDs remain.
User wording Agents, LLM, and UX maps to AI agents, Language models, and User
experience. Principal engineer was used for the user's alternative
"principal engineer or staff engineer" because the description explicitly names
that role; the two roles are separate catalog entries.

Policy 2 accepts explicit topic evidence in a title or description without
requiring a full article or transcript. Broad and specific topics may coexist.
It excludes ads, analogies, incidental biography, and unsupported assumptions.
Definitions for Decision making, Knowledge management, and Critical thinking
were narrowed based on the review; no bookmark-specific exclusions were added.

## Live comparison at threshold 0.8

| Measure                                     |        Baseline |         Revised |
| ------------------------------------------- | --------------: | --------------: |
| Confirmed requested/accepted tags recovered | 33 / 59 (55.9%) | 53 / 59 (89.8%) |
| All suggestions                             |              48 |             122 |
| Explicitly rejected suggestions reproduced  |               3 |               2 |

This is development-set recovery, not independently validated precision or
recall. The user saw model output during review and did not exhaustively judge
all catalog tags. Unreviewed suggestions are unknown, not automatically wrong.
The CLI's strict closed-label report is available locally but must not be read
as a human-validated precision measurement. Baseline recovery includes requested
tags absent from its catalog; the experiment changes both vocabulary and policy,
so it does not isolate their individual effects.

Successes include PostgreSQL, Harness, Playwright, Rust, fitness terms, Data,
and AI on the layoffs post. The no-evidence "Welp" case remains untagged.
Remaining misses: Creativity, Principal engineer, Startups, LLM on the agentic
patterns article, and AI/Vibecode on the icon post. Decision making on the design
system article and Critical thinking on the postmortem remain above threshold.
Additional suggestions need review, especially inference from sparse evidence.

Final revised twenty-call estimated cost: $0.02512; median API latency: 352 ms.
An earlier longer-policy exploratory run also made twenty calls, before the
request-size check prompted shortening; its runs are retained separately under
`v2-runs`. Only `v2-final-runs` supplies the numbers above.

## Reproduce locally

Secure credentials are configured in the `zine.classifier` secretsctl profile.
No secret values live in the repository or local output files.

```sh
secretsctl run zine.classifier -- bun run tags:cli -- eval --dataset .local-data/tag-classifier/evaluation-v2.json --out .local-data/tag-classifier/v2-final-runs
bun run tags:cli -- report --catalog packages/shared/src/tag-classifier/catalog-v1.json --dataset .local-data/tag-classifier/evaluation.json --runs .local-data/tag-classifier/live-runs
```

Evaluation resumes compatible saved runs without more calls. Report allows
historical policy versions but rejects mixed policies in one report. Evaluation
requires the current policy. Raw comparison rows and review judgments remain in
`.local-data/tag-classifier/comparison-v2.json` and `human-review.json`.

All fourteen classifier tests, scoped typechecking, ESLint, and formatting
checks passed. No app UI, queue, persistence, or bookmark mutations were added.

## Next validation

Review new suggestions on this development set, then label twenty previously
unseen bookmarks before exposing their model results. The holdout must be
reviewed by the user rather than reusing the implementing agent's assumptions.
No holdout accuracy claim is made yet.
