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
import { StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components/primitives';
import { ErrorBoundary, type FallbackRenderProps } from './error-boundary';
import { IconSizes, Spacing } from '@/constants/theme';
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
      <Text variant="titleMedium" style={styles.title}>
        {display.title}
      </Text>
      <Text variant="bodyMedium" tone="subheader" style={styles.message}>
        {display.description}
      </Text>
      {error.recoverable && onRetry ? <Button label={buttonText} onPress={onRetry} /> : null}
      {!error.recoverable && (
        <Text variant="bodySmall" tone="tertiary" style={styles.helpText}>
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
  error?: Error | string | OAuthError | null;
}

function isOAuthError(error: unknown): error is OAuthError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    'recoverable' in error
  );
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
    const parsedExternalError = isOAuthError(externalError)
      ? externalError
      : parseOAuthError(externalError);
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
    fontSize: IconSizes['3xl'],
    marginBottom: Spacing.lg,
  },
  title: {
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  message: {
    textAlign: 'center',
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  helpText: {
    textAlign: 'center',
    marginTop: Spacing.md,
  },
});

export default OAuthErrorBoundary;
