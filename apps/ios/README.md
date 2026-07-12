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

The first iteration intentionally contains only authentication and the Library
vertical slice: list, pagination, refresh, search, filters, detail, and finished
state. It does not replace or modify the React Native app.
