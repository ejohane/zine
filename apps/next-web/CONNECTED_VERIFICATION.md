# Connected production acceptance

Target: `https://api-next.myzine.app/next/`, using the real production Zine account
and real Clerk authentication. This document distinguishes actual production
behavior from isolated transport/model tests. Old mock-PWA receipts are historical.

## Reproduce

Read the shared agent-secrets skill first, then use the approved profile:

```sh
secretsctl current
secretsctl metadata zine.test
secretsctl check zine.test
# Run from apps/next-web:
secretsctl run zine.test -- node verification/auth-browser.mjs
secretsctl run zine.test -- node verification/connected-flow.mjs
```

`auth-browser.mjs` performs real Clerk form entry in an isolated Chrome profile;
credential entry is not recorded or traced. `connected-flow.mjs` uses that profile
and exercises the rendered production UI. Its controlled save uses a fresh URL
under `https://example.com/zine-web-proof/<uuid>` and the dedicated verification
tag. It never changes an existing save. Cleanup deletes only that controlled
reference after confirming its exact URL; its independently authenticated readback
uses a separate real Clerk session and closes it afterward.

If an interrupted verification requires cleanup, `verification/cleanup-live.ts`
requires both the exact verification URL pattern and matching controlled context
before deleting anything. It refuses unrecognized references. It does not clear
an existing user library. Private profiles and receipts are ignored local files.

## Evidence location and scopes

`output/playwright/connected/receipt.json` records passing journeys, sanitized
request IDs/statuses, and a hashed account identity. Raw bearer tokens, passwords,
cookies and library payloads are never emitted. No HAR/network trace is captured,
because such traces can include session credentials. Screenshots contain real
library content and remain local, under the ignored output directory.

The acceptance script checks:

- `/v1/me` identity agrees with the browser's real Clerk user.
- The real populated feed and cursor pagination have no duplicate card IDs.
- All four format filters make the intended real API queries.
- A validation-rejected save can be corrected; a save whose successful upstream response is deliberately lost safely retries.
- A deliberate later save keeps the same personal item while adding new context.
- Notes, progress, independent completion and archive survive reload.
- A separate server-side Clerk session confirms those actual persisted fields.
- Cold offline opening reads the cached note, with writes disabled.
- Service-worker caches contain only `/next/` shell assets, no API/auth/mock data.
- Controlled verification data is removed and no longer readable; a known server deletion also invalidates offline copies.
- Sign-out removes the account marker and clears private IndexedDB entries.

Passing results are authoritative only after inspecting the current receipt.
`failure.json`, when present, describes an interrupted attempt and is not a pass.

Isolated `live-api.test.ts` covers transport boundaries, stable-key retry, no
automatic retry for notes, quota handling, cursor encoding and auth denial. The
native-parity model tests cover the unchanged bento planner and historical mock
storage; they do not prove production integration.

## Limits

Browser automation and desktop PWA installation do not prove physical iPhone/iPad
Safari installation, touch/haptics, fold transitions or offline behavior on that
device. Offline data is a saved copy, not a live library; remote artwork, originals
and media may need a connection. Only sections/details/text already opened are
available offline. No offline mutation queue is implemented. Account-cache scoping
and logout are checked; a second real account login is not claimed.

No API backend deployment, auth allowlist changes, schema migration, OAuth consent,
provider grant changes or legacy-client changes are part of this implementation.
The app uses the API's existing origin and a separate path-scoped static Worker.
The backend health release identity is checked before and after deployment.

## Observed completion — 2026-11-10 UTC

- Ten actual production browser journeys passed on Chrome 157.0.8103.39, with
  zero runtime errors. The separate Clerk session confirmed exactly three
  controlled context entries, position 0.01, completed true and archived true.
- The lost-acknowledgement test reached the real upstream API before aborting
  the browser response. Recovery and deliberate re-save retained one item ID.
- A real 21,490-character retained article matched byte-for-byte after a cold
  offline opening. Its hash and length are recorded, not the article body.
- The production manifest passed installability checks; Chrome installed and
  launched the app in standalone mode and reloaded its real cached feed offline.
- Tablet 1024×768 dark and phone 390×844 light captures had no horizontal overflow.
  The checked phone and tablet feeds had zero automated axe WCAG violations; incomplete rules
  remain in the receipt and do not constitute full accessibility certification.
- A 390px signed-out browser also fit without horizontal overflow.
- Direct native Chrome computer use completed real Clerk password sign-in via
  protected clipboard transfer, selected Articles and opened a real saved item.
  No existing item was edited in that manual review.
- Typecheck/build and lint passed; 12 isolated tests passed with 198 assertions.
- The API backend remains deployment `23b9f152-39a0-4450-b0fd-1da9e746e130`, source
  `627b63d439f1bcb781026901b754ebf363b4e373`. Anonymous `/v1/items` access returns 401.
- Asset Worker deployment: `ac28a1a6-3a35-416c-bda5-48faffc45e55`.
  `scripts/collect-connected.py` compares every deployed asset to the local build
  and consolidates the current receipts in `output/playwright/connected/verification.json`.

Additional reproduction commands from `apps/next-web`:

```sh
secretsctl run zine.test -- node verification/connected-reading.mjs
secretsctl run zine.test -- node verification/connected-layouts.mjs
secretsctl run zine.test -- node verification/connected-install.mjs
python3 scripts/collect-connected.py
```

The production CSP is retained during verification; axe is injected through the
browser debugger rather than weakening CSP to permit inline scripts. No new live
OAuth/Google authorization or physical-device acceptance is claimed.
