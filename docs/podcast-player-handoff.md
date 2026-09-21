# Podcast player destinations

Native Settings includes a device-local default podcast app (Overcast, Pocket Casts,
Apple Podcasts; default Overcast). This preference applies to RSS podcast items.
Existing player share links continue opening in their original app, including timestamps.

`GET /api/v1/bookmarks/{id}/podcast-destination?player=OVERCAST|APPLE_PODCASTS|POCKET_CASTS`
requires bookmark-read authorization and checks user ownership before accessing feed
context. It returns the original URL, publisher URL, and a separate optional destination.
It does not update content identity, saved links, consumption events, or RSS polling.

Apple catalogs must match the followed feed; episodes match by raw GUID or enclosure.
Pocket Casts candidates match the show name plus exact enclosure, with ambiguous matches
rejected. Public catalog results are cached in CREATOR_CONTENT_CACHE under a dedicated
feed/player key for one hour, retained up to seven days for stale fallback. Empty results
and failures suppress further lookups for five minutes. Directory requests are bounded
and identify Zine with a User-Agent (Pocket Casts rejected an absent User-Agent in live testing).
Resolution runs separately when opening detail and never blocks Inbox ingestion.

Overcast's published Universal Links paths cover `/+*`, not its documented `/itunes…`
web show URLs. Those URLs cannot safely be presented as a native "Open show" action.
For RSS items we use the documented `overcast://x-callback-url/add?url=…` scheme, explicitly
labelled **Add show to Overcast**, with text explaining that it is an add-feed prompt,
not an exact-episode destination. Known original Overcast episode links remain intact.

Native episode/show actions use Universal Links only; if the app cannot handle the URL,
the UI offers the publisher page rather than silently opening a browser/login page.
Opening a destination records an open only after the system accepts the request.
It never marks an episode listened or finished.

## Verification

- Deterministic Worker resolver, metadata, and authenticated REST/D1 integration tests.
- Native CLI/core tests cover destination labels, host validation, and original-player recognition.
- A temporary read-only live test resolved the saved Huberman Arthur Brooks episode using
  actual directory responses: Apple/Pocket Casts exact episode and Overcast subscribe prompt.
- Native Simulator build passed. Live authenticated UI remains blocked by the pre-existing
  local snapshot import trying to reapply `0001_add_user_items_last_opened_at.sql`.
- Physical-device third-party opening remains unverified. Before release acceptance, test
  Overcast with the feed already followed and not followed, Apple/Pocket Casts exact opening,
  missing-app fallback, and Settings persistence. Test settings/detail in light and dark mode.

Sources: https://overcast.fm/podcasterinfo,
https://overcast.fm/apple-app-site-association,
https://pocketcasts.com/for-llms,
https://pocketcasts.com/openapi.json.
