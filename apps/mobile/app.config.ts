/**
 * Expo Configuration for Zine Mobile
 *
 * This dynamic config file allows us to:
 * - Use environment variables at build time
 * - Conditionally configure different environments
 * - Type-check our configuration
 *
 * Note: This file runs in Node.js at build time, not in React Native.
 *
 * @see https://docs.expo.dev/workflow/configuration/
 */

import { ExpoConfig, ConfigContext } from 'expo/config';

// Access process.env in Node.js build context
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const env = (globalThis as any).process?.env ?? {};

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Zine',
  slug: 'zine',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'zine',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.zine.app',
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },
    package: 'com.zine.app',
  },
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/favicon.png',
  },
  plugins: ['expo-router', 'expo-secure-store'],
  experiments: {
    typedRoutes: true,
  },
  // Extra configuration accessible via Constants.expoConfig.extra
  extra: {
    // Clerk publishable key for authentication
    clerkPublishableKey: env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,

    // API base URL for the backend worker
    apiUrl: env.EXPO_PUBLIC_API_URL || 'http://localhost:8787',

    // Replicache license key (optional for development)
    replicacheLicenseKey: env.EXPO_PUBLIC_REPLICACHE_LICENSE_KEY || '',

    // EAS configuration
    eas: {
      projectId: env.EAS_PROJECT_ID,
    },
  },
});
