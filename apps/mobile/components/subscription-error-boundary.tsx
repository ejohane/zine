/**
 * SubscriptionErrorBoundary - Isolates failures in subscription cards.
 *
 * Features:
 * - Wraps individual subscription cards to prevent cascade failures
 * - Detects OAuth-related errors (401, token expired, revoked)
 * - Shows "Reconnect Integration" for auth errors, "Try Again" for others
 * - Navigates to the canonical source screen for auth issues
 *
 * @see frontend-spec.md Section 8.2
 */

import type { ErrorInfo, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button, Surface, Text } from '@/components/primitives';
import { ErrorBoundary } from './error-boundary';
import { Spacing } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
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
  const { colors } = useAppTheme();

  const handleReconnect = () => {
    // Navigate to the canonical source screen; auth can be resolved there.
    if (provider === 'SPOTIFY') {
      router.push('/subscriptions/spotify');
    } else if (provider === 'GMAIL') {
      router.push('/subscriptions/gmail');
    } else {
      router.push('/subscriptions/youtube');
    }
  };

  return (
    <Surface tone="error" border="tone" padding="lg" style={styles.container}>
      <Text variant="titleMedium" tone="error" style={styles.title}>
        Failed to load subscription
      </Text>
      <Text variant="bodyMedium" tone="error" style={styles.message}>
        There was a problem displaying this content.
      </Text>

      <View style={styles.buttonRow}>
        {onRetry ? (
          <Button
            label="Try Again"
            onPress={onRetry}
            variant="outline"
            tone="danger"
            accessibilityLabel="Try again"
          />
        ) : null}

        <Button
          label="Reconnect Integration"
          onPress={handleReconnect}
          variant="ghost"
          accessibilityLabel="Reconnect integration"
          labelStyle={{ color: colors.textSecondary }}
        />
      </View>
    </Surface>
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
 * - For auth errors: Shows "Reconnect Integration" and navigates to the source screen
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
  container: {},
  title: {
    marginBottom: Spacing.sm,
  },
  message: {
    marginBottom: Spacing.md,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flexWrap: 'wrap',
  },
});

export default SubscriptionErrorBoundary;
