# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies (from the repo root)

   ```bash
   bun install
   ```

2. Start the app

   ```bash
   bun run dev
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## iOS Simulator setup

1. Install Xcode and iOS simulator runtimes

   ```bash
   xcode-select --install
   ```

2. Install IDB (required for simulator automation tooling)

   ```bash
   brew install idb-companion
   pip3 install fb-idb
   ```

3. If you use opencode, the MCP server is already configured in `opencode.json` under `mcp.ios-simulator` and writes artifacts to `apps/mobile/tmp`.

4. Start the app and open it in Expo Go on the simulator

   ```bash
   bun run dev
   ```

## Expo doctor notes (SDK 55)

- Run `npx expo-doctor` from `apps/mobile` for local diagnostics.
- We intentionally exclude `expo-share-extension` from React Native Directory warnings and disable unknown-package warnings via `package.json > expo.doctor.reactNativeDirectoryCheck` because:
  - `expo-share-extension` is currently reported as "untested on New Architecture"
  - `@solana-mobile/mobile-wallet-adapter-protocol` has no RN Directory metadata yet
- With Bun workspaces, `expo-doctor` may still report duplicate native module installs from `.bun` store linking even when dependency versions are aligned and builds/tests pass.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
