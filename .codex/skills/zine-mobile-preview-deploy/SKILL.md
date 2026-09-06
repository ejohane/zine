---
name: zine-mobile-preview-deploy
description: Build, install, and launch the supported native Zine iOS app on a physical iPhone when the user asks to send the app to their phone.
---

# Zine Native Device Deployment

Use `apps/ios/ZineNative.xcodeproj`, scheme `ZineNative`, and bundle
`app.zine.native` for every phone deployment.

1. Inspect the current checkout and preserve unrelated work. A phone deployment
   uses the requested checkout; it does not imply permission to publish or merge.
2. Discover the physical phone using `xcrun devicectl list devices` and the Xcode
   destination UDID using `xcrun xctrace list devices`. The CoreDevice identifier
   and Xcode destination identifier can differ. Do not substitute a simulator.
3. Build the signed native app, using the discovered Xcode UDID:

   ```bash
   xcodebuild -project apps/ios/ZineNative.xcodeproj -scheme ZineNative \
     -configuration Release -destination 'platform=iOS,id=<xcode-device-udid>' \
     -derivedDataPath .local-data/ios-device-derived-data \
     CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM=TRA7965NM5 \
     -allowProvisioningUpdates build
   ```

4. Verify the resulting `Zine Native.app` in
   `.local-data/ios-device-derived-data/Build/Products/Release-iphoneos/`
   with `codesign --verify --deep --strict`.
5. Install with `xcrun devicectl device install app --device <core-device-id> <app-path>`.
6. Launch with `xcrun devicectl device process launch --device <core-device-id> --terminate-existing app.zine.native`.
7. Report build, signature verification, installation, launch, and observed UI
   separately. A locked phone may allow installation but prevent launch. If the
   phone is unavailable, report the device step as blocked.

For an explicitly requested release through GitHub, follow
`.codex/skills/zine-ship/SKILL.md`, which builds from the verified merged source.
