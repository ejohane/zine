# Zine Next

A standalone first pass at a new Zine, designed primarily for the open iPhone Duo
in landscape. Working name: **Zine Next**. It installs as `app.zine.next` alongside
`app.zine.native`, with a separate icon and sandbox.

This app has no dependencies on the existing client, backend, auth, database,
provider integrations, or shared Zine packages. The intended backend is now the independent `apps/api` `/v1` service. The app
uses validated local response fixtures for this capability preview. Nothing here
connects to an authenticated API or modifies production. See API_CAPABILITIES.md.

## First-pass experience

- Floating Home, Podcasts, Articles, Videos, Posts filters: one icon + label.
  Native Liquid Glass reveals the content scrolling underneath.
- Tap or swipe the strip (left advances, right returns). Each selection change
  requests a haptic; the selected tile centers after swiping when content overflows.
- One continuous bento feed: one-third-width tall articles, square podcasts,
  wide cinematic videos, and compact posts. Cards share a 14-point grid gap.
  Compact widths and larger Dynamic Type use an uncropped vertical stack.
- 22 bundled samples from the local Zine development snapshot: titles, creators,
  summaries, original links, durations, and 16 downloaded thumbnail assets.
  The native detail preview shows metadata and opens the original source.
- Save an http/https link with an optional title and content type. User links are
  separate from sample stories and survive relaunch in this app's own sandbox.
- Saved links can open their original URL. No scraping, offline extraction,
  syncing, login, or media playback is implemented or simulated as working.

## Build and run

Requires Xcode with iOS 27.1+ SDK, XcodeGen, and an installed iOS runtime. The
build guard rejects older SDKs rather than producing a Duo compatibility window.
On Erik's machine, Xcode 27.3 is at
`/Users/erikjohansson/Downloads/Xcode-beta 3.app`.

From the repository root:

```sh
xcodegen generate --spec apps/next-ios/project.yml
xcodebuild -project apps/next-ios/ZineNext.xcodeproj -scheme ZineNext \
  -destination 'platform=iOS Simulator,id=<simulator-UDID>' \
  -derivedDataPath .local-data/zine-next-build test
xcrun simctl launch <simulator-UDID> app.zine.next
```

Use the selected Xcode's `DEVELOPER_DIR` when the system default is older. Open
this independent project directly in Xcode or Device Hub for visual interaction.
The legacy `dev:worktree` stack is intentionally not part of this app's workflow.

For a physical build, use the same project/scheme with configuration Release,
`-destination 'platform=iOS,id=<phone-UDID>'` and `-allowProvisioningUpdates`.
Verify the resulting app with `codesign --verify --deep --strict`, then install
and launch `app.zine.next` through `devicectl`.

## Validation and limits

- Model tests cover relaunch persistence, invalid links and deliberate repeat saves, intersecting
  section/thread filters, preserving an unreadable saved file, retrying after
  transient write failure, retaining seven saves in category/thread views, and upgrading samples without losing personal saves.
- Bento planner tests cover every category, three widths, complete item coverage,
  no overlapping cards, square podcasts, tall articles, wide videos, and bundled
  sample/link/artwork validity.
- Three gesture-model tests cover direction, release thresholds, and bounds.
- One render test exports sixteen captures: all five sections in light/dark,
  large text, compact Home, accessibility text, scrolled light/dark headers, and
  a later-page composition. Images go to `/tmp/zine-next-previews` and xcresult.
  These are offscreen UIKit-hosted design captures, not physical gesture proof.
- `ZineNextUITests` uses an ephemeral sample space (`-ui-testing`, Debug only)
  to check filter swipes, inert horizontal page drags and a pinned header while
  the page scrolls. It never reads or writes the user's saved collection.
- Automated native interaction passes verify both header swipe directions,
  unchanged selection after a sideways page drag, moving vertical content under
  the pinned header, opening/dismissing a story, and opening the Save form.
- The header includes selection-feedback calls. Physical haptic feel and actual
  open-device/partial-fold transitions still require phone observation.
- Design review's compact clipping finding was corrected by scoping glass
  compositing inside the filter viewport; the reviewer scored it resolved.

## Artwork provenance

Current sample metadata is exported read-only from the existing local dev D1.
No old API, authentication, account state, or full article bodies are imported.
Artwork provenance is recorded in `Resources/DevSampleArtwork.json`. To refresh
this curated selection explicitly, run:

```sh
python3 apps/next-ios/scripts/export-dev-samples.py /path/to/local-d1.sqlite
```

Sample IDs are stable. App startup refreshes bundled samples while preserving
personal saved links and finished state for samples still in the selection.

The original illustrative photos remain as unused prototype assets. They
were downloaded on 2026-11-09 from these Unsplash image endpoints:

- Forest: https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1200&q=85
- Coast: https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=1200&q=85
- Studio: https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=1200&q=85

The app icon is an independently drawn geometric bookmark, not a modified Zine
logo. The product/design direction is recorded in PRODUCT.md and DESIGN.md.

## API capability preview

Build 4 adds notes, tags, resume/progress, independent lifecycle/archive/completion,
ordered collections and supporting synthesis, source intake, matched search
evidence, annotations, related items, and enrichment coverage/availability.
Sample personal state and retained passages are explicitly illustrative.

The local changes to notes, position, lifecycle and collection membership survive
relaunch; following toggles intentionally reset when that preview closes. Search
meaning results use two scripted ideas and do not imply live AI search.

Run `bun run apps/next-ios/scripts/validate-api-preview.ts` from the repository root
to check the fixture envelopes against the current service response schemas.
