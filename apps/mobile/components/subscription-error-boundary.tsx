/**
 * SubscriptionErrorBoundary - Isolates failures in subscription cards.
 *
 * Features:
 * - Wraps individual subscription cards to prevent cascade failures
 * - Detects OAuth-related errors (401, token expired, revoked)
 * - Shows "Reconnect Account" for auth errors, "Try Again" for others
 * - Navigates to provider reconnection flow for auth issues
 *
 * @see frontend-spec.md Section 8.2
 */

import type { ErrorInfo, ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { ErrorBoundary } from './error-boundary';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { logger } from '@/lib/logger';

/**
 * Check if an error is OAuth/authentication related.
 *
 * Detects common auth error patterns:
 * - HTTP 401 status codes
 * - "token expired" messages
 * - "revoked" access errors
 * - "unauthorized" errors
 * - tRPC UNAUTHORIZED codes
 */
function isAuthError(error: Error | null): boolean {
  if (!error) return false;

  const message = error.message.toLowerCase();
  const errorString = String(error).toLowerCase();

  // Check for common auth error patterns
  const authPatterns = [
    '401',
    'unauthorized',
    'token expired',
    'token_expired',
    'expired token',
    'revoked',
    'access_revoked',
    'invalid_grant',
    'invalid token',
    'authentication required',
    'unauthenticated',
  ];

  // Check message and error string
  if (authPatterns.some((pattern) => message.includes(pattern) || errorString.includes(pattern))) {
    return true;
  }

  // Check for tRPC error codes (if error has data property)
  const errorWithData = error as Error & { data?: { code?: string } };
  if (errorWithData.data?.code === 'UNAUTHORIZED') {
    return true;
  }

  return false;
}

interface SubscriptionErrorFallbackProps {
  provider?: 'YOUTUBE' | 'SPOTIFY' | 'GMAIL';
  onRetry?: () => void;
}

function SubscriptionErrorFallback({ provider, onRetry }: SubscriptionErrorFallbackProps) {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // Use error color with transparency for background since errorLight isn't in theme
  const errorBackgroundColor =
    colorScheme === 'dark' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)';

  const handleReconnect = () => {
    // Navigate to provider connect screen
    if (provider === 'SPOTIFY') {
      router.push('/subscriptions/connect/spotify');
    } else if (provider === 'GMAIL') {
      router.push('/subscriptions/connect/gmail');
    } else {
      router.push('/subscriptions/connect/youtube');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: errorBackgroundColor }]}>
      <Text style={[styles.title, { color: colors.error }]}>Failed to load subscription</Text>
      <Text style={[styles.message, { color: colors.error }]}>
        There was a problem displaying this content.
      </Text>

      <View style={styles.buttonRow}>
        {onRetry && (
          <Pressable
            onPress={onRetry}
            style={[
              styles.button,
              { backgroundColor: errorBackgroundColor, borderWidth: 1, borderColor: colors.error },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Text style={[styles.buttonText, { color: colors.error }]}>Try Again</Text>
          </Pressable>
        )}

        <Pressable
          onPress={handleReconnect}
          style={styles.buttonSecondary}
          accessibilityRole="button"
          accessibilityLabel="Reconnect account"
        >
          <Text style={[styles.buttonTextSecondary, { color: colors.textSecondary }]}>
            Reconnect Account
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

interface SubscriptionErrorBoundaryProps {
  children: ReactNode;
  /** Subscription ID for logging and reset key */
  subscriptionId?: string;
  /** Provider type for reconnection navigation */
  provider?: 'YOUTUBE' | 'SPOTIFY' | 'GMAIL';
  /** Callback when retry is clicked */
  onRetry?: () => void;
}

/**
 * Error boundary specialized for subscription cards.
 *
 * Wraps subscription content to isolate failures. When an error occurs:
 * - For auth errors: Shows "Reconnect Account" and navigates to OAuth flow
 * - For other errors: Shows "Try Again" button
 *
 * @example
 * ```tsx
 * <SubscriptionErrorBoundary
 *   subscriptionId={subscription.id}
 *   provider={subscription.provider}
 *   onRetry={refetch}
 * >
 *   <SubscriptionCard subscription={subscription} />
 * </SubscriptionErrorBoundary>
 * ```
 */
export function SubscriptionErrorBoundary({
  children,
  subscriptionId,
  provider,
  onRetry,
}: SubscriptionErrorBoundaryProps) {
  const handleError = (error: Error, errorInfo: ErrorInfo) => {
    const isAuth = isAuthError(error);
    logger.error('Subscription error', {
      subscriptionId,
      provider,
      isAuthError: isAuth,
      errorMessage: error.message,
      componentStack: errorInfo.componentStack,
    });
  };

  return (
    <ErrorBoundary
      onError={handleError}
      resetKeys={[subscriptionId]}
      fallback={<SubscriptionErrorFallback provider={provider} onRetry={onRetry} />}
    >
      {children}
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
  },
  title: {
    fontWeight: '500',
    marginBottom: Spacing.sm,
  },
  message: {
    fontSize: 14,
    marginBottom: Spacing.md,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flexWrap: 'wrap',
  },
  button: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
    alignSelf: 'flex-start',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '500',
    fontSize: 14,
  },
  buttonSecondary: {
    paddingVertical: Spacing.sm,
  },
  buttonTextSecondary: {
    fontWeight: '500',
    fontSize: 14,
  },
});

export default SubscriptionErrorBoundary;
