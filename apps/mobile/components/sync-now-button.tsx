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
import { View, StyleSheet } from 'react-native';

import { Button, Text } from '@/components/primitives';
import { IconSizes, Radius, Spacing, Typography } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useSyncNow, type SyncResult } from '@/hooks/use-sync-now';

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
  /** Optional override for deterministic tests/stories */
  stateOverride?: {
    syncNow?: () => void;
    isLoading: boolean;
    cooldownSeconds: number;
    lastResult: SyncResult | null;
  };
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
  stateOverride,
}: SyncNowButtonProps) {
  const { colors } = useAppTheme();

  const syncState = useSyncNow(subscriptionId);
  const syncNow = stateOverride?.syncNow ?? syncState.syncNow;
  const isLoading = stateOverride?.isLoading ?? syncState.isLoading;
  const cooldownSeconds = stateOverride?.cooldownSeconds ?? syncState.cooldownSeconds;
  const lastResult = stateOverride?.lastResult ?? syncState.lastResult;

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
      <Button
        label={isLoading ? 'Syncing...' : countdown > 0 ? formatCountdown(countdown) : 'Sync'}
        onPress={handlePress}
        disabled={isDisabled}
        size="sm"
        colors={colors}
        style={[
          styles.compactButton,
          {
            backgroundColor: isDisabled ? colors.backgroundSecondary : colors.primaryLight,
          },
        ]}
        labelStyle={{ color: countdown > 0 ? colors.textSecondary : colors.textInverse }}
        leadingAccessory={
          !isLoading && countdown === 0 ? (
            <Text style={styles.syncIcon} colors={colors} tone="inverse">
              ⟳
            </Text>
          ) : undefined
        }
        accessibilityLabel={
          isLoading
            ? 'Syncing subscription'
            : countdown > 0
              ? `Sync available in ${formatCountdown(countdown)}`
              : 'Sync now'
        }
        accessibilityState={{ disabled: isDisabled }}
      />
    );
  }

  // -------------------------------------------------------------------------
  // Full Variant (default)
  // -------------------------------------------------------------------------
  return (
    <View style={styles.fullContainer}>
      <Button
        label={
          isLoading
            ? 'Syncing...'
            : countdown > 0
              ? `Wait ${formatCountdown(countdown)}`
              : 'Sync Now'
        }
        onPress={handlePress}
        disabled={isDisabled}
        colors={colors}
        style={[
          styles.fullButton,
          {
            backgroundColor: isDisabled ? colors.backgroundSecondary : colors.primary,
          },
        ]}
        labelStyle={{ color: countdown > 0 ? colors.textSecondary : colors.textInverse }}
        leadingAccessory={
          !isLoading && countdown === 0 ? (
            <Text style={styles.fullButtonEmoji} colors={colors} tone="inverse">
              🔄
            </Text>
          ) : undefined
        }
        accessibilityLabel={
          isLoading
            ? 'Syncing subscription'
            : countdown > 0
              ? `Sync available in ${formatCountdown(countdown)}`
              : 'Sync now'
        }
        accessibilityState={{ disabled: isDisabled }}
      />

      {/* Result message */}
      {lastResult && (
        <Text style={styles.resultText} tone={lastResult.success ? 'success' : 'error'}>
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
    borderRadius: Radius.full,
    minWidth: 64,
  },
  syncIcon: {
    fontSize: IconSizes.xs,
  },

  // Full variant styles
  fullContainer: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  fullButton: {
    borderRadius: Radius.xl,
    minWidth: 140,
  },
  fullButtonEmoji: {
    fontSize: IconSizes.md,
  },
  resultText: {
    ...Typography.bodySmall,
    textAlign: 'center',
  },
});

export default SyncNowButton;
