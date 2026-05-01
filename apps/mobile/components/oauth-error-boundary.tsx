import type { ErrorInfo, ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { OAuthProvider } from '@zine/shared/types';

import { Button, Text } from '@/components/primitives';
import { ErrorBoundary, type FallbackRenderProps } from './error-boundary';
import { IconSizes, Spacing } from '@/constants/theme';
import { parseOAuthError, getOAuthErrorDisplay, type OAuthError } from '@/lib/oauth-errors';
import { oauthLogger } from '@/lib/logger';

interface OAuthErrorFallbackProps {
  provider: OAuthProvider;
  error: OAuthError;
  onRetry?: () => void;
}

function getProviderName(provider: OAuthProvider): string {
  if (provider === 'YOUTUBE') return 'YouTube';
  if (provider === 'SPOTIFY') return 'Spotify';
  if (provider === 'X') return 'X';
  return 'Gmail';
}

function OAuthErrorFallback({ provider, error, onRetry }: OAuthErrorFallbackProps) {
  const providerName = getProviderName(provider);
  const display = getOAuthErrorDisplay(error.code, providerName);

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
  provider: OAuthProvider;
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

export function OAuthErrorBoundary({
  children,
  provider,
  onRetry,
  error: externalError,
}: OAuthErrorBoundaryProps) {
  const [resetTrigger, setResetTrigger] = useState(0);

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

  const handleRetry = useCallback(() => {
    setResetTrigger((prev) => prev + 1);
    onRetry?.();
  }, [onRetry]);

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
