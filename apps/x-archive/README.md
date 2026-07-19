# X Archive

The X archive stores each canonical post once in R2 and keeps searchable run, post, relationship,
and outbound-link indexes in D1.

## Outbound link contract

Schema version 2 adds `post.links`. The field defaults to an empty array, so version 1 collector
payloads and previously archived posts remain valid.

Each link contains:

- `url`: the best destination exposed by X's rendered DOM (sometimes still a `t.co` URL)
- `normalizedUrl`: the comparison key after removing the fragment and known tracking parameters
- `displayUrl`: X's human-readable URL text, when available
- `redirectUrl`: the observed redirect URL when the DOM also exposed a better destination
- `source`: `TEXT` or `CARD`
- `card`: optional title, description, domain, and image metadata

When a canonical post is captured again, newly observed links and card fields enrich the existing
record. A sparse later DOM capture does not erase destinations already stored for that post.

Migration `0001_post_links.sql` adds `x_posts.links_json` for direct post readback and the indexed
`x_post_links` table for normalized-destination queries.

## Readback

- `GET /api/v1/x-timeline/runs/:runId` includes `post.links` for every timeline item.
- `GET /api/v1/x-timeline/posts/:tweetId` and the paginated posts route include `links`.
- `GET /api/v1/x-timeline/links` returns indexed link occurrences with their canonical post.
  It accepts optional `runId`, `normalizedUrl`, and `limit` query parameters.

All `/api` routes require a PAT with the existing `x-archive:read` or `x-archive:write` scope.
