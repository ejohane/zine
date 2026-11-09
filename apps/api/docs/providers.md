# Provider acceptance matrix

All rows are required unless a platform restriction is demonstrated and explicitly
recorded. Instagram, topic subscription filtering and broad history imports are
deferred. A URL save alone does not establish provider support.

| Provider | Capture and identity                              | Rich information                                                                                              | Subscriptions                                                                         | Required live proof                                                                                                    |
| -------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| YouTube  | Video, shorts, channel, playlist; URL aliases     | Video/channel metadata, duration, descriptions, links, chapters, available timed captions, collection members | Channel uploads, explicit playlist route; format selection where reliably observable  | Real save, timed material when available, latest matching intake, repeated sync, pagination, restricted-caption status |
| Spotify  | Episode, show, track, album, playlist             | Metadata, creators, duration, artwork, descriptions, members, available transcript information                | Shows, supported artist/playlist sources with explicit item semantics                 | Real episode/music/collection, show intake, pagination, credential refresh/rate-limit behavior                         |
| X        | Post, thread context, profile, list               | Full available text, author, media references, quoted/parent context, relationships                           | Account/list timelines with supported format selection                                | Real post/thread, source intake, pagination, no duplicate context items                                                |
| Substack | Post, publication, section/feed                   | Article/newsletter metadata, accessible body, author, publication, embedded media                             | Publication or section feeds; recognize custom-domain publications                    | Real public article, feed discovery/intake, accessible vs restricted body                                              |
| Websites | Arbitrary public HTTP(S) page                     | Metadata, canonical hints, readable text, structured information, feed discovery                              | Discoverable RSS/Atom/JSON feed or explicit supported publication mechanism           | Real varied articles, extraction fidelity, redirects, unsafe URL rejection, unavailable source                         |
| RSS      | RSS 2, Atom, JSON Feed; feed and entry identities | Title, author, body/summary, dates, enclosures, transcript references, source                                 | Feed polling, latest matching initial item, future entries, pagination where provided | Real feeds, podcast enclosure, repeated intake, format filters, conditional retrieval/recovery                         |

## Primary references consulted

- [YouTube playlist items](https://developers.google.com/youtube/v3/docs/playlistItems/list)
- [YouTube captions](https://developers.google.com/youtube/v3/docs/captions/list):
  caption listing/download is separately authorized; arbitrary public-video
  transcripts are not guaranteed by a metadata API key.
- [Spotify episode](https://developer.spotify.com/documentation/web-api/reference/get-an-episode)
- [Spotify authorization](https://developer.spotify.com/documentation/web-api/concepts/authorization)
- [X post lookup](https://docs.x.com/x-api/posts/lookup/introduction)
- [RSS specification](https://www.rssboard.org/rss-specification)
- [Atom](https://www.rfc-editor.org/rfc/rfc4287)
- [JSON Feed](https://www.jsonfeed.org/version/1.1/)
- [D1 atomic batch](https://developers.cloudflare.com/d1/worker-api/d1-database/)

Provider capability/access probes and actual verified outcomes belong in the
verification ledger. This matrix is the target, not a claim of current support.

## Recorded live outcomes

All six provider families have original-library references retained remotely and
new source extraction examples. Counts are independently recorded in
`../evidence/corpus-health.json`; imported titles are excluded from its fresh-title
count. The following boundaries apply:

- Spotify: actual episodes, shows, music, album members, public playlist members,
  two 50-episode source pages, review-first intake and repeat polling. A curated
  playlist returned a provider restriction while the public documentation sample
  worked. Client credentials are independently provisioned.
- X: actual full post/thread contributions, account intake and duplicate-free
  repeated polling. Stable provider IDs survive source resolution. Context is
  bounded to 20 ancestors/quotes and available recent authored replies; the API
  does not claim a complete conversation archive.
- Substack: actual article extraction, publication feed discovery, latest matching
  intake and repeat polling. Existing saved items retain their decision when
  rediscovered by a new subscription. Some corpus articles encounter rate limits;
  restricted/paywalled material is represented explicitly.
- Websites: actual readable articles, retained article export, metadata and feed
  discovery. Public access restrictions remain per-component outcomes. SSRF,
  redirects, size bounds and unsupported MIME/challenge handling have controlled
  runtime coverage.
- RSS: actual feed intake and podcast enclosure/reference handling, including a
  128-cue timed publisher transcript and duplicate-free repeat polling. RSS 2,
  Atom, JSON Feed, VTT/SRT/JSON/XML/HTML/plain transcripts and conditional retrieval
  have deterministic parser/runtime coverage; every format is not claimed as a
  separately observed live source.
- YouTube: actual public video metadata extraction across the copied corpus,
  channel-feed initialization and duplicate-free repeated synchronization, retained
  feed descriptions/artwork, explicit caption-unavailable outcomes, and optional
  official API integration. Public feeds, watch pages and official API access use
  separate budgets; a watch-page restriction does not disable feed intake.
  Account-authorized channel/playlist pagination is implemented and locally tested,
  but live verification requires a usable Google grant or YouTube Data API key.
  Public-page success is not proof of authorized API access or available captions.

Instagram remains deferred. No source-edit monitoring, broad historical intake,
comment archives, topic filters or automatic platform-collection member saving
have been added to the agreed scope.
