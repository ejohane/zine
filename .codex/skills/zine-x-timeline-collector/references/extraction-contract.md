# Extraction contract

Use the repository extractor at `apps/x-collector/src/browser-extractor.mjs`. It reads currently mounted `article[data-testid="tweet"]` elements and returns:

```js
{
  posts: XPost[],
  items: Array<Omit<XTimelineItem, "position">>,
  excludedAds: number,
  adKeys: string[]
}
```

## Browser state

- Collect only after the X Home page visibly shows the active Following tab.
- X virtualizes the timeline. Extract visible/mounted cards before every scroll.
- Keep deduplication state outside the page because mounted cards are recycled.
- Pass the previously returned ad keys into the next extractor call so recycled ads are counted once.
- Scroll one viewport at a time. Large jumps can skip cards.

## Primary versus referenced posts

Each timeline card contributes at most one primary `item`. Its canonical post appears in `posts`.

A visible quoted post may contribute another canonical post and a `QUOTE_OF` relationship, but it does not contribute another timeline item or count toward N.

X renders a repost as the original tweet plus social context. Store the original tweet once and set the timeline item's `presentation` to `REPOST`, with `repostedBy` when visible.

## Ads

The extractor rejects cards with promoted, sponsored, or ad markers outside the tweet text. It keeps page-level state so the same mounted ad is counted only once. Do not weaken this filter to reach N.

## Partial completion

Use `PARTIAL` when the requested number cannot be reached. Valid concise reasons include:

- `timeline_stalled`
- `x_rate_limited`
- `browser_disconnected`
- `x_auth_required`
- `collector_error: <short message>`

The receiver retains and uploads every successfully collected item before the failure.

## Local receiver API

- `GET /session` returns run identity and current counts.
- `POST /batch` accepts `{ posts, items, excludedAds }`.
- `POST /complete` accepts `{ status, failureReason }` and performs the verified Cloudflare upload.

The receiver binds only to `127.0.0.1` and keeps the Zine PAT out of the X page context.
