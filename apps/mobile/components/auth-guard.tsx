/**
 * AuthGuard - Protected route wrapper
 *
 * Redirects unauthenticated users to the sign-in screen.
 * Use this component to wrap screens that require authentication.
 */

import { useAuth } from '@clerk/clerk-expo';
import { Redirect } from 'expo-router';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

import { useAppTheme } from '@/hooks/use-app-theme';
import { captureAuthDiagnostic } from '@/lib/auth-diagnostics';
import { authLogger } from '@/lib/logger';
import { useAuthAvailability } from '@/providers/auth-provider';

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

const SIGNED_OUT_REDIRECT_GRACE_MS = 15_000;

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
  const { isEnabled } = useAuthAvailability();

  if (!isEnabled) {
    return <>{children}</>;
  }

  return (
    <ClerkAuthGuard authStateOverride={authStateOverride} signedOutFallback={signedOutFallback}>
      {children}
    </ClerkAuthGuard>
  );
}

function ClerkAuthGuard({ children, authStateOverride, signedOutFallback }: AuthGuardProps) {
  const auth = useAuth();
  const { colors } = useAppTheme();
  const isLoaded = authStateOverride?.isLoaded ?? auth.isLoaded;
  const isSignedIn = authStateOverride?.isSignedIn ?? auth.isSignedIn;
  const hasObservedSignedInRef = useRef(false);
  const signedOutStartedAtRef = useRef<number | null>(null);
  const hasReportedRedirectRef = useRef(false);
  const [signedOutGraceUntil, setSignedOutGraceUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (isSignedIn) {
      hasObservedSignedInRef.current = true;
      signedOutStartedAtRef.current = null;
      hasReportedRedirectRef.current = false;

      if (signedOutGraceUntil !== null) {
        authLogger.warn('Clerk signed-in state recovered before auth redirect grace expired', {
          graceUntil: signedOutGraceUntil,
        });
        captureAuthDiagnostic(
          'guard.signed_in_recovered',
          {
            graceUntil: signedOutGraceUntil,
          },
          'warning'
        );
        setSignedOutGraceUntil(null);
      }
      return;
    }

    if (!hasObservedSignedInRef.current) {
      return;
    }

    const startedAt = Date.now();
    signedOutStartedAtRef.current = signedOutStartedAtRef.current ?? startedAt;

    if (signedOutGraceUntil === null) {
      const graceUntil = startedAt + SIGNED_OUT_REDIRECT_GRACE_MS;
      authLogger.warn('Temporarily holding signed-out auth redirect while Clerk session settles', {
        graceMs: SIGNED_OUT_REDIRECT_GRACE_MS,
      });
      captureAuthDiagnostic('guard.signed_out_grace_started', {
        graceMs: SIGNED_OUT_REDIRECT_GRACE_MS,
      });
      setNow(startedAt);
      setSignedOutGraceUntil(graceUntil);
    }
  }, [isLoaded, isSignedIn, signedOutGraceUntil]);

  useEffect(() => {
    if (signedOutGraceUntil === null) {
      return;
    }

    const delayMs = Math.max(0, signedOutGraceUntil - Date.now());
    const timeout = setTimeout(() => {
      setNow(Date.now());
    }, delayMs);

    return () => clearTimeout(timeout);
  }, [signedOutGraceUntil]);

  useEffect(() => {
    if (
      !isLoaded ||
      isSignedIn ||
      !hasObservedSignedInRef.current ||
      signedOutGraceUntil === null ||
      now < signedOutGraceUntil ||
      hasReportedRedirectRef.current
    ) {
      return;
    }

    hasReportedRedirectRef.current = true;
    const signedOutDurationMs =
      signedOutStartedAtRef.current === null
        ? undefined
        : Date.now() - signedOutStartedAtRef.current;

    authLogger.warn('Redirecting to sign-in after signed-out auth state persisted', {
      signedOutDurationMs,
    });
    captureAuthDiagnostic('guard.redirect_after_signed_out_grace', {
      signedOutDurationMs,
    });
  }, [isLoaded, isSignedIn, now, signedOutGraceUntil]);

  // Show loading state while auth is being determined
  if (!isLoaded) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surfaceCanvas }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const shouldHoldSignedOutRedirect =
    !isSignedIn &&
    hasObservedSignedInRef.current &&
    (signedOutGraceUntil === null || now < signedOutGraceUntil);

  if (shouldHoldSignedOutRedirect) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surfaceCanvas }]}>
        <ActivityIndicator size="large" color={colors.accent} />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
