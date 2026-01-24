/**
 * Jest Setup for Zine Mobile App
 *
 * Configures testing environment and provides mocks for:
 * - Expo modules (secure-store, constants, etc.)
 * - React Native modules (AsyncStorage, NetInfo)
 * - Third-party integrations (Clerk, tRPC)
 *
 * Note: For pure utility function tests (lib/*.test.ts), most mocks are not needed.
 * These mocks are provided for when testing components and hooks that depend on
 * React Native and Expo modules.
 */

// ============================================================================
// Global Definitions
// ============================================================================

// Define __DEV__ for React Native compatibility
global.__DEV__ = true;

// Enable React act() environment for hook testing
global.IS_REACT_ACT_ENVIRONMENT = true;

// ============================================================================
// Global Test Utilities
// ============================================================================

// Silence console warnings in tests (optional, can be enabled for debugging)
// console.warn = jest.fn();
// console.error = jest.fn();

// Add custom matchers or global test utilities here if needed

// ============================================================================
// Module Mocks (lazy-loaded when needed)
// ============================================================================

// These mocks will be applied when the corresponding modules are imported.
// For pure utility tests that don't import these modules, the mocks won't be activated.

// Mock react-native
jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
    select: jest.fn((obj) => obj.ios ?? obj.default),
  },
  StyleSheet: {
    create: jest.fn((styles) => styles),
    flatten: jest.fn((style) => style),
  },
  Dimensions: {
    get: jest.fn(() => ({ width: 375, height: 812 })),
  },
}));

// Mock react-native-svg
jest.mock('react-native-svg', () => ({
  Svg: 'Svg',
  Path: 'Path',
  Circle: 'Circle',
  Rect: 'Rect',
  G: 'G',
  default: 'Svg',
}));

// Mock react-navigation hooks
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback) => callback(),
}));

// Mock expo-secure-store
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

// Mock expo-constants
jest.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      extra: {
        clerkPublishableKey: 'test-clerk-key',
        apiUrl: 'http://localhost:8787',
      },
    },
  },
}));

// Mock expo-router
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
  useSegments: () => [],
  Link: 'Link',
}));

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
  },
  NotificationFeedbackType: {
    Success: 'success',
    Warning: 'warning',
    Error: 'error',
  },
}));

// Mock expo-linking
jest.mock('expo-linking', () => ({
  createURL: jest.fn((path) => `zine://${path}`),
  openURL: jest.fn(),
}));

// Mock @react-native-community/netinfo
jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(() =>
    Promise.resolve({
      isConnected: true,
      isInternetReachable: true,
      type: 'wifi',
    })
  ),
  addEventListener: jest.fn(() => jest.fn()),
}));

// Mock Clerk
jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: 'test-user-id',
    getToken: jest.fn(() => Promise.resolve('test-token')),
    signOut: jest.fn(),
  }),
  useUser: () => ({
    isLoaded: true,
    user: {
      id: 'test-user-id',
      primaryEmailAddress: { emailAddress: 'test@example.com' },
    },
  }),
  ClerkProvider: ({ children }) => children,
}));
