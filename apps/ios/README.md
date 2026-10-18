# Zine Native iOS

This is Zine's canonical, supported mobile client. It is a native SwiftUI app
with the `app.zine.native` bundle identifier and uses the same Zine account and
production data as the rest of the product.

## Configure

The production Clerk publishable key, native application registration, callback
scheme, associated domain, Apple Team ID, and Sign in with Apple entitlement are
configured for `app.zine.native`.

For the normal Simulator development flow, run `ZINE_DEV_HOST=localhost bun run
dev:worktree` from the repository root. It supplies the selected local API URL
and host-scoped HTTP allowance to both the app and share extension while using
the checked-in native Clerk key. See [the local development guide](../../docs/local-development.md).
No local configuration file is required for this flow.

Manual Xcode builds default to `https://api.myzine.app`. For manual local builds,
set `ZINE_API_BASE_URL` in `Configuration/Local.xcconfig` and add the HTTP allowance
for that specific host:

```xcconfig
ZINE_API_BASE_URL = http:/$()/localhost:8770
INFOPLIST_PREPROCESSOR_DEFINITIONS = $(inherited) ZINE_ALLOW_INSECURE_LOCAL_API=1 ZINE_ATS_EXCEPTION_DOMAIN=localhost
```

Replace the example port with the running local Worker's port. Verify the built
API URL before manual verification writes. Production builds must omit the local
HTTP allowance to retain strict ATS in the app and extension.

Use `Configuration/Local.xcconfig.example` as a reference for intentional
configuration overrides, such as a development Clerk instance or provider app.
Its Clerk override is commented out to retain the checked-in native key. Enable
it only after replacing `pk_test_replace_me` with the real key for the intended instance.
A development Clerk instance also needs matching Worker JWKS and local data
identity as described in the local guide.

## Build

Open `ZineNative.xcodeproj`, select the `ZineNative` scheme, and run it on an
iOS 18 or newer simulator or device.

All new iOS product work, verification, and deployment belongs in this project.

After a Release build or archive, check its processed app configuration:

```sh
node scripts/check-ios-app-config.mjs '<built app>/Info.plist'
```

Run from the repository root. This catches missing iPad multitasking orientations
while preserving the existing iPhone orientations and device support.

## Tests

Select the `ZineNative` scheme in Xcode and use Product → Test to run
`ZineNativeTests`. These tests are separate from the root JavaScript test command.

For the dedicated Simulator used by the local development workflow:

```sh
xcodebuild -project apps/ios/ZineNative.xcodeproj -scheme ZineNative \
  -destination 'platform=iOS Simulator,name=iPhone 17 — Zine' test
```

Run this command from the repository root.

## Run in Apple Simulator

Start the worktree stack and native app:

```sh
ZINE_DEV_HOST=localhost bun run dev:worktree
```

The command boots `iPhone 17 — Zine`, builds and installs the current
`ZineNative` checkout against the selected local API, launches `app.zine.native`,
and opens the device in Apple Simulator. Use computer use directly in the
Simulator app for login, taps, scrolling, and visual verification. Follow the
[verified sign-in procedure](../../docs/local-development.md#sign-in-directly-in-apple-simulator):
retrieve allowlisted Bitwarden credentials with `secretsctl` and use the native
`setValue` action on the current settable Clerk fields. Generic typing and paste
are not proof that credential entry worked.

Set `ZINE_SIMULATOR_NAME` or `ZINE_SIMULATOR_UDID` to select another device.
Set `ZINE_SKIP_IOS_BUILD=1` to relaunch an already installed build; startup checks
that both the app and share extension target this worktree's local API.

To build and launch against an already running local stack:

```sh
ZINE_LOCAL_API_URL=http://localhost:WORKER_PORT bun run ios:simulator
```

This workflow requires macOS, Xcode command-line tools, and the Node 22 version
pinned by the repository. Coordinate device ownership with other active tasks.
Stopping the stack stops its services and any in-progress native build; the
Simulator remains available for inspection.

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
links. It loads a bookmark preview from the configured REST API (production by default) and lets the
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
Appearance and tagging use native sheets. A settled scroll to the bottom reveals
both control bars without changing completion state. The bottom tag, links, and
completion controls share the top controls’ scroll and tap visibility. The
completion control updates the article directly with optimistic feedback and a
retry alert if persistence fails. Completion remains reversible from the same
control and the More menu. The reader adds no end-of-article footer or divider;
publisher-provided body content remains intact.

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

### Inbox mutation fixture

A Debug build launched with `-screenshot-inbox-mutations-fixture` opens the real
Home/Inbox shell with two synthetic podcast items, an isolated temporary cache,
and a fixture-only URLSession transport. Use **Rebuild shell**, open Inbox, archive
an item, and return Home to exercise shared session lifetime and preview membership.
The fixture makes no Clerk or production requests and is not authenticated runtime
verification. Restart the fixture app to reset its synthetic archive state.

## Jump Back In widget

`ZineWidgetExtension` provides medium and large Home Screen widgets with recently
opened bookmarks in condensed horizontal cards. Medium shows up to four entries
in two rows; large shows up to six in three rows, both in two columns. Its items are a projection of `HomeStore`'s
Jump Back In section, including its ordering, complete-row cropping, optimistic
updates, completion/archive/removal exclusions, rollback, and older-history refill.
Accessibility text sizes use one column with up to two or three entries respectively.
The header has no disclosure icon. Zine supplies a clear container background;
iOS still controls the outer container in Default/Dark appearances. Home Screen
Clear/Tinted appearances use the system glass and omit solid card fills.

The authenticated app writes presentation metadata and small cached thumbnails
into the `group.app.zine.native` App Group and requests a WidgetKit reload when
the snapshot changes. The extension makes no authenticated API requests and
receives no Clerk tokens. iOS schedules widget rendering; it may delay a requested
refresh. Changes on another device appear after this app refreshes. Sign-out and
account/API-environment switches clear the shared snapshot.

Each tile has a scoped `zine://widget/bookmark` link. The app waits for sign-in,
checks the account and API environment, then fetches that bookmark through the
existing REST client. Articles resume in the normal bookmark reader. Unavailable
bookmarks show a recoverable error. The widget header opens Home.

For device signing, enable the App Group for both `app.zine.native` and
`app.zine.native.widgets` in the Apple developer account and regenerate their
provisioning profiles. The share extension does not use this group. The widget
is embedded by the canonical app target; no separate installation is required.
After installation, open Zine, then add **Zine → Jump Back In** from the Home
Screen widget gallery.

Focused widget checks:

```sh
bun run test:native:core
xcodebuild -project apps/ios/ZineNative.xcodeproj -scheme ZineNative \
  -destination 'platform=iOS Simulator,name=iPhone 17 — Zine Widgets' \
  -only-testing:ZineNativeTests/JumpBackInWidgetPublisherTests test
```

### Custom widget backgrounds

In Zine, open **Settings → Appearance → Widget backgrounds**, add a named color
with the system color picker (including its sRGB hex input), and Save. Touch and
hold a widget, choose **Edit Widget → Background**, then choose Clear, Automatic,
or a saved color. Each widget stores its own selection. Editing a saved color
updates widgets using that color; deleting it falls back to Automatic. Saved
colors are device preferences shared through the App Group, separate from the
account-scoped bookmark snapshot, and remain available after sign-out.

Custom backgrounds use an opaque sRGB fill with black or white foreground text,
chosen for at least 4.5:1 WCAG contrast. Solid card fills are removed on custom
backgrounds so all labels use that contrast. Clear/Tinted Home Screen appearances
use iOS's own rendering; use Default to display your custom background color.
The `zine://widget/appearance` link also opens these device-only preferences.
