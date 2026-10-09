# Transcript evidence experiment

The first comparison uses four previously reviewed episodes, the frozen 244-tag
catalog, Jev 1.13.0, policy 2, and threshold 0.8. Inputs and results are private
under `.local-data/tag-classifier/transcript-experiment-v1`.

```sh
secretsctl run zine.classifier -- bun scripts/tag-classifier/transcript-experiment.ts .local-data/tag-classifier/evaluation-v2.json .local-data/tag-classifier/transcripts .local-data/tag-classifier/transcript-experiment-v1
```

Every transcript segment is checked against the source text SHA-256 and included
in sequential chunks of at most 12,000 UTF-8 bytes. Chunk outputs retain source
timing where available. Captions preserve acquisition provenance and warnings;
publisher text without timestamps remains explicitly untimed. Compatible saved
runs resume without new calls. A manifest must match the dataset episode title
and video ID. Dataset/catalog/policy hashes and model compatibility are checked.

The initial aggregation requires a tag above threshold in at least two chunks
(or one for a single-chunk transcript). It is an experimental support rule,
not a calibrated probability of overall relevance. All individual probabilities
are retained to compare other rules without paying for classification again.
A topic confined to one chunk may be useful and missed by this rule; repeated
incidental mentions can still pass. No production choice is established yet.

## Observations

Thirty transcript chunks and four description calls succeeded for an estimated
$0.04544. Description inputs and transcript inputs use the same classifier.
The transcripts substantially broadened the candidate sets:

| Episode                     | Description tags | Transcript tags | Notable added candidates              |
| --------------------------- | ---------------: | --------------: | ------------------------------------- |
| Office-job health           |                2 |               5 | Longevity, User experience            |
| Rust                        |                5 |               6 | Type systems                          |
| DHH                         |                8 |              18 | Startups, Venture capital, Leadership |
| Data-intensive applications |                7 |              13 | Privacy, Ethics, Data pipelines       |

These are candidate counts, not accuracy scores. No human exhaustive transcript
labels have been collected. The result supports investigating richer evidence,
but does not prove better precision. Sam Sulek and Maggie Appleton remain outside
this comparison because YouTube returned caption rate limits. Holdout labels
must precede model output; the forty unseen cases are prepared separately.

## Review scoring

`packages/shared/src/tag-classifier/review.ts` separates expected alternative
groups, acceptable tags, explicit unwanted tags, and unknown extras. Aliases map
to canonical IDs and duplicate predictions are counted once. Review coverage
must accompany reviewed precision: 100% precision with many unknown suggestions
is not a release gate. Exhaustive review or zero unknowns is required to assess
precision for a candidate. Empty expected labels must not be used as negative
ground truth until a human actually confirms abstention.

## Repeatable caption acquisition

Create a source manifest containing public YouTube video IDs and titles:

```json
[{ "videoId": "q9xD36NCtZ8", "title": "Why Rust is different, with Alice Ryhl" }]
```

```sh
bun scripts/tag-classifier/captions.ts .local-data/tag-classifier/caption-sources.json .local-data/tag-classifier/transcripts
```

This command requests English uploaded captions or automatic captions using an
installed `yt-dlp`. It downloads no audio/video and reads no browser cookies.
Verified existing transcript JSON is reused, including publisher transcripts
acquired separately. New JSON3 imports preserve timing and Unicode text,
verify source identity, label ASR provenance, and record when the final caption
ends before the video's last five percent. That span check does not prove
verbatim accuracy or continuous caption coverage.

The manifest is saved after each source. Failure states distinguish rate limits,
missing captions, download errors, and invalid artifacts. Failures do not become
empty successful transcripts. Re-running retries missing sources while retaining
verified transcripts. Expiring media URLs from newly downloaded information
files are discarded after successful normalization; raw caption JSON remains.
