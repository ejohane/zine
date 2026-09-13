# Zine Native iOS

This is Zine's canonical, supported mobile client. It is a native SwiftUI app
with the `app.zine.native` bundle identifier and uses the same Zine account and
production data as the rest of the product.

## Configure

The production Clerk publishable key, native application registration, callback
scheme, associated domain, Apple Team ID, and Sign in with Apple entitlement are
configured for `app.zine.native`.

For a development Clerk instance or local worker, copy
`Configuration/Local.xcconfig.example` to `Configuration/Local.xcconfig` and
override the relevant values there.

The API defaults to `https://api.myzine.app`. Override
`ZINE_API_BASE_URL` in `Local.xcconfig` for local worker development.

For an HTTP API on a named host or IP address, also opt the development build
into one host-scoped ATS exception:

```xcconfig
ZINE_API_BASE_URL = http:/$()/100.92.242.50:8787
INFOPLIST_PREPROCESSOR_DEFINITIONS = $(inherited) ZINE_ALLOW_INSECURE_LOCAL_API=1 ZINE_ATS_EXCEPTION_DOMAIN=100.92.242.50
```

`bun run dev:worktree` derives these settings from its selected local API URL.
Production builds omit `ZINE_ALLOW_INSECURE_LOCAL_API` and retain strict ATS in
both the app and Share Extension.

## Build

Open `ZineNative.xcodeproj`, select the `ZineNative` scheme, and run it on an
iOS 18 or newer simulator or device.

All new iOS product work, verification, and deployment belongs in this project.

## Tests

Select the `ZineNative` scheme in Xcode and use Product → Test to run
`ZineNativeTests`. These tests are separate from the root JavaScript test command.

For the dedicated simulator used by the preview workflow:

```sh
xcodebuild -project apps/ios/ZineNative.xcodeproj -scheme ZineNative \
  -destination 'platform=iOS Simulator,name=iPhone 17 — Zine' test
```

Run this command from the repository root.

## Browser simulator preview

Run the native app in Zine's dedicated Simulator and mirror it into a browser:

```sh
bun run ios:preview
```

The normal worktree development command starts this preview alongside the
worker, web app, and other development services by default:

```sh
bun run dev:worktree
```

The command boots `iPhone 17 — Zine`, builds and installs the current
`ZineNative` checkout, launches `app.zine.native`, and starts the `serve-sim`
preview. Its default URL is `http://localhost:3200`. Keep the command running
while using the preview; Control-C stops only the helper attached to Zine's
simulator.

Set `ZINE_SIMULATOR_NAME` or `ZINE_SIMULATOR_UDID` to use another Simulator.
Set `ZINE_SKIP_IOS_BUILD=1` to relaunch an already installed build without
rebuilding it. Set `ZINE_SERVE_SIM=0` when running `dev:worktree` to disable the
native preview. Additional `serve-sim` options can follow `--` when using the
standalone command, for example:

```sh
bun run ios:preview -- --theme dark --panes tools
```

This workflow requires Apple Silicon, Xcode command-line tools, and the Node 22
version pinned by the repository.

## Reader routing fixture

For deterministic screenshot tests only (not manual runtime verification), after building and installing a Debug app, launch with `-screenshot-fixtures`
and `-screenshot-reader-routing-fixtures` to exercise Library → bookmark detail →
Read in Zine with Substack, custom-domain Substack, and regular web articles.
This uses the real navigation and reader views with synthetic article responses;
it does not verify authentication or production article extraction.

## Design system

The native color palette, semantic roles, usage rules, exceptions, and
verification expectations are documented in [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md).
Use `ZineNative/Core/ZineTheme.swift` rather than introducing view-local palette
values.

## Share extension

The `ZineShareExtension` target appears as Zine in the iOS share sheet for web
links. It loads a bookmark preview from the production REST API and lets the
user save the link to their Zine library without opening the full app.

The app and extension share the Clerk session through the
`app.zine.native` keychain access group. A user who is not signed in is prompted
to open Zine and sign in before trying the share action again. The share modal
loads the user’s existing tags and supports selecting or creating tags before
saving the bookmark.

## Native CLI development and testing

Start with [the developer quickstart](../../docs/native-cli-development.md) for the
headless edit/test loop, Simulator integration, and adding regression coverage.

See [the first native agent experiment](../../docs/native-agent-experiment.md) for
shared desktop tests, deterministic offline scenarios, and explicitly enabled
Simulator commands against the authenticated local app.
See [workflow coverage and commands](../../docs/native-agent-workflows.md) for the expanded CLI.

Local manual verification uses real Clerk login and sanitized local D1/R2. See [the authenticated local workflow](../../docs/local-development.md). `dev:worktree` passes its selected local API URL as a build setting, overriding production defaults.

## Immersive reader

The reader shows its top controls on entry and whenever it is at the beginning.
The article header starts below those controls. The document itself scrolls
through the top and bottom screen edges; header clearance scrolls away with it.
Away from the top, a single tap on ordinary content toggles the controls;
sustained upward scrolling reveals them and downward scrolling hides them.
Links and WebKit text selection keep their native interactions. VoiceOver keeps
the controls available, and Reduce Motion disables the chrome transition.
Appearance and tagging use native sheets. A settled scroll to the bottom opens
a completion sheet once per visit, with saving, confirmation, and retry states.
The bottom tag, links, and completion controls share the top controls’ scroll and tap
visibility. The completion control opens the sheet at any point. The inline end action can also reopen it after dismissal. Completion remains
reversible in the More menu.

Appearance persists in local preferences (System, Charter, or Georgia, plus text
scale) and combines with Dynamic Type. Legacy size presets migrate on first use.
Changing appearance updates CSS in place instead of reloading the article.

Reading positions are local to the account and device, stored as protected
`.json.position` files alongside the article cache. A content hash, text-node
index, character offset, text quote, and viewport position restore the passage
across font reflow and late image layout. An incompatible document falls back to
its saved fraction. Existing queued server progress and save-and-complete behavior
remain unchanged. The reader's own script runs in a separate `WKContentWorld`;
article JavaScript remains disabled and the restrictive content policy remains.

The routing fixture above now includes a long synthetic article, a source link,
and local tag/completion responses. Its reading position persists in a separate
fixture account cache. Use `-screenshot-light-mode` or `-screenshot-dark-mode` for
explicit appearance coverage. These fixtures do not establish production API or
authentication health.

Focused reader checks:

```sh
xcodebuild -project apps/ios/ZineNative.xcodeproj -scheme ZineNative \
  -destination 'platform=iOS Simulator,name=iPhone 17 — Zine' \
  -parallel-testing-enabled NO \
  -only-testing:ZineNativeTests/ArticleReaderTests \
  -only-testing:ZineNativeTests/ArticleReaderWebTests \
  -only-testing:ZineNativeTests/ZineThemeTests test
```

The reader’s Links control opens a sheet of unique web destinations from the article body, in article order, with linked text, surrounding context, and domain. Each row can save its destination to Zine and fills the bookmark immediately, rolling back with retry feedback if the request fails. Successful saves refresh Home and Library through the app’s bookmark-save event. It excludes direct media/assets, downloads, same-article anchors, and navigation regions, and opens destinations using the system URL handler. No preview metadata is fetched.
