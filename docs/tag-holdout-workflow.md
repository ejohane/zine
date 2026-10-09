# Independent tagging holdout workflow

The forty unseen bookmarks are private local inputs under
`.local-data/tag-classifier/holdout-review.json`, with a readable companion
`holdout-review.md`. No model output has been generated for them.

## Label and freeze

A human labels each bookmark from the supplied evidence, sets `reviewed: true`,
and records canonical topic IDs in `expectedGroups`, `acceptable`, and `unwanted`.
Each expected group requires one of its members, allowing alternatives such as
principal/staff engineer. `exhaustive: false` leaves unnamed extras unknown;
use `true` only when all remaining catalog topics should count as unwanted.
A confirmed no-tags case has no expected groups and explicit human review.

```sh
bun scripts/tag-classifier/holdout.ts freeze .local-data/tag-classifier/holdout-review.json packages/shared/src/tag-classifier/catalog.json .local-data/tag-classifier/holdout-frozen.json
secretsctl run zine.classifier -- bun scripts/tag-classifier/holdout.ts eval .local-data/tag-classifier/holdout-frozen.json .local-data/tag-classifier/holdout-runs
```

Freeze requires at least forty unique reviewed cases, valid catalog IDs, and
consistent labels. It uses exclusive creation and cannot overwrite an existing
freeze. The snapshot binds labels, inputs, catalog, current policy, pinned model,
threshold, and freeze time. Compatible results resume; results predating label
freeze, or mismatched input/catalog/model/policy, fail. Expected labels are never
edited in response to outputs for the same independent validation run.

## Judge unknown extras

After inference, a second review can judge generated suggestions not covered by
initial labels. This affects precision judgments without changing expected
alternative groups or inputs. The supplemental file binds the frozen review hash:

```json
{
  "reviewHash": "HASH_FROM_FREEZE",
  "cases": [{ "bookmarkId": "BOOKMARK_ID", "useful": ["TAG_ID"], "unwanted": [] }]
}
```

```sh
secretsctl run zine.classifier -- bun scripts/tag-classifier/holdout.ts eval .local-data/tag-classifier/holdout-frozen.json .local-data/tag-classifier/holdout-runs .local-data/tag-classifier/holdout-extra-review.json
```

Supplemental judgments must reference selected tags, unique known bookmarks,
and the correct frozen hash. Contradictory labels fail. Replay reuses saved runs;
no new calls are needed. The report records both review hashes.

`quality-report.json` reports per-coverage and overall results, cost, latency,
unknown counts, unwanted suggestions per bookmark, and gate failures. The gate
requires forty reviewed cases, no unknown suggestions, >=90% precision and >=80%
expected-group recovery. Null metrics do not pass. This numerical gate alone is
not proof of independence: retain the review history and ensure cases were not
used in development or seen by the reviewer with prior model suggestions.

If results inform tuning, retire that holdout into development data and label a
new independent validation set. Do not tune the frozen threshold on a holdout
and keep calling its score independent. Production integration remains gated.
