# Auto-tagging tracer bullet

## Objective

A bookmark is enriched, classified against a versioned catalog, and receives
separate generated suggestions in native bookmark detail. Accepting a suggestion
assigns a user tag; dismissal remains durable. Saving never waits for classification.
Library filtering is outside this scope.

## Stages and completion evidence

- [x] Commit the existing read-only classifier experiment after repository gates.
- [x] Implement review labels: expected, acceptable, unwanted, unknown, aliases,
      alternative groups, and explicit completeness. Unknown is never wrong.
- [x] Implement provenance-aware transcript import and bounded sequential chunks;
      retain timestamps, coverage, hashes, and durable failures.
- [x] Compare description and transcript evidence on the four acquired episodes
      with the same frozen catalog/model/policy/threshold.
- [ ] Build a reproducible baseline comparison and regression report recording
      versions, input hashes, coverage, cost, latency, misses, and extras.
- [ ] Prepare at least forty unseen varied bookmarks for human labels before
      revealing model output. Independent labels are a required quality gate.
- [ ] Freeze and evaluate a candidate: >=90% reviewed-suggestion precision and >=80% expected-tag recovery, with per-coverage results, unwanted tags per
      bookmark, abstention, cost, and latency. Never promote on development scores.
- [ ] After the quality gate, implement enrichment-triggered background jobs,
      separate persistence, feature flag, retry/idempotency, user ownership,
      durable accept/dismiss and reclassification semantics.
- [ ] Extend existing Clerk-authenticated /api/v1 bookmark endpoints.
- [ ] Implement canonical native detail suggestions and accept/dismiss controls.
- [ ] Verify authenticated local save/enrich/suggest/accept/dismiss, refresh and
      relaunch, failure/empty states by direct Simulator interaction.
- [ ] Required checks and staged commits; ready PR/green CI; production rollout,
      merge, and physical device delivery require shipment authorization.

## Evaluation invariant

The existing twenty-case baseline and its original labels remain immutable.
Human review is development evidence, not an independent holdout. Unconfirmed
extras must not be counted as false positives. Catalog additions and changes on
existing tags must be reported separately. Once a holdout informs tuning, retire
it into development data and obtain fresh validation cases.

## Current evidence

See tag-classifier-validation.md and tag-classifier-experiment-v2.md. Four
transcripts are acquired privately with provenance; Sam Sulek and Maggie
Appleton caption downloads returned HTTP 429 twice. The four-episode transcript comparison is documented in tag-transcript-experiment.md.
Forty unseen cases are prepared with all human labels pending; no holdout inference
has run. No production integration or native UI evidence exists yet.

## Incremental verification

The classifier foundation is committed after all 100 Worker test files passed
individually in isolated runtimes. The default bulk runner exhausted local
loopback ports; single-runtime/no-isolation was rejected because it leaked mocks.
Web tests, repository lint/typecheck/build/format and focused classifier tests
passed. Local verification logs are under `.local-data/tag-classifier/`.

Caption acquisition is now a repository command with persisted failures.
The latest verification includes 28 focused classifier tests; human holdout
labels and production integration remain incomplete.
