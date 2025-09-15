import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const TOKEN_CACHE_KEY = 'clerk_token_cache';

export interface TokenCache {
  getToken: (key: string) => Promise<string | null>;
  saveToken: (key: string, token: string) => Promise<void>;
  clearToken: (key?: string) => Promise<void>;
}

class SecureTokenCache implements TokenCache {
  private canUseSecureStore: boolean;

  constructor() {
    // SecureStore is not available on web
    this.canUseSecureStore = Platform.OS !== 'web';
  }

  async getToken(key: string): Promise<string | null> {
    if (!this.canUseSecureStore) {
      // Fallback for web - use sessionStorage
      if (typeof window !== 'undefined' && window.sessionStorage) {
        return window.sessionStorage.getItem(`${TOKEN_CACHE_KEY}_${key}`);
      }
      return null;
    }

    try {
      const token = await SecureStore.getItemAsync(`${TOKEN_CACHE_KEY}_${key}`);
      return token;
    } catch (error) {
      console.error('Error retrieving token from secure store:', error);
      return null;
    }
  }

  async saveToken(key: string, token: string): Promise<void> {
    if (!this.canUseSecureStore) {
      // Fallback for web - use sessionStorage
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem(`${TOKEN_CACHE_KEY}_${key}`, token);
      }
      return;
    }

    try {
      await SecureStore.setItemAsync(`${TOKEN_CACHE_KEY}_${key}`, token);
    } catch (error) {
      console.error('Error saving token to secure store:', error);
      throw error;
    }
  }

  async clearToken(key?: string): Promise<void> {
    if (!this.canUseSecureStore) {
      // Fallback for web - clear sessionStorage
      if (typeof window !== 'undefined' && window.sessionStorage) {
        if (key) {
          window.sessionStorage.removeItem(`${TOKEN_CACHE_KEY}_${key}`);
        } else {
          // Clear all clerk tokens
          const keysToRemove: string[] = [];
          for (let i = 0; i < window.sessionStorage.length; i++) {
            const storageKey = window.sessionStorage.key(i);
            if (storageKey?.startsWith(TOKEN_CACHE_KEY)) {
              keysToRemove.push(storageKey);
            }
          }
          keysToRemove.forEach(k => window.sessionStorage.removeItem(k));
        }
      }
      return;
    }

    try {
      if (key) {
        await SecureStore.deleteItemAsync(`${TOKEN_CACHE_KEY}_${key}`);
      } else {
        // Clear all tokens - SecureStore doesn't have a way to list all keys,
        // so we'll clear known keys
        const knownKeys = ['session', 'user', 'client'];
        await Promise.all(
          knownKeys.map(k => 
            SecureStore.deleteItemAsync(`${TOKEN_CACHE_KEY}_${k}`).catch(() => {})
          )
        );
      }
    } catch (error) {
      console.error('Error clearing token from secure store:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const tokenCache = new SecureTokenCache();

// Clerk-specific token cache adapter
export const clerkTokenCache = {
  getToken: async (key: string) => {
    return tokenCache.getToken(key);
  },
  saveToken: async (key: string, token: string) => {
    return tokenCache.saveToken(key, token);
  },
  clearToken: async (key?: string) => {
    return tokenCache.clearToken(key);
  },
};