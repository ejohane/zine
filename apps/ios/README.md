# Zine Native iOS

This is an additive SwiftUI app that lives alongside `apps/mobile`. It uses the
same Zine account and production data, but it has its own bundle identifier
(`app.zine.native`) so both apps can remain installed.

## Configure

The production Clerk publishable key, native application registration, callback
scheme, associated domain, Apple Team ID, and Sign in with Apple entitlement are
configured for `app.zine.native`.

For a development Clerk instance or local worker, copy
`Configuration/Local.xcconfig.example` to `Configuration/Local.xcconfig` and
override the relevant values there.

The API defaults to `https://api.myzine.app`. Override
`ZINE_API_BASE_URL` in `Local.xcconfig` for local worker development.

## Build

Open `ZineNative.xcodeproj`, select the `ZineNative` scheme, and run it on an
iOS 18 or newer simulator or device.

The native app is additive and does not replace or modify the React Native app.

## Share extension

The `ZineShareExtension` target appears as Zine in the iOS share sheet for web
links. It loads a bookmark preview from the production REST API and lets the
user save the link to their Zine library without opening the full app.

The app and extension share the Clerk session through the
`app.zine.native` keychain access group. A user who is not signed in is prompted
to open Zine and sign in before trying the share action again. The share modal
loads the user’s existing tags and supports selecting or creating tags before
saving the bookmark.
