import type { ReactNode } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useQueryErrorResetBoundary } from '@tanstack/react-query';
import { ErrorBoundary } from './error-boundary';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
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
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
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
        <Text style={[styles.title, { color: colors.text }]}>
          {isNetwork ? 'Connection Problem' : 'Something went wrong'}
        </Text>
        <Text style={[styles.message, { color: colors.textSecondary }]}>{errorMessage}</Text>
        <Pressable
          onPress={handleReset}
          style={[styles.button, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.buttonText}>{isNetwork ? 'Retry' : 'Try Again'}</Text>
        </Pressable>
      </View>
    );
  }, [currentError, fallbackMessage, colors, handleReset]);

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

export default QueryErrorBoundary;
