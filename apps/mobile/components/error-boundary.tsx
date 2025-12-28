import type { ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { logger } from '@/lib/logger';

/** Props passed to fallbackRender function */
export interface FallbackRenderProps {
  error: Error;
  resetError: () => void;
}

interface Props {
  children: ReactNode;
  /** Custom fallback UI to display when an error occurs */
  fallback?: ReactNode;
  /** Render function for custom fallback UI with access to error and reset */
  fallbackRender?: (props: FallbackRenderProps) => ReactNode;
  /** Callback fired when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Reset error state when any of these values change */
  resetKeys?: unknown[];
  /** Color scheme for default fallback UI */
  colorScheme?: 'light' | 'dark';
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary component for catching and handling React errors.
 *
 * Must be a class component - functional components cannot be error boundaries.
 *
 * Features:
 * - Custom fallback support via props.fallback (static) or props.fallbackRender (dynamic)
 * - onError callback for logging/analytics
 * - resetKeys - auto-reset error state when specified props change
 * - Manual reset via "Try Again" button
 * - Default fallback UI with light/dark theme support
 *
 * @example
 * ```tsx
 * // Basic usage
 * <ErrorBoundary>
 *   <MyComponent />
 * </ErrorBoundary>
 *
 * // With static fallback
 * <ErrorBoundary fallback={<Text>Something went wrong</Text>}>
 *   <MyComponent />
 * </ErrorBoundary>
 *
 * // With dynamic fallback (access to error and reset function)
 * <ErrorBoundary
 *   fallbackRender={({ error, resetError }) => (
 *     <CustomErrorUI error={error} onRetry={resetError} />
 *   )}
 * >
 *   <MyComponent />
 * </ErrorBoundary>
 *
 * // With error logging and auto-reset
 * <ErrorBoundary
 *   onError={(error, info) => logError(error, info)}
 *   resetKeys={[userId, pageId]}
 * >
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  /**
   * Static method called when an error is thrown during rendering.
   * Updates state to trigger fallback UI rendering.
   */
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  /**
   * Lifecycle method called after an error is caught.
   * Used for logging and invoking the onError callback.
   */
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('ErrorBoundary caught error', {
      error,
      componentStack: errorInfo.componentStack,
    });
    this.props.onError?.(error, errorInfo);
  }

  /**
   * Check if resetKeys have changed and reset error state if so.
   * This allows parent components to programmatically reset the error boundary.
   */
  componentDidUpdate(prevProps: Props) {
    if (this.state.hasError && this.props.resetKeys) {
      const hasKeyChanged = this.props.resetKeys.some((key, i) => key !== prevProps.resetKeys?.[i]);
      if (hasKeyChanged) {
        this.setState({ hasError: false, error: null });
      }
    }
  }

  /**
   * Manual reset handler for "Try Again" button
   */
  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      // Use fallbackRender if provided (gets error and reset function)
      if (this.props.fallbackRender) {
        return this.props.fallbackRender({
          error: this.state.error,
          resetError: this.handleReset,
        });
      }

      // Use static fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI with theme support
      const colors = Colors[this.props.colorScheme ?? 'light'];

      return (
        <View style={styles.container}>
          <Text style={styles.emoji}>⚠️</Text>
          <Text style={[styles.title, { color: colors.text }]}>Something went wrong</Text>
          <Text style={[styles.message, { color: colors.textSecondary }]}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </Text>
          <Pressable
            onPress={this.handleReset}
            style={[styles.button, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.buttonText}>Try Again</Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing['2xl'],
  },
  emoji: {
    fontSize: 48,
    marginBottom: Spacing.lg,
  },
  title: {
    ...Typography.titleMedium,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  message: {
    ...Typography.bodyMedium,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  button: {
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '500',
    fontSize: 16,
  },
});

export default ErrorBoundary;
