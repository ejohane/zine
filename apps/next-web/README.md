# Zine Next — connected web experiment channel

Open **https://api-next.myzine.app/next/** and sign in with your existing Zine
account. Safari → Share → Add to Home Screen installs this as a PWA. The Mac and
Tailscale are no longer required for the connected experience.

The clean bento feed is the web experiment channel; native iOS remains the
production client direction. This app now uses the independent production `/v1`
API. Old bundled examples and local mock edits are not imported or used as a
fallback when the API fails.

## Connected behavior

- Real Clerk browser sign-in; `/v1/me` confirms the session subject before opening
  the library. No shared PAT, password or private API key is embedded in the app.
- Real saved items, source artwork, format queries and opaque cursor pagination.
- Durable save with context/tags/collection; a persisted idempotency key survives
  interrupted acknowledgement and reload. Deliberate later saves use a new key.
- Item detail, notes, position, completion, archive and collection membership use
  real API operations. UI success follows server confirmation/readback.
- Retained article/transcript/thread text is fetched on request and rendered as
  text with its coverage/provenance. Originals and playback remain at the source.
- IndexedDB stores recently loaded sections, opened details and retained text per
  account. Offline writes are disabled. Sign-out clears private data; account
  changes clear the previous account's cache. Shell caching never includes API or
  authentication responses. Source artwork/media may need a connection.
- Source processing is asynchronous. A durable save is not a promise of extraction
  or AI success. Pending, processing, failed and unavailable states remain explicit.

## Hosting boundary

`wrangler.jsonc` deploys the **separate `zine-next-web` asset Worker**, routed only
at `api-next.myzine.app/next*`. The API Worker, database, queues and existing auth
policy are untouched. The service worker and manifest have `/next/` scope, so
neither can control the API Inspector or `/v1` requests. All private data remains
behind the existing Clerk/API authentication boundary.

Using the API's existing production origin keeps Clerk session authorization and
CORS unchanged. The public shell contains no library snapshot. The old Tailscale
preview now offers a link to the connected app rather than attempting production
sign-in from an unconfigured domain.

## Development and deployment

From the repo root:

```sh
bun install
bun run --cwd apps/next-web test
bun run --cwd apps/next-web lint
bun run --cwd apps/next-web build
bunx wrangler@4.158.0 deploy --config apps/next-web/wrangler.jsonc
```

`bun run --cwd apps/next-web dev` runs Vite at `/next/` on localhost:5194.
Production Clerk sign-in is intentionally limited to the production origin; a
local runtime shows a link to the connected app. Never bypass auth to make local
manual verification pass. Transport tests inject responses only in isolated tests.

Reference-only native fixtures/artwork remain in source for design comparison;
`sync:native` refreshes those explicitly. They do not supply connected runtime data
and bundled reference artwork is removed from the production shell.

See [CONNECTED_VERIFICATION.md](CONNECTED_VERIFICATION.md) for current production
acceptance and the distinction between browser evidence and physical-phone proof.
