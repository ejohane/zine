# Article-body extraction quality (phase 2a)

Phase 2a supplied and measured article-body acquisition without automatically enrolling production items. Phase 2b subsequently added the protected bounded backfill, and Phase 3 adds the independently controlled product enrollment ladder documented in [Native article reader beta](./article-reader-beta.md).

## Acquisition cascade

1. Evaluate full-body candidates retained from RSS `content:encoded`, RSS `content`/`description`, Atom `content`, Atom `summary`, or a public newsletter payload.
2. If an embedded candidate is high quality, use it without fetching the public page.
3. If embedded content is missing, rejected, or merely degraded, fetch the canonical public page and run Readability.
4. Select the highest-quality acceptable result. Preserve a degraded embedded result when public fetching fails.
5. Normalize and sanitize the selected body, compute exact word and reading-time metrics, and build the phase-one immutable artifact.

Public acquisition accepts only HTTP(S), rejects credentialed and local/private destinations, follows at most five redirects while validating every hop before fetching it, requires HTML, enforces a five-megabyte response ceiling, and uses a twelve-second timeout.

## Normalization and quality

Normalization removes active and navigation markup, strips unapproved attributes, resolves safe relative links and images, blocks non-HTTP URLs, generates plain text and semantic blocks, and computes Unicode-aware word counts.

Quality scoring distinguishes:

- substantial structured bodies;
- short or very short bodies;
- likely truncated feed teasers;
- high-link-density or boilerplate-heavy pages;
- title mismatches;
- unsafe markup that was removed during normalization.

Only bodies with at least 120 words and a score of at least 0.70 are `AVAILABLE`. Bodies with at least 40 words and a score of at least 0.35 are retained as `DEGRADED`; weaker candidates are rejected.

## Repeatable review corpus

Run:

```sh
bun run article-body:review
```

The checked-in manifest contains 20 current Zine-shaped cases covering RSS, Atom, ordinary public pages, Medium feeds, and Substack pages. The runner fetches the latest entry from feed cases, exercises the complete cascade, and writes gitignored JSON and Markdown reports under `.local-data/article-body/reviews/`.

The automated gate requires:

- at least 90% of cases to produce an available or degraded body;
- at least 95% of produced bodies to be high-quality `AVAILABLE` results.

The Markdown report includes beginning, middle, and ending samples for human checks of topicality, continuity, truncation, and trailing boilerplate. Passing the automated gate does not replace that reading review.

## Phase boundary

Phase 2a did not publish artifacts, create queues remotely, apply production migrations, or change live extraction behavior. Phase 2b adapted this function into the queue processor and provided a dry-run-first bounded cohort endpoint. Phase 3 adds native reader demand, saved-bookmark, and new-RSS-entry enrollment behind an explicit staged mode; historical bulk enrollment remains outside that product path.
