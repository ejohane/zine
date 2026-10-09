# Public Sharing implementation handoff

Implementation is available for integration in the shared checkout. Nothing committed,
shipped or deployed. External delivery proof remains separate from local code completion.

## Delivered

- Complete anonymous server-rendered issue and publication/archive pages on /i/:id and
  /p/:id, with native Zine typography, editorial commentary, ordered selections,
  original-source links, publication/editor identity and cover support.
- Strict public DTO parsing and anonymous upstream reads; unavailable404 vs transient503;
  no-store HTML/API, stable canonical URLs, escaped bootstrap/metadata and safe links.
- Open Graph/Twitter metadata and1200x630 existing-brand fallback image, dynamic production
  and preview Worker hosting, AASA configured from signed app identifier and scoped paths.
- Clerk Save/Subscribe continuation with expiring validated session intent, safe return
  routes, explicit user action, selection validation, bearer REST and idempotent retries.
- Same-origin API/media proxy and local Vite proxy; production-bound previews reject
  writes. Public routes/API/public images excluded from stale service-worker fallback.
- Archive pagination works as links without JavaScript and incrementally with JavaScript;
  accessible loading/success/error/busy states and dedicated Storybook scenarios.

## Verification

- Web lint and typecheck pass.
- Full web unit suite:105 Vitest +4 Bun policy tests pass.
- Production build and Wrangler deployment dry-run pass; no deployment performed.
- Built dynamic-host browser tests:3 pass, including hydration without page errors,
  desktop/mobile overflow checks, axe scan, source/archive links, no JavaScript and404.
- Storybook build and all10 browser accessibility/visual checks pass.
- Existing web smoke tests:6 pass (isolated fixtures, no auth-runtime claim).
- Changed public code passes Prettier check. Impeccable mechanical detector reports[].

## Remaining external/live evidence

Integration supplies persisted local issue01M4DRW8Z0MA5REGC6MGRKX550 and publication
01M4DHSN4ZTBXX9CV32S2P6RNF. Local dynamic web host45274 points at Integration8785.
Persisted anonymous issue and publication archive observed through computer use on desktop
and390x844 phone width; issue to archive and back navigation succeeds. Metadata host
returns200, configured AASA returns200. Explicit Save navigates to the typed sign-in
continuation URL; real login stops at CONFIGURATION REQUIRED because this build has
no VITE_CLERK_PUBLISHABLE_KEY. No auth bypass was used.
Real browser Clerk completion needs approved local-origin Clerk configuration;
unit tests prove routing/action logic but do not prove real Clerk login.
Native universal links require signed app identifier/domain association and installed
app evidence; real iMessage link-card rendering requires deployed host and device evidence.
No messages have been sent. Native/APNs/real chat evidence is not claimed here.

## Configuration and repeatable checks

Production main is src/public-worker.ts with ASSETS and zine-worker-production API
service. APPLE_APPLICATION_IDENTIFIER currently uses candidateTRA7965NM5.app.zine.native;
confirm against the actual signed app before release. Preview remains read-only until
its backend is isolated. Commands from apps/web:

- bun run lint; bun run typecheck; bun run test
- bun run test:publications
- bun run storybook:test
- bun run test:e2e
- bunx wrangler deploy --dry-run --outdir /tmp/zine-public-sharing-bundle

Local dynamic host command (separate state/port; requires Integration local Worker):

    bunx wrangler dev --local --port 45274 --inspector-port 9424 \
      --persist-to /tmp/zine-public-sharing-state \
      --var UPSTREAM_API_URL:http://localhost:8785 \
      --var APPLE_APPLICATION_IDENTIFIER:TRA7965NM5.app.zine.native
