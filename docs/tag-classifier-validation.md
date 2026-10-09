# Tag-classifier slice validation

Status on 2026-10-04: the read-only CLI and twenty-bookmark live evaluation
are complete. Jev integration works, but the initial tagging quality targets
were missed. Product viability is not established.

## Verified

- `bun run test:tag-classifier`: 13 passing tests, including local D1/R2 reads,
  owner scoping, unchanged bookmark database bytes, saved-run CLI replay, and
  evaluation resumption without credentials.
- `bun run typecheck:tag-classifier`: passed.
- `bun run --cwd packages/shared typecheck`: passed.
- `bun run --cwd packages/shared build`: passed.
- ESLint on the new shared core and CLI/test sources: passed.
- Prettier check on all changed sources/docs/config: passed.
- `bun install --frozen-lockfile`: passed.
- Actual sanitized local snapshot: 1,206 saved bookmarks listed; full article
  content read from local R2 with existing artifact verification.
- Catalog schema: 228 unique topic IDs and display names, each with a definition.

CI now runs the deterministic classifier checks. Hosted CI has not run for these
unpublished changes. This slice has no native UI changes; Simulator UI verification
is not a requirement for the read-only CLI and was not performed.

## Evaluation prepared before model output

The private local evaluation dataset is
`.local-data/tag-classifier/evaluation.json`. It contains 20 real bookmarks:
5 full-content, 2 partial-content, 11 description-only, and 2 metadata-only cases.
It covers articles, videos, podcasts, and posts, including incidental topic
references, sponsor boilerplate, and one cryptic title with no expected tags.
Labels were reviewed by the implementing agent before any Jev calls, not by an
independent human reviewer. Personal-library and technology-topic skew limit what
this sample can establish.

The prepared dataset's canonical JSON hash is:
`0caf65fb0ae729c9ba073a58fab5f06ca8a716e6b7812080cff79adbe15ca061`.

## Live evaluation

All 20 requests to `jev-1.13.0` succeeded and returned all 228 topic
probabilities. Dataset labels remained fixed at the hash above.

At the initial threshold of 0.8: 48 suggestions, 36 judged useful (75% precision),
and 17 of 41 expected tags recovered (41.5% recall). This misses the proposed
90% precision / 80% recall targets. Acceptable optional tags count toward
precision but are not required for recall.

| Threshold | Precision | Recall |
| --------- | --------- | ------ |
| 0.2       | 40.5%     | 92.7%  |
| 0.5       | 53.8%     | 65.9%  |
| 0.8       | 75.0%     | 41.5%  |
| 0.9       | 81.5%     | 34.1%  |
| 0.95      | 88.9%     | 29.3%  |

These are exploratory replays of the same saved probabilities, without further
API calls. None of these thresholds meets both targets. Do not treat threshold
selection on this sample as independent validation.

Reported input usage: 540,952 tokens. Estimated total cost: $0.02272 at the
configured $0.042 per million input tokens. This is a CLI estimate, not a billing
reconciliation. Median request latency: 291 ms; maximum: 525 ms. Latency excludes
local input preparation. Raw runs remain private under
`.local-data/tag-classifier/live-runs`.

Full articles attracted overly broad tags (for example decision-making,
knowledge-management, and strategy). Short descriptions and metadata often
produced no suggestions despite explicit topics in their titles. The cryptic
no-evidence case correctly produced no suggestions. Next investigation should
separate sufficient article evidence from title/description evidence, review
catalog overlap, and use a new independently reviewed holdout after changes.

## Credential setup

Secure storage was completed on 2026-10-04. The original Bitwarden HTTP 404
was explained by the existing `local-codex` machine account's read-only access.
The replacement key, `Zine local classifier — Bitwarden`, was saved through the
signed-in Bitwarden Web vault to `agent-local` as `TYPESAFE_API_KEY`. The old
TypeSafe key was deactivated. Machine-account permissions remain read-only.

The central catalog now allowlists only that key in `zine.classifier`.
`secretsctl doctor`, `metadata zine.classifier`, and `check zine.classifier`
passed. A fresh classification launched through `secretsctl run zine.classifier`
returned all 228 probabilities from `jev-1.13.0` in 521 ms, with estimated cost
$0.001185. Its private output is
`.local-data/tag-classifier/secure-storage-smoke.json`. The original evaluation
results above remain unchanged. Secret values were not saved to repository or
`.env` files, command history, or output.

The existing local machine-account token expires on 2026-10-15; future use after
that date requires its normal renewal. Saved-run replay/report require no key.

```sh
bun run tags:cli -- report --dataset .local-data/tag-classifier/evaluation.json --runs .local-data/tag-classifier/live-runs --threshold 0.8
```

No bookmark/tag writes, queues, native UI, or production mutations were added.
