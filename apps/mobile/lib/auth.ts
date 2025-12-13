/**
 * Authentication helpers for the mobile app
 *
 * Provides secure token storage and auth utilities for Clerk integration.
 *
 * @module lib/auth
 */

import * as SecureStore from 'expo-secure-store';
import { useAuth, useUser } from '@clerk/clerk-expo';
import type { TokenCache } from '@clerk/clerk-expo';

// ============================================================================
// Token Cache
// ============================================================================

/**
 * Token cache implementation for Clerk using expo-secure-store.
 * Securely stores authentication tokens on the device.
 *
 * This is passed to the ClerkProvider to persist tokens across app restarts.
 *
 * @example
 * ```tsx
 * import { ClerkProvider } from '@clerk/clerk-expo';
 * import { tokenCache } from '@/lib/auth';
 *
 * <ClerkProvider tokenCache={tokenCache} publishableKey={CLERK_KEY}>
 *   <App />
 * </ClerkProvider>
 * ```
 */
export const tokenCache: TokenCache = {
  async getToken(key: string): Promise<string | null> {
    try {
      const item = await SecureStore.getItemAsync(key);
      return item;
    } catch (error) {
      console.error('SecureStore getToken error:', error);
      // If there's an error reading, the token may be corrupted
      await SecureStore.deleteItemAsync(key);
      return null;
    }
  },
  async saveToken(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (error) {
      console.error('SecureStore saveToken error:', error);
    }
  },
};

// ============================================================================
// Auth Hooks
// ============================================================================

/**
 * Hook to get the current authentication token for API requests.
 *
 * Returns a function that fetches a fresh token each time it's called.
 * The token is automatically refreshed by Clerk when needed.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { getToken } = useAuthToken();
 *
 *   const fetchData = async () => {
 *     const token = await getToken();
 *     if (!token) {
 *       // User is not signed in
 *       return;
 *     }
 *     const response = await fetch('/api/data', {
 *       headers: { Authorization: `Bearer ${token}` },
 *     });
 *   };
 *
 *   return <Button onPress={fetchData}>Fetch Data</Button>;
 * }
 * ```
 */
export function useAuthToken() {
  const { getToken, isSignedIn, isLoaded } = useAuth();

  return {
    /**
     * Get a fresh authentication token for API requests.
     * Returns null if user is not signed in.
     */
    getToken: async (): Promise<string | null> => {
      if (!isLoaded || !isSignedIn) {
        return null;
      }
      try {
        const token = await getToken();
        return token;
      } catch (error) {
        console.error('Error getting auth token:', error);
        return null;
      }
    },
    /** Whether the auth state has finished loading */
    isLoaded,
    /** Whether the user is currently signed in */
    isSignedIn,
  };
}

/**
 * Hook to get the current user ID.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { userId, isSignedIn } = useUserId();
 *
 *   if (!isSignedIn) {
 *     return <Text>Please sign in</Text>;
 *   }
 *
 *   return <Text>User ID: {userId}</Text>;
 * }
 * ```
 */
export function useUserId() {
  const { userId, isSignedIn, isLoaded } = useAuth();

  return {
    /** The current user's Clerk ID, or null if not signed in */
    userId: isSignedIn ? userId : null,
    /** Whether the auth state has finished loading */
    isLoaded,
    /** Whether the user is currently signed in */
    isSignedIn,
  };
}

/**
 * Hook to get the current user's profile information.
 *
 * @example
 * ```tsx
 * function ProfileScreen() {
 *   const { user, isLoaded } = useUserProfile();
 *
 *   if (!isLoaded) {
 *     return <ActivityIndicator />;
 *   }
 *
 *   if (!user) {
 *     return <Text>Please sign in</Text>;
 *   }
 *
 *   return (
 *     <View>
 *       <Image source={{ uri: user.imageUrl }} />
 *       <Text>{user.firstName} {user.lastName}</Text>
 *       <Text>{user.primaryEmail}</Text>
 *     </View>
 *   );
 * }
 * ```
 */
export function useUserProfile() {
  const { user, isLoaded, isSignedIn } = useUser();

  if (!isLoaded || !isSignedIn || !user) {
    return {
      user: null,
      isLoaded,
      isSignedIn,
    };
  }

  return {
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      imageUrl: user.imageUrl,
      primaryEmail: user.primaryEmailAddress?.emailAddress ?? null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    isLoaded,
    isSignedIn,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create headers with authentication for API requests.
 *
 * @param token - The auth token from useAuthToken().getToken()
 * @returns Headers object with Authorization and Content-Type
 *
 * @example
 * ```tsx
 * const { getToken } = useAuthToken();
 *
 * const fetchData = async () => {
 *   const token = await getToken();
 *   if (!token) return;
 *
 *   const response = await fetch('/api/data', {
 *     method: 'GET',
 *     headers: createAuthHeaders(token),
 *   });
 * };
 * ```
 */
export function createAuthHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}
/**
 * API base URL for the backend worker.
 * Configure via EXPO_PUBLIC_API_URL environment variable.
 * Falls back to localhost for development.
 */
export const API_BASE_URL = 'http://localhost:8787';

/**
 * Make an authenticated API request.
 *
 * @param path - API path (e.g., '/api/auth/me')
 * @param token - Auth token from useAuthToken().getToken()
 * @param options - Additional fetch options
 * @returns Fetch response
 *
 * @example
 * ```tsx
 * const { getToken } = useAuthToken();
 *
 * const fetchProfile = async () => {
 *   const token = await getToken();
 *   if (!token) throw new Error('Not authenticated');
 *
 *   const response = await authenticatedFetch('/api/auth/me', token);
 *   if (!response.ok) throw new Error('Failed to fetch profile');
 *
 *   return response.json();
 * };
 * ```
 */
export async function authenticatedFetch(
  path: string,
  token: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${API_BASE_URL}${path}`;

  return fetch(url, {
    ...options,
    headers: {
      ...createAuthHeaders(token),
      ...options.headers,
    },
  });
}
