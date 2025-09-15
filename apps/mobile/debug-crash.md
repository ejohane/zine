# iOS App Crash Debug Steps

## 1. Clean and Fix Dependencies
```bash
cd apps/mobile
rm -rf node_modules
cd ../..
bun install
cd apps/mobile
bun install --force
```

## 2. Fix Entry Point
The app is using expo-router but also has App.tsx. Need to choose one:
- Either use expo-router (recommended) - rename or remove App.tsx
- Or use App.tsx - remove expo-router from index.ts

## 3. Get Device Crash Logs

### Method 1: Using Console App (Mac)
1. Connect iPhone to Mac via USB
2. Open Console app on Mac (Applications > Utilities > Console)
3. Select your iPhone from the left sidebar
4. Start recording, then launch the app
5. Look for crash logs with "zine" or "com.erikjohansson.zine"

### Method 2: Using Xcode
1. Open Xcode
2. Go to Window > Devices and Simulators
3. Select your device
4. Click "View Device Logs"
5. Look for recent crashes of your app

### Method 3: Using eas device:list
```bash
eas device:list
eas diagnostics
```

## 4. Create a Debug Build
Build with development client for better error messages:
```bash
eas build --platform ios --profile development --local
```

## 5. Common Crash Causes to Check:
- Missing Clerk publishable key in the build
- Network requests to localhost instead of production API
- Missing required iOS permissions in Info.plist
- React Native version mismatches
- Missing or incorrect bundle identifier

## 6. Test in Simulator First
```bash
# Build for simulator
eas build --platform ios --profile development --local
# Or run directly
bun run ios
```
