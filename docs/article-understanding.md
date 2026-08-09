# Article understanding foundation

Article understanding is the semantic substrate for search, recommendations, and generated
collections. It is intentionally downstream of article-body acquisition: a model output cannot be
more trustworthy than the source material it actually received.

## Invariants

- Understanding is keyed by the current article-body `contentHash`, not an R2 key or mutable item
  metadata alone.
- Every enrichment states its source coverage: `FULL_CONTENT`, `PARTIAL_CONTENT`,
  `DESCRIPTION_ONLY`, or `METADATA_ONLY`.
- Versioned article-body artifacts are preferred. Legacy HTML is accepted only as partial,
  unnormalized evidence.
- Full and partial bodies are processed from beginning to end in bounded semantic chunks. The
  first few thousand characters are never treated as a proxy for the complete document.
- Claims, concepts, questions, perspective, audience, prerequisites, and takeaways retain the
  article block IDs that support them. The visible `block:` marker prefix is canonicalized;
  unsupported model-supplied IDs are rejected rather than silently degrading to summary-only data.
- Substantive chunks must contain supported claims, concepts, and actionable takeaways. A summary
  alone is not considered successful understanding.
- The document embedding represents the synthesized article. Chunk embeddings cover the complete
  source so a secondary idea late in an article remains retrievable.
- A changed body hash creates new understanding and versioned chunk vector IDs. Stale chunk vectors
  for that same visibility scope are removed.

## Pipeline

1. Article-body acquisition publishes an immutable, quality-scored artifact.
2. Publication queues enrichment for every user who currently has the canonical item bookmarked.
3. Enrichment resolves the current artifact and recomputes its input identity with the artifact
   hash.
4. Semantic blocks are grouped into bounded chunks without dropping oversized blocks or article
   endings.
5. Workers AI extracts evidence-backed notes for each chunk.
6. Existing canonical enrichment fields are synthesized from the complete set of chunk notes.
7. Document and chunk embeddings are written before the canonical enrichment is marked complete.
8. The enrichment API exposes source provenance and the evidence-bearing understanding record.

Deep article extraction and synthesis use `ARTICLE_UNDERSTANDING_MODEL`, independently of the
lighter bookmark-enrichment and daily-overview model. The selected deployment candidate is
`@cf/qwen/qwen3-30b-a3b-fp8`, selected after two repeated read-only evaluations of the same two
production article hashes. It captured all five human-reviewed ideas in the design-system article
on both accepted runs and four then five of five in the Sierra article. This is an acceptance probe,
not a claim of corpus-wide recommendation quality.

`ARTICLE_UNDERSTANDING_MODE` controls rollout independently of model selection:

- `off` keeps the lightweight enrichment path and never runs deep understanding.
- `backfill_only` runs deep understanding only for explicit enrichment backfill messages and does
  not automatically enqueue understanding when a new article body is published.
- `all` enables deep understanding for every eligible enrichment trigger.

Missing or invalid values fail closed to `off`. Development and staging use `all`; the initial
production configuration uses `backfill_only` for a bounded, explicit canary.

Use the authenticated enrichment backfill route with `eligibleArticlesOnly: true` to restrict a
canary to saved articles that have a current `AVAILABLE` or `DEGRADED` article body. Start with a
dry run and keep the same filter when enqueueing the reviewed page:

```json
{
  "dryRun": true,
  "eligibleArticlesOnly": true,
  "limit": 10
}
```

The option defaults to `false`, so existing general enrichment backfills retain their current
selection behavior.

Description-only and metadata-only items continue through the existing lightweight enrichment
path. Their coverage remains explicit so later collection ranking can require deep understanding or
degrade honestly. While schema-v3 backfill progresses, enrichment reads retain the latest older
schema as an explicit, versioned fallback so existing summaries do not disappear.

## Deliberate boundary

This phase does not generate collections and does not claim recommendation quality. The next gate is
an evaluated article corpus: natural-language retrieval should materially outperform the current
metadata-and-summary baseline, and sampled claims must resolve to supporting article blocks.
