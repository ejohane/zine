# Zine Next web experiment channel

Erik explicitly requested this independent PWA as the experiment channel, recreating
`apps/next-ios` build 4. This is an exception to the root mobile-only default and
the legacy `apps/web` visual baseline. Do not alter the production iOS app or
legacy web app as part of these experiments.

- Use the NextTheme palette, system type, floating icon/word filters, and the exact
  native three-column bento packing. One vertical page; only the filters scrub.
- Erik authorized production-account integration on 2026-11-10. The connected
  app uses real Clerk sessions and the independent production `/v1` service.
- Serve at `https://api-next.myzine.app/next/` with a separate asset Worker and
  path-scoped service worker. Preserve the backend deployment and auth policies.
- Never substitute mock content on network/auth failure or import old mock edits.
- Private caches are account-scoped and cleared at sign-out/account changes.
  Never cache authenticated API responses in the public shell service worker.
- Keep storage errors visible, personal saves durable, and completion, archive,
  progress and lifecycle independent. Existing saved data must survive updates.
- Test the production build/service worker, including cold offline navigation,
  artwork, local edits and reload; a manifest alone is not PWA verification.
- Browser tests and native observation are separate. Never claim physical iPad
  haptics or Safari installation from desktop/headless evidence.
