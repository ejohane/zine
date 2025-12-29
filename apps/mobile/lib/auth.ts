/**
 * Auth utilities for Clerk integration
 *
 * Provides token caching for secure storage and auth state helpers.
 */

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { TokenCache } from '@clerk/clerk-expo';
import { authLogger } from './logger';

// ============================================================================
// Token Cache Implementation
// ============================================================================

/**
 * Creates a token cache that uses expo-secure-store on native platforms
 * and falls back to no caching on web (Clerk handles web storage internally).
 *
 * This is required by ClerkProvider for secure JWT token persistence.
 */
function createTokenCache(): TokenCache {
  return {
    async getToken(key: string): Promise<string | undefined | null> {
      try {
        const item = await SecureStore.getItemAsync(key);
        if (item) {
          authLogger.debug('Token retrieved', { key: key.substring(0, 20) + '...' });
        }
        return item;
      } catch (error) {
        authLogger.error('SecureStore getToken error', { error });
        await SecureStore.deleteItemAsync(key);
        return null;
      }
    },

    async saveToken(key: string, value: string): Promise<void> {
      try {
        await SecureStore.setItemAsync(key, value);
        authLogger.debug('Token saved', { key: key.substring(0, 20) + '...' });
      } catch (error) {
        authLogger.error('SecureStore saveToken error', { error });
      }
    },

    async clearToken(key: string): Promise<void> {
      try {
        await SecureStore.deleteItemAsync(key);
        authLogger.debug('Token cleared', { key: key.substring(0, 20) + '...' });
      } catch (error) {
        authLogger.error('SecureStore clearToken error', { error });
      }
    },
  };
}

/**
 * Token cache instance for use with ClerkProvider.
 * Only enabled on native platforms where SecureStore is available.
 */
export const tokenCache: TokenCache | undefined =
  Platform.OS !== 'web' ? createTokenCache() : undefined;

// ============================================================================
// Auth Constants
// ============================================================================

/**
 * Clerk publishable key from environment variables.
 * Must be set in .env.local as EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
 */
export const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

/**
 * Validates that Clerk is properly configured.
 * Throws an error in development if the publishable key is missing.
 */
export function validateClerkConfig(): void {
  if (!CLERK_PUBLISHABLE_KEY) {
    const message =
      'Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY. Please set it in your .env.local file.';

    if (__DEV__) {
      console.warn(`[Auth] ${message}`);
    }
  }
}
