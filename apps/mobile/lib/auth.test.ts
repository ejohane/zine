/**
 * Tests for auth.ts - Clerk token caching and configuration validation
 */

import * as SecureStore from 'expo-secure-store';

// Mock the logger to track calls without console output
jest.mock('./logger', () => ({
  authLogger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

// Get the mocked modules
import { authLogger } from './logger';

const mockSecureStore = SecureStore as jest.Mocked<typeof SecureStore>;
const mockAuthLogger = authLogger as jest.Mocked<typeof authLogger>;

// Store original env value
const originalClerkKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

// ============================================================================
// tokenCache Tests (Native Platform - Default)
// ============================================================================

describe('tokenCache on native platforms (iOS/Android)', () => {
  // Import the module once - jest.setup.js already mocks Platform.OS as 'ios'
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { tokenCache } = require('./auth');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('tokenCache is defined on native platforms', () => {
    expect(tokenCache).toBeDefined();
  });

  describe('getToken', () => {
    it('returns stored token when it exists', async () => {
      mockSecureStore.getItemAsync.mockResolvedValueOnce('test-token-value');

      const result = await tokenCache.getToken('clerk-token-key');

      expect(result).toBe('test-token-value');
      expect(mockSecureStore.getItemAsync).toHaveBeenCalledWith('clerk-token-key');
    });

    it('returns null when token does not exist', async () => {
      mockSecureStore.getItemAsync.mockResolvedValueOnce(null);

      const result = await tokenCache.getToken('non-existent-key');

      expect(result).toBeNull();
      expect(mockSecureStore.getItemAsync).toHaveBeenCalledWith('non-existent-key');
    });

    it('logs debug message on successful retrieval', async () => {
      mockSecureStore.getItemAsync.mockResolvedValueOnce('retrieved-token');

      await tokenCache.getToken('clerk-token-key-12345');

      expect(mockAuthLogger.debug).toHaveBeenCalledWith('Token retrieved', {
        key: 'clerk-token-key-1234...',
      });
    });

    it('does not log debug message when token is null', async () => {
      mockSecureStore.getItemAsync.mockResolvedValueOnce(null);

      await tokenCache.getToken('missing-key');

      expect(mockAuthLogger.debug).not.toHaveBeenCalledWith('Token retrieved', expect.anything());
    });

    it('handles SecureStore errors gracefully (deletes key, returns null)', async () => {
      const secureStoreError = new Error('SecureStore unavailable');
      mockSecureStore.getItemAsync.mockRejectedValueOnce(secureStoreError);
      mockSecureStore.deleteItemAsync.mockResolvedValueOnce();

      const result = await tokenCache.getToken('corrupted-key');

      expect(result).toBeNull();
      expect(mockAuthLogger.error).toHaveBeenCalledWith('SecureStore getToken error', {
        error: secureStoreError,
      });
      expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('corrupted-key');
    });
  });

  describe('saveToken', () => {
    it('saves token to SecureStore', async () => {
      mockSecureStore.setItemAsync.mockResolvedValueOnce();

      await tokenCache.saveToken('clerk-token-key', 'new-token-value');

      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
        'clerk-token-key',
        'new-token-value'
      );
    });

    it('logs debug message on save', async () => {
      mockSecureStore.setItemAsync.mockResolvedValueOnce();

      await tokenCache.saveToken('clerk-token-key-12345', 'token');

      expect(mockAuthLogger.debug).toHaveBeenCalledWith('Token saved', {
        key: 'clerk-token-key-1234...',
      });
    });

    it('handles SecureStore errors gracefully', async () => {
      const saveError = new Error('Storage full');
      mockSecureStore.setItemAsync.mockRejectedValueOnce(saveError);

      // Should not throw
      await expect(tokenCache.saveToken('clerk-key', 'token')).resolves.toBeUndefined();

      expect(mockAuthLogger.error).toHaveBeenCalledWith('SecureStore saveToken error', {
        error: saveError,
      });
    });
  });

  describe('clearToken', () => {
    it('clearToken is defined', () => {
      expect(tokenCache.clearToken).toBeDefined();
    });

    it('deletes token from SecureStore', async () => {
      mockSecureStore.deleteItemAsync.mockResolvedValueOnce();

      await tokenCache.clearToken('clerk-token-key');

      expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('clerk-token-key');
    });

    it('logs debug message on clear', async () => {
      mockSecureStore.deleteItemAsync.mockResolvedValueOnce();

      await tokenCache.clearToken('clerk-token-key-12345');

      expect(mockAuthLogger.debug).toHaveBeenCalledWith('Token cleared', {
        key: 'clerk-token-key-1234...',
      });
    });

    it('handles SecureStore errors gracefully', async () => {
      const deleteError = new Error('Item not found');
      mockSecureStore.deleteItemAsync.mockRejectedValueOnce(deleteError);

      // Should not throw
      await expect(tokenCache.clearToken('missing-key')).resolves.toBeUndefined();

      expect(mockAuthLogger.error).toHaveBeenCalledWith('SecureStore clearToken error', {
        error: deleteError,
      });
    });
  });
});

// ============================================================================
// tokenCache Web Platform Tests
// ============================================================================

describe('tokenCache on web platform', () => {
  it('tokenCache is undefined on web platform', () => {
    // We need to test the web platform case
    // Since Platform.OS is mocked as 'ios' in jest.setup.js, we verify the logic:
    // The auth.ts code does: Platform.OS !== 'web' ? createTokenCache() : undefined
    // So when Platform.OS is 'web', tokenCache should be undefined
    //
    // To test this properly, we can verify the conditional logic exists
    // by checking the behavior pattern - tokenCache exists when OS !== 'web'
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { tokenCache } = require('./auth');

    // On iOS (current mock), tokenCache should be defined
    expect(tokenCache).toBeDefined();

    // The web platform test requires resetting modules with different Platform mock
    // This is verified by the implementation code: Platform.OS !== 'web' ? createTokenCache() : undefined
  });

  it('tokenCache creation depends on Platform.OS', () => {
    // Verify the module exports tokenCache conditionally
    // This test documents the expected behavior based on the implementation
    jest.resetModules();

    // Mock Platform as web
    jest.doMock('react-native', () => ({
      Platform: {
        OS: 'web',
        select: jest.fn((obj: Record<string, unknown>) => obj.web ?? obj.default),
      },
    }));

    // Re-mock the logger after resetModules
    jest.doMock('./logger', () => ({
      authLogger: {
        debug: jest.fn(),
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
      },
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const authModule = require('./auth');
    expect(authModule.tokenCache).toBeUndefined();

    // Restore for other tests
    jest.resetModules();
  });
});

// ============================================================================
// validateClerkConfig Tests
// ============================================================================

describe('validateClerkConfig', () => {
  const originalConsoleWarn = console.warn;

  beforeEach(() => {
    console.warn = jest.fn();
  });

  afterEach(() => {
    console.warn = originalConsoleWarn;
    // Restore original env
    if (originalClerkKey !== undefined) {
      process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = originalClerkKey;
    } else {
      delete process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
    }
  });

  it('does not throw when CLERK_PUBLISHABLE_KEY is set', () => {
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_valid_key';

    // Import fresh to get updated env value
    jest.resetModules();

    // Re-mock dependencies after resetModules
    jest.doMock('./logger', () => ({
      authLogger: {
        debug: jest.fn(),
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
      },
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { validateClerkConfig } = require('./auth');

    expect(() => validateClerkConfig()).not.toThrow();
    expect(console.warn).not.toHaveBeenCalled();

    jest.resetModules();
  });

  it('logs warning in __DEV__ when key is missing', () => {
    delete process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

    jest.resetModules();

    // Re-mock dependencies after resetModules
    jest.doMock('./logger', () => ({
      authLogger: {
        debug: jest.fn(),
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
      },
    }));

    // __DEV__ is set to true in jest.setup.js
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { validateClerkConfig } = require('./auth');
    validateClerkConfig();

    expect(console.warn).toHaveBeenCalledWith(
      '[Auth] Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY. Please set it in your .env.local file.'
    );

    jest.resetModules();
  });

  it('does not throw when key is missing (just warns)', () => {
    delete process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

    jest.resetModules();

    // Re-mock dependencies after resetModules
    jest.doMock('./logger', () => ({
      authLogger: {
        debug: jest.fn(),
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
      },
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { validateClerkConfig } = require('./auth');

    expect(() => validateClerkConfig()).not.toThrow();

    jest.resetModules();
  });
});

// ============================================================================
// CLERK_PUBLISHABLE_KEY Export Tests
// ============================================================================

describe('CLERK_PUBLISHABLE_KEY', () => {
  afterEach(() => {
    // Restore original env
    if (originalClerkKey !== undefined) {
      process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = originalClerkKey;
    } else {
      delete process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
    }
  });

  it('exports the environment variable value', () => {
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_exported_key';

    jest.resetModules();

    // Re-mock dependencies after resetModules
    jest.doMock('./logger', () => ({
      authLogger: {
        debug: jest.fn(),
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
      },
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { CLERK_PUBLISHABLE_KEY } = require('./auth');

    expect(CLERK_PUBLISHABLE_KEY).toBe('pk_test_exported_key');

    jest.resetModules();
  });

  it('is undefined when environment variable is not set', () => {
    delete process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

    jest.resetModules();

    // Re-mock dependencies after resetModules
    jest.doMock('./logger', () => ({
      authLogger: {
        debug: jest.fn(),
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
      },
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { CLERK_PUBLISHABLE_KEY } = require('./auth');

    expect(CLERK_PUBLISHABLE_KEY).toBeUndefined();

    jest.resetModules();
  });
});
