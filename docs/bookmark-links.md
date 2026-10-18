# Bookmark links

Canonical bookmark links use `https://myzine.app/item/<bookmarkId>`.
`https://www.myzine.app/item/<bookmarkId>` and `zine://item/<bookmarkId>` are
also recognized by the native app. IDs are account-owned `user_items.id`
values, never global item IDs. Supported native IDs contain 1–128 ASCII letters,
digits, hyphens or underscores. Authentication callback URLs remain separate.

The native app queues an incoming bookmark destination above the sign-in view.
After authentication and any source onboarding, it fetches the bookmark through
`GET /api/v1/bookmarks/:id` using the current Clerk session, switches to Library,
and pushes the existing bookmark detail. New links supersede an in-flight older
link; cancellation/sign-out cannot push a stale result into another session.
Unavailable bookmarks and failed requests show an error. Links carry no access
token and confer no access to someone else's bookmark.

The production web Worker serves Apple association JSON at
`/.well-known/apple-app-site-association` and `/apple-app-site-association`.
It associates `/item/*` with `TRA7965NM5.app.zine.native`, matching the checked-in
team and bundle ID. Both canonical domains are in the app's `applinks`
entitlements. Preview hosts deliberately keep their previous association behavior.

Without an app handoff, `/item/:bookmarkId` opens the existing authenticated web
bookmark detail. Signed-out web users carry a `returnTo` path through sign-in or
sign-up. Only an exact local bookmark path can override the normal destination;
external URLs, fragments, query strings and traversal paths are rejected.

MCP search/show/read results include `zineUrl`, `nativeUrl` and `originalUrl`.
Save results include the same destinations for the resulting account bookmark.
The existing `url` field retains its original-source meaning. Card clicks still
open the original source; the model can offer `zineUrl` when asked to open in Zine.
Use HTTPS links in ChatGPT; custom-scheme handoff varies by host.

## Activation and acceptance

These changes need coordinated deployment; the existing live release and
installed phone app do not acquire them from source changes alone:

1. Deploy the web Worker containing the association response and web auth return.
2. Deploy the MCP Worker, preserving Dashboard authentication variables with
   `--keep-vars`, then refresh ChatGPT's tools.
3. Build/sign/install an updated native app with the new associated-domain
   entitlements. Verify the signed app identity matches the association document.
4. On a physical iPhone, tap a canonical HTTPS link from another app. Apple
   association caching and the originating app's link handling affect handoff.
   Test cold/warm launch, signed-out sign-in return, repeat links, deleted IDs,
   another account's IDs and OAuth callbacks. A Simulator custom-scheme launch
   does not prove Universal Link association or physical-device behavior.
5. Check the HTTPS browser fallback signed out and signed in, and verify that
   an inaccessible bookmark exposes no private content.

The native Simulator build installed and launched with the app and extension API
verified as `http://localhost:8780`. Full native core tests and deterministic
CLI scenarios passed; 80 MCP tests, 102 web unit/component tests and six web
smoke tests passed. Web/MCP lint, typecheck and production bundles passed.
Universal Link association has not been verified on a signed physical build.

Automated coverage includes native URL parsing, rejection of malformed and
untrusted destinations, MCP account isolation and link metadata, public
association routing, and safe web auth destination preservation. Local native
acceptance currently cannot finish: snapshot provisioning hits a pre-existing
`0034_add_tag_suggestions.sql` table conflict, and Bitwarden credential access
fails. Do not replace this evidence with auth bypass or a production API target.
