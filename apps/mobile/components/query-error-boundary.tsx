import type { ReactNode } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQueryErrorResetBoundary } from '@tanstack/react-query';

import { Button, Text } from '@/components/primitives';
import { ErrorBoundary } from './error-boundary';
import { IconSizes, Spacing } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { isNetworkError, getErrorMessage } from '@/lib/error-utils';

interface QueryErrorBoundaryProps {
  children: ReactNode;
  /** Query keys to use as reset triggers */
  queryKey?: unknown[];
  /** Custom fallback message for errors */
  fallbackMessage?: string;
}

/**
 * QueryErrorBoundary component that integrates with React Query.
 *
 * This boundary wraps the base ErrorBoundary and adds React Query-specific
 * functionality:
 * - Uses useQueryErrorResetBoundary to reset React Query error state
 * - Detects network-related errors and shows appropriate messages
 * - Resets both boundary and query error state on retry
 *
 * @example
 * ```tsx
 * // Basic usage
 * <QueryErrorBoundary>
 *   <MyQueryComponent />
 * </QueryErrorBoundary>
 *
 * // With custom message and query key reset triggers
 * <QueryErrorBoundary
 *   queryKey={['user', userId]}
 *   fallbackMessage="Failed to load user data"
 * >
 *   <UserProfile />
 * </QueryErrorBoundary>
 * ```
 */
export function QueryErrorBoundary({
  children,
  queryKey,
  fallbackMessage,
}: QueryErrorBoundaryProps) {
  const { colorScheme } = useAppTheme();
  const { reset: resetQueryError } = useQueryErrorResetBoundary();

  // Track the current error for custom fallback UI
  const [currentError, setCurrentError] = useState<Error | null>(null);

  // Reset keys - combine query key with internal reset trigger
  const [resetTrigger, setResetTrigger] = useState(0);
  const resetKeys = useMemo(() => [resetTrigger, ...(queryKey ?? [])], [resetTrigger, queryKey]);

  // Handle error capture
  const handleError = useCallback((error: Error) => {
    setCurrentError(error);
  }, []);

  // Handle reset - clears both boundary and React Query error state
  const handleReset = useCallback(() => {
    resetQueryError();
    setCurrentError(null);
    setResetTrigger((prev) => prev + 1);
  }, [resetQueryError]);

  // Custom fallback UI
  const fallback = useMemo(() => {
    const errorMessage = getErrorMessage(currentError, fallbackMessage);
    const isNetwork = currentError ? isNetworkError(currentError) : false;

    return (
      <View style={styles.container}>
        <Text style={styles.emoji}>{isNetwork ? '📡' : '⚠️'}</Text>
        <Text variant="titleMedium" style={styles.title}>
          {isNetwork ? 'Connection Problem' : 'Something went wrong'}
        </Text>
        <Text variant="bodyMedium" tone="secondary" style={styles.message}>
          {errorMessage}
        </Text>
        <Button label={isNetwork ? 'Retry' : 'Try Again'} onPress={handleReset} />
      </View>
    );
  }, [currentError, fallbackMessage, handleReset]);

  return (
    <ErrorBoundary
      fallback={fallback}
      onError={handleError}
      resetKeys={resetKeys}
      colorScheme={colorScheme}
    >
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
    fontSize: IconSizes['2xl'],
    marginBottom: Spacing.lg,
  },
  title: {
    marginBottom: Spacing.sm,
  },
  message: {
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
});

export default QueryErrorBoundary;
