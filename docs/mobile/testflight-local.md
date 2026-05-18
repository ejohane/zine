# Local TestFlight Deployment

This path builds the iOS app on your Mac and uploads the resulting IPA to App Store Connect/TestFlight without using EAS Build quota.

## Prerequisites

- Xcode installed and selected with `xcode-select`.
- Apple Developer Program access for the `app.zine.mobile` app.
- App Store Connect app ID `6766139146` exists for bundle ID `app.zine.mobile`.
- App Store Connect API key downloaded as an `AuthKey_*.p8` file.
- The `.p8` file must stay outside git; the repo already ignores `*.p8`.

## Environment

Set these in your shell, direnv, or another local secret store:

```bash
export APPLE_TEAM_ID="YOUR_TEAM_ID"
export ASC_KEY_ID="YOUR_KEY_ID"
export ASC_ISSUER_ID="YOUR_ISSUER_ID"
export ASC_KEY_PATH="/absolute/path/to/AuthKey_YOUR_KEY_ID.p8"
```

The lane loads public production app config from `apps/mobile/.env.production` when present. It also forces:

```bash
EXPO_NO_DOTENV=1
NODE_ENV=production
EXPO_PUBLIC_API_URL=https://api.myzine.app
```

That prevents a generated `.env.local` from accidentally shipping a worktree/local worker URL.

`apps/mobile/.env.production` is ignored by git and should contain the production public Expo values:

```bash
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
EXPO_PUBLIC_SPOTIFY_CLIENT_ID=...
EXPO_PUBLIC_YOUTUBE_CLIENT_ID=...
EXPO_PUBLIC_X_CLIENT_ID=...
EXPO_PUBLIC_API_URL=https://api.myzine.app
```

## Deploy

From the repo root:

```bash
bun run deploy:ios:testflight:local
```

Or from `apps/mobile`:

```bash
bun run deploy:ios:testflight:local
```

The wrapper installs Ruby gems into `apps/mobile/vendor/bundle`, so it does not need sudo access to the system Ruby gem directory.

The lane runs `expo prebuild --platform ios --no-install --clean` before archiving. The native `apps/mobile/ios` folder is generated and ignored in this repo, so durable native configuration should live in `app.json`, Expo config plugins, or tracked scripts rather than manual Xcode edits.

To reuse the existing generated native folder while debugging:

```bash
ZINE_PREBUILD_CLEAN=0 bun run deploy:ios:testflight:local
```

## Build Numbers

Before every upload, increment `expo.ios.buildNumber` in `apps/mobile/app.json`. Apple rejects duplicate build numbers for the same version.

The fastlane lane reads `expo.version` and `expo.ios.buildNumber` from `app.json` and passes those values into the local Xcode archive.

## Optional Release Notes

```bash
TESTFLIGHT_CHANGELOG="Fixes sharing and improves sync reliability." bun run deploy:ios:testflight:local
```

## What This Uses

- `fastlane build_app` / `gym` for the local Xcode archive and IPA export.
- `fastlane upload_to_testflight` / `pilot` for the App Store Connect upload.
- Apple App Store Connect API key auth for non-interactive automation.

It does not run `eas build` and does not use Expo's hosted macOS builders.
