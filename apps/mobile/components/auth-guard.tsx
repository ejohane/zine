/**
 * AuthGuard - Protected route wrapper
 *
 * Redirects unauthenticated users to the sign-in screen.
 * Use this component to wrap screens that require authentication.
 */

import { useAuth } from '@clerk/clerk-expo';
import { Redirect } from 'expo-router';
import { type ReactNode } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

// ============================================================================
// Component
// ============================================================================

interface AuthGuardProps {
  children: ReactNode;
  /** Optional override for deterministic tests/stories */
  authStateOverride?: {
    isLoaded: boolean;
    isSignedIn: boolean;
  };
  /** Optional fallback when signed out (defaults to redirect) */
  signedOutFallback?: ReactNode;
}

/**
 * Wraps content that requires authentication.
 *
 * - Shows a loading spinner while auth state is being determined
 * - Redirects to sign-in if user is not authenticated
 * - Renders children if user is authenticated
 *
 * @example
 * ```tsx
 * <AuthGuard>
 *   <ProtectedContent />
 * </AuthGuard>
 * ```
 */
export function AuthGuard({ children, authStateOverride, signedOutFallback }: AuthGuardProps) {
  const auth = useAuth();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isLoaded = authStateOverride?.isLoaded ?? auth.isLoaded;
  const isSignedIn = authStateOverride?.isSignedIn ?? auth.isSignedIn;

  // Show loading state while auth is being determined
  if (!isLoaded) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Redirect to sign-in if not authenticated
  if (!isSignedIn) {
    return signedOutFallback ?? <Redirect href="/(auth)/sign-in" />;
  }

  // User is authenticated, render children
  return <>{children}</>;
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
