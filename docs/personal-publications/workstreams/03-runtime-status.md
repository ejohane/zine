# Public Sharing runtime status

Status: implementing October 8, 2026. Owner: Public Sharing chat.

## Definition of done

- Anonymous issue and publication/archive pages render complete readable server HTML,
  original links, covers/fallbacks, commentary and identity without Clerk or JavaScript.
- Stable /p/:id and /i/:id routes provide escaped canonical/Open Graph/Twitter metadata,
  useful cover fallback, no-store unavailable/error handling, and no private draft leak.
- Dynamic production/preview hosting uses explicit safe API binding, handles AASA and
  build asset manifests, and excludes public content from stale PWA caches.
- Save/Subscribe use real Clerk session REST and typed expiring action continuation,
  with idempotency, no mutations from GET/render, retry states and safe redirects.
- Publication pagination, mobile/accessibility states and meaningful tests/Storybook
  coverage pass along with web lint/typecheck/build and applicable browser checks.
- Actual local dynamic HTML/browser journey is observed; real Clerk/auth continuation,
  native universal links and real iMessage preview evidence reported separately. Missing
  hosted/credential/phone prerequisites are incomplete evidence, never passed.

## File claims

All apps/web public reader, app/auth/main integration, vite/workbox and Wrangler configs.
New public-worker.ts and public-publications modules. No central backend edits.

## Interfaces for Integration and Native

- Canonical public links https://myzine.app/p/:publicationId and /i/:issueId.
- Native owns applinks:myzine.app and native routing; web AASA restricts /p/_ /i/_.
- Delivery supplies POST /api/v1/issues/:id/selections/:selectionId/save with bearer and
  Idempotency-Key; Foundation PUT /api/v1/publications/:id/subscription exists.
- Public server fetches strictly anonymous Foundation DTOs, never passes caller cookies
  or authorization to those reads. Relative cover URLs resolve on same-origin API proxy.
- Production media provisioning/APNs are outside this stream. Preview config currently
  points to production; no verification mutations against it.

## Checks and blockers

Implementation in progress. Local Clerk approved-origin configuration not verified.
Real iMessage/hosted universal-link proof requires later explicit manual/device evidence.

## Implementation available to integrate

Public reader/server host and Clerk continuation now in apps/web. API requests are
same-origin /api/v1 via web Worker service binding, with bearer/Idempotency-Key forwarding.
Foundation relative cover URLs are served through same proxy. Public HTML uses existing
built index.html script/CSS names, hydrates the same reader after load, and has no-store
responses; archive cursor links work without JS. /p and /i bypass PWA caching.

AASA uses APPLE_APPLICATION_IDENTIFIER (production candidate TRA7965NM5.app.zine.native;
release must verify signed app). Native should associate myzine.app and recognize /p,/i.
Preview PREVIEW_READ_ONLY=true rejects writes, preserving production-bound preview safety.

Web lint/typecheck pass. Web suite: 104 Vitest + 4 Bun policy tests pass (pre-existing
Radix Dialog accessibility warnings remain). Build/hosting dry-run and browser checks
in progress. Awaiting integrated Worker/live sample issue for actual authenticated
local end-to-end browser verification; no root stack started from this stream.

## Live verification coordination

Integration stack detected active on8785; I reserve dynamic web host45274 and inspector9424,
with separate temporary web state. Will bind API to local zine-worker and explicitly
set UPSTREAM_API_URL=http://localhost:8785. Waiting for Integration's published sample ID.
No need for public-host production writes. Isolated fixture host45273 runs only during
browser tests. Native app identifier is a configuration candidate until signed proof.

Dynamic host live and connected on http://localhost:45274 (session30757; inspector9424),
backed by Integration local Worker8785. Nonexistent issue produces real404 server HTML.
Do not stop other sessions. Waiting for real sample ID to observe persisted anonymous reader.
Public-host isolated browser tests all3 pass (render/hydration, responsive+axe, no-JS,
archive/source links and actual404). Hydration regression discovered/fixed by using
renderToString rather than static markup. Link contrast uses existing --inline-link role.
Build and Wrangler dry-run pass; Storybook build passes. Full web tests105 pending final
small auth-continuation coverage addition. Public-host test runner: bun run --cwd apps/web
test:publications. External real Clerk origin and iMessage/device evidence remain pending.

Final web checks: lint/typecheck pass;105 Vitest +4 Bun tests pass. Integrated sample
ID received01M4DRW8Z0MA5REGC6MGRKX550, but Worker8785 is currently unreachable
(curl connection refused), so45274 correctly returns503. Please restart owned backend
when safe for persisted anonymous browser proof. Public web host45274 remains running.
Added development /api/v1 proxy using configured VITE_API_URL for same-origin actions.

## Terminal handoff

Public sharing implementation complete for integration. All web checks pass:105Vitest,
4Bun,3dynamic-host browser,10Storybook browser and6existing smoke tests. Live persisted
issue and archive observed via computer use at desktop and390x844, including archive
navigation. Save reaches valid sign-in continuation; actual browser login blocked by
missing build VITE_CLERK_PUBLISHABLE_KEY. AASA and real issue HTML return200.
Completion details in03-public-sharing-completion.md. Own generated Storybook/test
artifacts removed after checks; no production writes/messages/deploy/commit.

After verification, stopped own dynamic web Wrangler42534 (port45274/inspector9424).
Integration backend/Simulator remain owned by Integration and untouched. Restart command
is in the completion handoff if needed.
