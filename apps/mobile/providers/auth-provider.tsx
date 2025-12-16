/**
 * AuthProvider - Clerk authentication wrapper
 *
 * Provides Clerk authentication context to the app with secure token caching.
 */

import { ClerkProvider, ClerkLoaded } from '@clerk/clerk-expo';
import { type ReactNode } from 'react';
import { tokenCache, CLERK_PUBLISHABLE_KEY, validateClerkConfig } from '@/lib/auth';

// ============================================================================
// Provider Component
// ============================================================================

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Wraps the application with Clerk authentication.
 *
 * Features:
 * - Secure token caching via expo-secure-store
 * - Automatic session management
 * - Auth state available via useAuth, useUser, useClerk hooks
 *
 * @example
 * ```tsx
 * <AuthProvider>
 *   <App />
 * </AuthProvider>
 * ```
 */
export function AuthProvider({ children }: AuthProviderProps) {
  // Validate configuration on mount
  validateClerkConfig();

  // If no publishable key is configured, render children without auth
  // This allows the app to run in development without Clerk configured
  if (!CLERK_PUBLISHABLE_KEY) {
    if (__DEV__) {
      console.warn(
        '[AuthProvider] Running without Clerk authentication. Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to enable auth.'
      );
    }
    return <>{children}</>;
  }

  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
      <ClerkLoaded>{children}</ClerkLoaded>
    </ClerkProvider>
  );
}
