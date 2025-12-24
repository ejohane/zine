/**
 * SyncNowButton Component
 *
 * Manual sync button for subscriptions with three visual states:
 * - Ready: "Sync Now" button (blue/primary color)
 * - Loading: Spinner + "Syncing..." text
 * - Cooldown: Countdown timer display (disabled)
 *
 * Supports two variants:
 * - Full: Larger button for detail views
 * - Compact: Smaller pill button for list items
 *
 * @see features/subscriptions/frontend-spec.md Section 6.4
 */

import { useEffect, useState, useCallback } from 'react';
import { Pressable, Text, View, ActivityIndicator, StyleSheet } from 'react-native';

import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSyncNow } from '@/hooks/use-sync-now';

// ============================================================================
// Types
// ============================================================================

interface SyncNowButtonProps {
  /** The subscription ID to sync */
  subscriptionId: string;
  /** Use compact variant (smaller pill button for list items) */
  compact?: boolean;
  /** Callback when sync completes successfully with items found */
  onSyncComplete?: (itemsFound: number) => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format seconds into human-readable countdown string.
 * - Under 60s: "45s"
 * - 60s and over: "4:32"
 */
function formatCountdown(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ============================================================================
// Component
// ============================================================================

export function SyncNowButton({
  subscriptionId,
  compact = false,
  onSyncComplete,
}: SyncNowButtonProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const { syncNow, isLoading, cooldownSeconds, lastResult } = useSyncNow(subscriptionId);

  // Local countdown for UI display
  const [countdown, setCountdown] = useState(0);

  // Sync local countdown with hook cooldown
  useEffect(() => {
    if (cooldownSeconds > 0) {
      setCountdown(cooldownSeconds);
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    } else {
      setCountdown(0);
    }
  }, [cooldownSeconds]);

  // Notify parent when sync completes with items found
  useEffect(() => {
    if (lastResult?.success && lastResult.itemsFound && lastResult.itemsFound > 0) {
      onSyncComplete?.(lastResult.itemsFound);
    }
  }, [lastResult, onSyncComplete]);

  const handlePress = useCallback(() => {
    syncNow();
  }, [syncNow]);

  const isDisabled = isLoading || countdown > 0;

  // -------------------------------------------------------------------------
  // Compact Variant
  // -------------------------------------------------------------------------
  if (compact) {
    return (
      <Pressable
        onPress={handlePress}
        disabled={isDisabled}
        style={({ pressed }) => [
          styles.compactButton,
          {
            backgroundColor: isDisabled ? colors.backgroundSecondary : colors.primaryLight,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={
          isLoading
            ? 'Syncing subscription'
            : countdown > 0
              ? `Sync available in ${formatCountdown(countdown)}`
              : 'Sync now'
        }
        accessibilityState={{ disabled: isDisabled }}
      >
        {isLoading ? (
          <>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.compactText, { color: colors.primary }]}>Syncing...</Text>
          </>
        ) : countdown > 0 ? (
          <Text style={[styles.compactText, { color: colors.textSecondary }]}>
            {formatCountdown(countdown)}
          </Text>
        ) : (
          <>
            <Text style={[styles.syncIcon, { color: colors.primary }]}>⟳</Text>
            <Text style={[styles.compactText, { color: colors.primary }]}>Sync</Text>
          </>
        )}
      </Pressable>
    );
  }

  // -------------------------------------------------------------------------
  // Full Variant (default)
  // -------------------------------------------------------------------------
  return (
    <View style={styles.fullContainer}>
      <Pressable
        onPress={handlePress}
        disabled={isDisabled}
        style={({ pressed }) => [
          styles.fullButton,
          {
            backgroundColor: isDisabled ? colors.backgroundSecondary : colors.primary,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={
          isLoading
            ? 'Syncing subscription'
            : countdown > 0
              ? `Sync available in ${formatCountdown(countdown)}`
              : 'Sync now'
        }
        accessibilityState={{ disabled: isDisabled }}
      >
        {isLoading ? (
          <>
            <ActivityIndicator size="small" color="#FFFFFF" />
            <Text style={styles.fullButtonText}>Syncing...</Text>
          </>
        ) : countdown > 0 ? (
          <Text style={[styles.fullButtonText, { color: colors.textSecondary }]}>
            Wait {formatCountdown(countdown)}
          </Text>
        ) : (
          <>
            <Text style={styles.fullButtonEmoji}>🔄</Text>
            <Text style={styles.fullButtonText}>Sync Now</Text>
          </>
        )}
      </Pressable>

      {/* Result message */}
      {lastResult && (
        <Text
          style={[styles.resultText, { color: lastResult.success ? colors.success : colors.error }]}
        >
          {lastResult.message}
        </Text>
      )}
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  // Compact variant styles
  compactButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    minWidth: 64,
  },
  compactText: {
    ...Typography.labelMedium,
  },
  syncIcon: {
    fontSize: 14,
  },

  // Full variant styles
  fullContainer: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  fullButton: {
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.md,
    borderRadius: Radius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    minWidth: 140,
  },
  fullButtonText: {
    color: '#FFFFFF',
    ...Typography.labelLarge,
    fontWeight: '500',
  },
  fullButtonEmoji: {
    fontSize: 18,
  },
  resultText: {
    ...Typography.bodySmall,
    textAlign: 'center',
  },
});

export default SyncNowButton;
