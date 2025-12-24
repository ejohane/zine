import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * Props for LoadingState component
 */
interface LoadingStateProps {
  /** Optional message to display below the spinner */
  message?: string;
}

/**
 * LoadingState component displays a centered loading indicator with optional message.
 * Used for async data fetching states in lists and screens.
 *
 * @example
 * ```tsx
 * // Basic usage
 * <LoadingState />
 *
 * // With custom message
 * <LoadingState message="Loading your subscriptions..." />
 * ```
 */
export function LoadingState({ message }: LoadingStateProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.primary} />
      {message && <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>}
    </View>
  );
}

/**
 * Props for ErrorState component
 */
interface ErrorStateProps {
  /** Title to display (defaults to "Something went wrong") */
  title?: string;
  /** Error message to display */
  message?: string;
  /** Callback for retry button press */
  onRetry?: () => void;
  /** Label for retry button (defaults to "Try Again") */
  retryLabel?: string;
}

/**
 * ErrorState component displays an error message with optional retry action.
 * Used for error states in lists, data fetching failures, etc.
 *
 * @example
 * ```tsx
 * // Basic usage
 * <ErrorState message="Failed to load items" />
 *
 * // With retry action
 * <ErrorState
 *   title="Connection Error"
 *   message="Unable to load your feed"
 *   onRetry={() => refetch()}
 *   retryLabel="Retry"
 * />
 * ```
 */
export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try Again',
}: ErrorStateProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>⚠️</Text>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {message && <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>}
      {onRetry && (
        <Pressable onPress={onRetry} style={[styles.button, { backgroundColor: colors.primary }]}>
          <Text style={styles.buttonText}>{retryLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * Props for EmptyState component
 */
interface EmptyStateProps {
  /** Emoji to display (defaults to "📭") */
  emoji?: string;
  /** Title to display (required) */
  title: string;
  /** Optional message to display below the title */
  message?: string;
  /** Label for the action button */
  actionLabel?: string;
  /** Callback for action button press */
  onAction?: () => void;
}

/**
 * EmptyState component displays a placeholder for empty lists or no-content states.
 * Used when a list has no items or when initial setup is needed.
 *
 * @example
 * ```tsx
 * // Basic usage
 * <EmptyState title="No items yet" />
 *
 * // With message and action
 * <EmptyState
 *   emoji="🎵"
 *   title="No subscriptions"
 *   message="Start by adding your favorite content sources"
 *   actionLabel="Browse Sources"
 *   onAction={() => navigation.navigate('discover')}
 * />
 * ```
 */
export function EmptyState({
  emoji = '📭',
  title,
  message,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {message && <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>}
      {actionLabel && onAction && (
        <Pressable onPress={onAction} style={[styles.button, { backgroundColor: colors.primary }]}>
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
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
    textAlign: 'center',
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
