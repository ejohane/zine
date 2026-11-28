# Zine Next web experiment channel

Erik explicitly requested this independent PWA as the experiment channel, recreating
`apps/next-ios` build 4. This is an exception to the root mobile-only default and
the legacy `apps/web` visual baseline. Do not alter the production iOS app or
legacy web app as part of these experiments.

- Home (2026-11-27) is "Spotlight": one big Zine Next card beside three rows, block after block,
  with the inbox as a sideways rail after the first block (`SpotlightHome.tsx`, `spotlight.ts`).
  Cards come from `@zine/next-ui` and are magnified whole, never restyled. Erik chose it from the
  options in `design-lab/`; the rules are in `packages/next-design/DESIGN.md`.
- The format filters are tabs with names only (`LibraryTabs.tsx`); Erik asked on 2026-11-28 for
  no counts there or beside the Inbox rail. Home also draws its cards at a 0.88 type scale
  (`TYPE_SCALE` in `SpotlightHome.tsx`) and pins the list rows' footer to the bottom of the row, 20px below the text. Navigation is an icon rail by default that expands to a labelled sidebar (no
  divider line, muted items, current one marked by an orange icon), with Save as a small circle at its top
  (`DestinationNav.tsx`); upright screens get one unpinned menu button that opens a drawer
  (no word beside it, no search or Save up top; Erik asked for that on 2026-11-27). Erik tried a floating
  pill on 2026-11-27 and asked for the sidebar back the same day. `spotlight-home.css` holds
  both and points the app's colour and font variables at the Zine Next tokens; do not add a
  second palette. Library, Inbox and Search keep their older feeds.
- Look at Home before calling a layout change done, at the sizes Erik uses: his iPad mini in
  Safari is about 676 wide upright (not the nominal 744) and about 1000 wide in landscape, with
  roughly 140 of height lost to Safari's bars; check the sidebar open and collapsed, plus a
  larger iPad (1180), a desktop and a phone. When a screenshot from him disagrees with a local
  render, measure his screenshot rather than assume the device's nominal size. Two columns must survive every landscape size; a 2026-11-27 change that
  was only checked at 1440 and on a phone collapsed Home to one column on his iPad.
- Erik authorized production-account integration on 2026-11-10. The connected
  app uses real Clerk sessions and the independent production `/v1` service.
- Serve at `https://api-next.myzine.app/next/` with a separate asset Worker and
  path-scoped service worker. Merging to `main` publishes it
  (`.github/workflows/next-web-release.yml`). Preserve the backend deployment and auth policies.
- Local development uses `apps/api` `local:pull`/`local:dev` data through the Vite
  proxy; see `../api/docs/environments.md` (also branch previews and phone access). Never point local work at production.
- Never substitute mock content on network/auth failure or import old mock edits.
- Private caches are account-scoped and cleared at sign-out/account changes.
  Never cache authenticated API responses in the public shell service worker.
- Keep storage errors visible, personal saves durable, and completion, archive,
  progress and lifecycle independent. Existing saved data must survive updates.
- Test the production build/service worker, including cold offline navigation,
  artwork, local edits and reload; a manifest alone is not PWA verification.
- Browser tests and native observation are separate. Never claim physical iPad
  haptics or Safari installation from desktop/headless evidence.
