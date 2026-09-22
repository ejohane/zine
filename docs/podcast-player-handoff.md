# Podcast player destinations

Native Settings includes a device-local default podcast app (Overcast, Pocket Casts,
Apple Podcasts; default Overcast). This preference applies to RSS podcast items.
Existing player share links continue opening in their original app, including timestamps.

Player destinations are saved on each RSS podcast item in `items.podcast_destinations`.
Normal bookmark, Inbox, and Home responses include the public `podcastDestinations`
map; the native app persists it in its existing bookmark/Home caches. Selecting a
player or opening detail makes no destination request and never disables the circle
button. Missing or invalid links immediately fall back to the original bookmark URL.

The existing bookmark enrichment consumer resolves all three players, independent
of the user's preference. The existing five-minute maintenance tick also processes
up to ten due RSS podcast items, covering unsaved Inbox items and old bookmarks.
Missing links retry hourly for six attempts, then daily. Successful links survive
other provider failures. Apple/Pocket show fallbacks can upgrade to episode links;
completed destinations need no periodic revalidation. RSS ingestion does not wait
for this work. No new queue, show-identity registry, or account setting is needed.

The older authenticated `GET /api/v1/bookmarks/{id}/podcast-destination` endpoint
remains available for older app versions. It checks ownership before lookup. The
current native button does not call it.

Apple catalogs must match the followed feed; episodes match by raw GUID or enclosure.
Pocket Casts candidates match the show name plus exact enclosure, with ambiguous matches
rejected. Public catalog results are cached in CREATOR_CONTENT_CACHE under a dedicated
feed/player key for one hour, retained up to seven days for stale fallback. Empty results
and failures suppress further lookups for five minutes. Directory requests are bounded
and identify Zine with a User-Agent (Pocket Casts rejected an absent User-Agent in live testing).
Resolution runs separately when opening detail and never blocks Inbox ingestion.

Overcast uses `https://overcast.fm/+itunes{appleShowID}` after verifying the Apple
show against the RSS feed. Its published Universal Links association includes this
route; a website 404 does not describe its native behavior. The user verified that
it opens the correct show on iPhone. We label it **Open show in Overcast**, not an
exact episode action. No subscribe prompt is generated when resolution fails.
The catalog cache namespace is v2 to discard old subscribe destinations.

RSS podcast detail uses the existing 56-point circular action in the action row.
Its provider icon/color and accessible label track the device's preferred player.
There is no lookup spinner. App-opening failures offer the original link; a long
press also exposes that link. Original player share links remain intact.

Native episode/show actions use Universal Links only; if the app cannot handle the URL,
the UI offers the publisher page rather than silently opening a browser/login page.
Opening a destination records an open only after the system accepts the request.
It never marks an episode listened or finished.

## Verification

- Deterministic Worker resolver, metadata, and authenticated REST/D1 integration tests.
- Native CLI/core tests cover destination labels, host validation, and original-player recognition.
- A temporary read-only live test resolved the saved Huberman Arthur Brooks episode using
  actual directory responses: Apple/Pocket Casts exact episode. The user subsequently
  verified both player handoffs and the Overcast +itunes show route on iPhone.
- Native Simulator build passed. Live authenticated UI remains blocked by the pre-existing
  local snapshot import trying to reapply `0001_add_user_items_last_opened_at.sql`.
- Physical-device third-party opening remains unverified. Before release acceptance, test
  the circular action with each selected player, Overcast show opening,
  missing-app fallback, and Settings persistence. Test settings/detail in light and dark mode.

Sources: https://overcast.fm/podcasterinfo,
https://overcast.fm/apple-app-site-association,
https://pocketcasts.com/for-llms,
https://pocketcasts.com/openapi.json.
