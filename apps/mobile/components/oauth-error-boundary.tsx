import type { ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { parseOAuthError, getOAuthErrorDisplay, type OAuthError } from '@/lib/oauth-errors';

interface OAuthErrorFallbackProps {
  provider: 'YOUTUBE' | 'SPOTIFY';
  error: OAuthError;
  onRetry?: () => void;
}

/**
 * Get provider display name for user-facing messages.
 */
function getProviderName(provider: 'YOUTUBE' | 'SPOTIFY'): string {
  return provider === 'YOUTUBE' ? 'YouTube' : 'Spotify';
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
  provider: 'YOUTUBE' | 'SPOTIFY';
  onRetry?: () => void;
  /** Optional error to display directly (for non-React error flows) */
  error?: Error | string | null;
}

interface OAuthErrorBoundaryState {
  hasError: boolean;
  parsedError: OAuthError | null;
}

/**
 * Error boundary specifically for OAuth connection flows.
 *
 * Features:
 * - Catches React errors during OAuth flows
 * - Classifies errors using parseOAuthError for specialized UI
 * - Shows different emoji/title based on error type:
 *   - USER_CANCELLED: 🚫 Connection Cancelled
 *   - USER_DENIED: 🔒 Access Denied
 *   - NETWORK_ERROR: 📡 Connection Problem
 *   - STATE_MISMATCH: 🔐 Security Check Failed
 * - Provides provider-specific error messages
 * - Offers retry callback for recoverable errors
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
export class OAuthErrorBoundary extends Component<
  OAuthErrorBoundaryProps,
  OAuthErrorBoundaryState
> {
  state: OAuthErrorBoundaryState = {
    hasError: false,
    parsedError: null,
  };

  static getDerivedStateFromError(error: Error): Partial<OAuthErrorBoundaryState> {
    const parsedError = parseOAuthError(error);
    return { hasError: true, parsedError };
  }

  static getDerivedStateFromProps(
    props: OAuthErrorBoundaryProps,
    state: OAuthErrorBoundaryState
  ): Partial<OAuthErrorBoundaryState> | null {
    // Handle externally passed errors (e.g., from OAuth callback)
    if (props.error && !state.hasError) {
      const parsedError = parseOAuthError(props.error);
      return { hasError: true, parsedError };
    }
    // Clear error state if external error is cleared
    if (!props.error && state.hasError && state.parsedError) {
      return { hasError: false, parsedError: null };
    }
    return null;
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { provider } = this.props;
    console.error(`[OAuthError:${provider}]`, error.message, {
      errorInfo: errorInfo.componentStack,
      errorCode: this.state.parsedError?.code,
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, parsedError: null });
    this.props.onRetry?.();
  };

  render() {
    const { children, provider } = this.props;
    const { hasError, parsedError } = this.state;

    if (hasError && parsedError) {
      return (
        <OAuthErrorFallbackWrapper
          provider={provider}
          error={parsedError}
          onRetry={this.handleRetry}
        />
      );
    }

    return children;
  }
}

/**
 * Wrapper component to use hooks in the fallback UI.
 * Since OAuthErrorBoundary is a class component, we need this wrapper
 * to access the useColorScheme hook.
 */
function OAuthErrorFallbackWrapper(props: OAuthErrorFallbackProps) {
  return <OAuthErrorFallback {...props} />;
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
