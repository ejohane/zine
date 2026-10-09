# Repeatable development comparison

```sh
bun scripts/tag-classifier/compare.ts .local-data/tag-classifier/development-review.json .local-data/tag-classifier/live-runs .local-data/tag-classifier/v2-final-runs .local-data/tag-classifier/development-comparison.json
```

The review format is `{version: 1, cases: [{input, reviewed: true, labels}]}`.
Labels use the expected alternative groups, acceptable/unwanted IDs, and
exhaustiveness contract in tag-holdout-workflow.md. This command reads saved runs
only and makes no API calls. It rejects changed inputs, corrupt catalog hashes,
duplicate reviewed bookmarks, missing/ambiguous runs, and mixed variants.
Historical catalog and policy versions remain valid for comparison.

Reports identify their role as DEVELOPMENT_ONLY, retain review/catalog hashes,
model and policy versions, and include per-coverage metrics, cost, median API
latency, misses, explicit unwanted suggestions, unknowns, and catalog gaps.
Common-vocabulary recovery uses only expected groups represented in both
catalogs, separating vocabulary expansion from changes on existing topics.
It does not isolate every causal factor: catalog definitions and policy both
changed in the original experiment.

## Current reviewed-development results

| Measure                            | Baseline | Revised |
| ---------------------------------- | -------: | ------: |
| Expected groups recovered          |  33 / 59 | 53 / 59 |
| Common-vocabulary groups recovered |  33 / 43 | 39 / 43 |
| Confirmed useful suggestions       |       38 |      58 |
| Explicit unwanted suggestions      |        3 |       2 |
| Unknown suggestions                |        7 |      62 |
| Suggestion review coverage         |    85.4% |   49.2% |

Unknown suggestions are not assumed wrong. Conversely, high precision among
reviewed suggestions cannot prove release precision when half the candidate's
suggestions are unknown. These labels came from user review after seeing model
outputs, so they cannot satisfy independent holdout validation.

Principal/Staff engineer are represented as an alternative expected group,
reflecting the user's wording. All other original judgments remain unchanged.
No new labels were invented to improve the scores. Private evidence and normalized
review files stay in `.local-data/tag-classifier/`.
