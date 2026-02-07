/**
 * OAuthErrorBoundary - Error boundary specifically for OAuth connection flows.
 *
 * Features:
 * - Catches React errors during OAuth flows
 * - Classifies errors using parseOAuthError for specialized UI
 * - Shows different emoji/title based on error type
 * - Provides provider-specific error messages
 * - Offers retry callback for recoverable errors
 *
 * @see frontend-spec.md Section 8.2
 */

import type { ErrorInfo, ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ErrorBoundary, type FallbackRenderProps } from './error-boundary';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { parseOAuthError, getOAuthErrorDisplay, type OAuthError } from '@/lib/oauth-errors';
import { oauthLogger } from '@/lib/logger';

interface OAuthErrorFallbackProps {
  provider: 'YOUTUBE' | 'SPOTIFY' | 'GMAIL';
  error: OAuthError;
  onRetry?: () => void;
}

/**
 * Get provider display name for user-facing messages.
 */
function getProviderName(provider: 'YOUTUBE' | 'SPOTIFY' | 'GMAIL'): string {
  if (provider === 'YOUTUBE') return 'YouTube';
  if (provider === 'SPOTIFY') return 'Spotify';
  return 'Gmail';
}

/**
 * Fallback component displayed when OAuth-related errors occur.
 * Shows specialized UI based on the error type.
 */
function OAuthErrorFallback({ provider, error, onRetry }: OAuthErrorFallbackProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const providerName = getProviderName(provider);
  const display = getOAuthErrorDisplay(error.code, providerName);

  // Determine button text based on action
  const buttonText =
    error.action === 'reauthorize'
      ? 'Reconnect'
      : error.action === 'contact_support'
        ? 'Get Help'
        : 'Try Again';

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>{display.emoji}</Text>
      <Text style={[styles.title, { color: colors.text }]}>{display.title}</Text>
      <Text style={[styles.message, { color: colors.textSecondary }]}>{display.description}</Text>
      {error.recoverable && onRetry && (
        <Pressable onPress={onRetry} style={[styles.button, { backgroundColor: colors.primary }]}>
          <Text style={styles.buttonText}>{buttonText}</Text>
        </Pressable>
      )}
      {!error.recoverable && (
        <Text style={[styles.helpText, { color: colors.textTertiary }]}>
          If this problem persists, please contact support.
        </Text>
      )}
    </View>
  );
}

interface OAuthErrorBoundaryProps {
  children: ReactNode;
  provider: 'YOUTUBE' | 'SPOTIFY' | 'GMAIL';
  onRetry?: () => void;
  /** Optional error to display directly (for non-React error flows) */
  error?: Error | string | null;
}

/**
 * Error boundary specifically for OAuth connection flows.
 *
 * Uses the base ErrorBoundary with a specialized fallbackRender that:
 * - Parses OAuth errors to determine type (USER_CANCELLED, NETWORK_ERROR, etc.)
 * - Shows provider-specific error messages
 * - Provides appropriate recovery actions
 *
 * @example
 * ```tsx
 * <OAuthErrorBoundary provider="YOUTUBE" onRetry={handleRetry}>
 *   <YouTubeConnectScreen />
 * </OAuthErrorBoundary>
 *
 * // With pre-existing error (from navigation params, etc.)
 * <OAuthErrorBoundary
 *   provider="SPOTIFY"
 *   error={route.params?.error}
 *   onRetry={handleRetry}
 * >
 *   <SpotifyConnectScreen />
 * </OAuthErrorBoundary>
 * ```
 */
export function OAuthErrorBoundary({
  children,
  provider,
  onRetry,
  error: externalError,
}: OAuthErrorBoundaryProps) {
  // Track reset trigger for external errors
  const [resetTrigger, setResetTrigger] = useState(0);

  // Handle error logging
  const handleError = useCallback(
    (error: Error, errorInfo: ErrorInfo) => {
      const parsedError = parseOAuthError(error);
      oauthLogger.error('OAuth error boundary caught error', {
        provider,
        errorMessage: error.message,
        errorCode: parsedError.code,
        componentStack: errorInfo.componentStack,
      });
    },
    [provider]
  );

  // Handle retry - reset both internal and external error state
  const handleRetry = useCallback(() => {
    setResetTrigger((prev) => prev + 1);
    onRetry?.();
  }, [onRetry]);

  // Render fallback with parsed OAuth error
  const renderFallback = useCallback(
    ({ error, resetError }: FallbackRenderProps) => {
      const parsedError = parseOAuthError(error);
      const handleFallbackRetry = () => {
        resetError();
        onRetry?.();
      };
      return (
        <OAuthErrorFallback provider={provider} error={parsedError} onRetry={handleFallbackRetry} />
      );
    },
    [provider, onRetry]
  );

  // Handle external errors (from navigation params, etc.)
  if (externalError) {
    const parsedExternalError = parseOAuthError(externalError);
    return (
      <OAuthErrorFallback provider={provider} error={parsedExternalError} onRetry={handleRetry} />
    );
  }

  return (
    <ErrorBoundary fallbackRender={renderFallback} onError={handleError} resetKeys={[resetTrigger]}>
      {children}
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing['2xl'],
  },
  emoji: {
    fontSize: 64,
    marginBottom: Spacing.lg,
  },
  title: {
    ...Typography.titleMedium,
    fontWeight: '600',
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  message: {
    ...Typography.bodyMedium,
    textAlign: 'center',
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  button: {
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  helpText: {
    ...Typography.bodySmall,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
});

export default OAuthErrorBoundary;
