/**
 * AuthProvider - Clerk authentication wrapper
 *
 * Provides Clerk authentication context to the app with secure token caching.
 */

import { useAuth, ClerkProvider, ClerkLoaded } from '@clerk/clerk-expo';
import { createContext, type ReactNode, useContext, useEffect, useRef } from 'react';
import { tokenCache, CLERK_PUBLISHABLE_KEY, validateClerkConfig } from '@/lib/auth';
import { captureAuthDiagnostic } from '@/lib/auth-diagnostics';
import { authLogger } from '@/lib/logger';

interface AuthProviderProps {
  children: ReactNode;
}

interface AuthAvailabilityValue {
  isEnabled: boolean;
}

const AuthAvailabilityContext = createContext<AuthAvailabilityValue>({
  isEnabled: Boolean(CLERK_PUBLISHABLE_KEY),
});

export function useAuthAvailability() {
  return useContext(AuthAvailabilityContext);
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

  const authAvailability = {
    isEnabled: Boolean(CLERK_PUBLISHABLE_KEY),
  };

  // If no publishable key is configured, render children without auth
  // This allows the app to run in development without Clerk configured
  if (!CLERK_PUBLISHABLE_KEY) {
    if (__DEV__) {
      authLogger.warn(
        'Running without Clerk authentication. Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to enable auth.'
      );
    }
    return (
      <AuthAvailabilityContext.Provider value={authAvailability}>
        {children}
      </AuthAvailabilityContext.Provider>
    );
  }

  return (
    <AuthAvailabilityContext.Provider value={authAvailability}>
      <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
        <ClerkLoaded>
          <AuthLifecycleDiagnostics>{children}</AuthLifecycleDiagnostics>
        </ClerkLoaded>
      </ClerkProvider>
    </AuthAvailabilityContext.Provider>
  );
}

function AuthLifecycleDiagnostics({ children }: AuthProviderProps) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const previousStateRef = useRef<'loading' | 'signed_in' | 'signed_out'>('loading');

  useEffect(() => {
    if (!isLoaded) {
      previousStateRef.current = 'loading';
      return;
    }

    const nextState = isSignedIn ? 'signed_in' : 'signed_out';
    const previousState = previousStateRef.current;
    previousStateRef.current = nextState;

    if (previousState === 'signed_in' && nextState === 'signed_out') {
      authLogger.warn('Clerk auth state changed from signed-in to signed-out', {
        hasUserId: Boolean(userId),
      });
      captureAuthDiagnostic('provider.signed_out_after_signed_in', {
        previousState,
        nextState,
        hadUserId: Boolean(userId),
      });
    }
  }, [isLoaded, isSignedIn, userId]);

  return <>{children}</>;
}
