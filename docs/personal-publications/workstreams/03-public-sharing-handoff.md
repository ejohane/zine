# Public sharing: implementation handoff

Status: assigned workstream 3; implementation-ready planning, inspected October 8, 2026. Product decisions and the approved REST contracts remain authoritative. No
runtime changes, deployment, authentication, or phone verification were performed
for this handoff.

## Outcome and ownership

Own the anonymous reader journey: an editor sends an issue link through iMessage;
a recipient reads the issue without authentication, follows originals, and can sign
in to save a particular selection or subscribe to its publication. Installed native
routing must lead to the same identity. Public reading is a first-class experience,
not an installation landing page.

| Owned by this stream                                                                                       | Coordinated owner; do not independently edit                                     |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| New `apps/web/src/public-publications/*` reader components, renderer, metadata helpers, fixtures and tests | Foundation: DTO schemas, public eligibility, storage, REST public-read routes    |
| New `apps/web/src/public-worker.ts` hosting entrypoint and route dispatch tests                            | Foundation: public-safe cover asset references and availability                  |
| New `apps/web/src/lib/publication-rest.ts` and `publication-continuation.ts`                               | Delivery/attribution: save endpoint, provenance and subscription semantics       |
| Public React routes, auth continuation integration, Storybook and browser journeys                         | Native: deep-link parser, app navigation, share sheet, entitlements and signing  |
| Web Wrangler configuration, preview renderer wiring, deployment workflow, PWA exclusions                   | Integration owner: central contracts, release sequencing, environment bindings   |
| Association JSON content served by web host                                                                | Native/release owner: verify actual application identifier and domain capability |

Shared files requiring serialized integration: `apps/web/src/app.tsx`,
`auth-page.tsx`, `main.tsx`, `vite.config.ts`, `wrangler.toml`,
`wrangler.preview.toml`, `src/preview-worker.ts`, and
`.github/workflows/deploy-web.yml`. Reserve these edits through the integration
owner. Do not modify `packages/design-system` unless an existing semantic role
cannot support the reader; any shared token change requires its own coordinated gate.

## Current repository evidence

- Production `apps/web/wrangler.toml` serves Vite `dist` as static assets with SPA
  fallback on `myzine.app` and `www.myzine.app`. It has no Worker main entrypoint or
  API service binding. `index.html` contains generic metadata; React uses
  `createRoot`, not SSR/hydration. Client-only metadata cannot satisfy unfurlers.
- Preview `wrangler.preview.toml` uses `src/preview-worker.ts`, an `ASSETS` binding,
  `run_worker_first`, and an `API` service binding. It proxies `/api/v1` and `/trpc`
  and marks responses noindex. Its checked-in upstream is production: it is not a
  safe default for verification mutations.
- `app.tsx` protects existing app routes and redirects unknown paths to `/home`.
  Public publication/issue routes and their unavailable state do not exist.
- `auth-page.tsx` sends Clerk sign-in/sign-up to `/welcome` as fallback;
  `protected-route.tsx` does not retain attempted actions. Public action continuation
  needs explicit implementation, not reuse of the current redirect as-is.
- `vite.config.ts` installs a PWA navigation fallback and image runtime cache. Public
  routes must bypass the app-shell fallback so installed PWA state does not mask
  server HTML, published revisions, or tombstones.
- Native entitlements include only `webcredentials:clerk.myzine.app` under associated
  domains. `ZineNativeApp.swift` forwards incoming URLs only to Clerk. No publication
  universal-link association or routing is implemented.
- The Xcode project specifies team `TRA7965NM5` and bundle `app.zine.native`.
  Their concatenation is a candidate association identifier, not verified signing
  evidence. Release must inspect the signed app's actual application identifier.
- Worker R2 currently binds `ARTICLE_CONTENT`, a reader-content bucket. Do not make
  that bucket public to serve magazine covers.

## URL reservation

Use the existing primary web origin; proposed canonical paths:

| Destination              | Canonical path                                    |
| ------------------------ | ------------------------------------------------- |
| Publication home/archive | `https://myzine.app/p/:publicationId`             |
| Published issue          | `https://myzine.app/i/:issueId`                   |
| Selection anchor         | Issue URL with `#selection-:selectionId`          |
| Association document     | `/.well-known/apple-app-site-association`         |
| Public cover image       | `/publication-media/:assetId/:revision/cover.jpg` |

IDs, not mutable names or handles, determine permanent URLs. Publication handles may
later be aliases without changing canonical links. Share the canonical URL without
action parameters; fragments can focus a selection but are not authorization.
Use the same path vocabulary in native routing, share-sheet payloads, HTML canonical
links, notification destinations, and auth return paths. Serve associations on both
configured web domains if both appear in app entitlements; otherwise redirect the
www page to the primary origin and associate only the primary. The association
endpoint itself must not redirect.

## HTML, metadata, and cover architecture

Add a small dynamic Worker entrypoint to the existing web deployment. Route public
HTML, association JSON, and public media before SPA assets. Keep existing protected
app assets/routes intact. The entrypoint uses a configured API service binding to
fetch only Foundation's anonymous allowlisted DTOs; it neither reads D1 directly
nor forwards incoming cookies/authorization into public projections. Add corresponding
production bindings and reuse the renderer in preview with a safe configured backend.

Render complete semantic publication/issue HTML on the server, including editor,
cover/fallback, introduction, sections, ordered selections, source/author, commentary,
and original links. Return real HTTP status codes. Keep original links usable with
JavaScript disabled. Hydrate the public page through a dedicated entry module using
`hydrateRoot`; do not let existing `createRoot` discard server content. Public module
and app entry must share Vite's emitted asset manifest or a built shell template so
hashed JS/CSS names are never hardcoded. Reuse web wrappers, semantic tokens, and
wordmark; public content is not placed inside the authenticated navigation shell.

Each GET/HEAD delivers escaped title, description, canonical URL, `og:title`,
`og:description`, `og:url`, `og:type`, `og:image` and image dimensions/alt text;
include a large-image Twitter card for other chat clients. Use publication/editor
identity with the issue title. Use a bounded plain-text introduction as description,
with a neutral editorial fallback. Never render raw commentary HTML or interpolate
serialized JSON without script-safe escaping. Validate original/media URL protocols.
Draft/missing/unavailable responses expose no private title, artwork, or commentary;
serve generic unavailable metadata. Upstream failure is 503, not a cached 404.

Cover pipeline is coordinated with Foundation: draft uploads remain private;
publishing creates a sanitized public derivative (proposed 1200 x 630 JPEG/PNG) in
separate public-media storage, retaining only a public asset reference in DTOs.
Never expose an arbitrary R2 key, signed provider URL, or original upload metadata.
The preview image uses that derivative or a deterministic raster fallback preserving
the existing Zine logo exactly. A publication fallback may carry public publication
identity; a draft fallback may not. Cover replacement gives a new revision URL.
Raster production may be build-time for generic fallback and publish-time for custom
covers; do not add a heavyweight image renderer to every link-unfurl request.

Start with `Cache-Control: no-store` for HTML and authorization/availability-gated
media responses, and exclude these paths from CDN caching and PWA caches. That keeps
corrections/removals truthful without inventing cache invalidation infrastructure.
A later revision-aware cache requires event-driven purge and availability checks
before cache lookup, including old cover URLs. No stale-while-revalidate of unavailable
issue metadata. Chat clients can retain their own unfurls; changing server metadata
cannot promise replacement of an already sent iMessage preview. New fetches must be
correct, and this limitation belongs in release evidence.

## Save and subscription continuation

Public reader actions use the approved `/api/v1` REST surface with a Clerk bearer
token, not a new tRPC procedure. Obtain tokens through the existing session adapter.
Anonymous readers never fetch personal Library state or subscriber lists.

On an explicit Save/Subscribe click, retain a typed intent containing only action,
publication ID, issue ID, selection ID as applicable, a local nonce/idempotency key,
and expiry. Store it in session storage, with a validated same-origin return path
carrying its lookup ID through sign-in and sign-up. Never place tokens, commentary,
or private metadata in URLs/storage. Invalid, expired, or cancelled continuations
return to readable public content. Do not accept arbitrary redirect destinations.

After Clerk authentication finishes, return to the issue and resume the requested
mutation exactly once through the idempotent save endpoint or PUT subscription.
Revalidate the visible resource and current signed-in session first; unavailable
selections cannot be reconstructed from stale client data. Keep recoverable failures
visible and retryable. Rendering, prefetching, login alone, or a crawler GET never
causes a mutation. Preserve the original explicit action through sign-up, existing
sessions, refresh, and back navigation. Success stays on the issue with a Saved or
Subscribed state and an optional Library destination, rather than dropping the
reader at `/welcome`.

Native owns the equivalent pending intent and authentication state. Web links must
continue working when the app is absent or the OS chooses the browser. Do not claim
a deferred cross-install continuation: an App Store installation cannot be assumed
to preserve an arbitrary pending action. A new installed-app launch may require
reopening the original issue link.

## Universal links and prerequisites

Web serves an HTTPS association JSON document without a filename extension, login,
redirect, SPA fallback, or cookies. Restrict association components to `/p/*` and
`/i/*`; do not claim Clerk callback or app settings paths. Native adds
`applinks:myzine.app`, validates exact allowed hosts/path IDs, routes warm/cold launches
to anonymous issue/publication readers, and preserves any chosen save/subscription
intent across login. Existing Clerk URL handling must keep working.

Prerequisites for the release owner, not verified by this audit:

- Production web Worker deployment and API service binding on the existing domains;
  provision separate public-safe media storage/binding if required by the cover owner.
- Compatible deployed anonymous API resources before dynamic pages go live.
- Clerk authorized production origin/redirect configuration; approved localhost
  Clerk instance, matching JWKS and local account data for authenticated local checks.
- Signed native app with Associated Domains capability and matching application
  identifier; installed physical iPhone and a reachable HTTPS association host.
- Safe preview/staging backend and auth settings before any Save/Subscribe exercise.
  The current production service-bound preview must not receive verification writes.

No credentials were inspected. Use `agent-secrets` presence checks and injection
when implementation needs credentialed processes; never copy secret values into docs.

## Verification and acceptance evidence

Automated fixtures cover weekly/independent issues, publication archive pagination,
no cover/long title, Unicode and HTML/script payloads, unavailable original, draft,
removed issue, malicious URL, API failure, and correct public-only projection.

1. Worker integration: request actual rendered GET and HEAD with ordinary and crawler
   headers; assert complete no-JS content, correct status/canonical/OG tags, escaped
   values, no draft/private fields, valid association JSON, cover content type, and
   no SPA fallback/cache leakage. Follow correction/removal with requests to earlier
   cover revisions. No HTTP GET may write subscriptions/bookmarks.
2. Web tests: anonymous rendering independent of Clerk readiness; Save/Subscribe
   continuation through sign-in/sign-up, cancellation, reload, expiry, duplicate
   callbacks, stale selections, and rejected external return paths. Assert no mutation
   before explicit intent and no duplicate references after retry.
3. Component/Storybook: narrow mobile viewport, long sections, missing artwork,
   unavailable/success/failure states, keyboard focus and screen-reader names.
   Reuse `docs/web/design-system.md` and run appropriate design-system checks if shared
   semantics change. Run `test:web`, `test:web:storybook`, and `test:web:e2e` for
   public routing/auth integration; mocked smoke runs are not manual auth evidence.
4. Local runtime: follow `zine-local-development`; anonymous real web issue, original
   link, real Clerk login, resumed save/subscription, and Library attribution on the
   local API. Use explicit dynamic-host preview for HTML tests: Vite alone cannot
   prove Worker HTML dispatch. Coordinate native Simulator ownership and observe
   native routing through direct computer use when integrating with native.
5. Physical device: editor shares actual issue through iMessage; inspect unfurl title,
   publication identity and artwork, forward the same URL, open logged out in web,
   open with signed native app installed, and observe the exact issue. Keep existing
   chat threads and destination private; sending needs the user's explicit destination
   authorization or their manual action. Repeat with a corrected/fallback-cover issue
   and record client caching honestly. Also inspect WhatsApp behavior when available;
   generic Open Graph tests alone do not prove that client.

Record checks, web observation, signed build/install/launch, native routing, and real
chat-preview evidence separately. Planning and local fixtures do not establish any
of these runtime/device outcomes.

## Next bounded implementation assignment

Implement the isolated public reader renderer, entry module, metadata formatter,
route parser and tests against frozen public DTO fixtures under
`apps/web/src/public-publications/*`. Include publication/archive, both issue kinds,
neutral cover fallback, source links, Save/Subscribe controls with injected action
adapters, and unavailable/error states. Add Storybook coverage using existing tokens.
Do not wire production bindings, authenticated mutations, media uploads, shared app
routing, entitlements, or deployments in this first task. Hand off built renderer
fixtures and entry/manifest requirements to the integration owner; the next task
wires actual anonymous APIs and dynamic Worker hosting before the auth continuation
and physical-link passes. This is staged construction of the full release, not a
reduction of the agreed public sharing scope.
