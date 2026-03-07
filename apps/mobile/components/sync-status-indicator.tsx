/**
 * Sync Status Indicator Component
 *
 * Shows "N pending" badge with pulse animation when offline queue has items.
 * Returns null when empty.
 *
 * @see Frontend Spec Section 9.7
 *
 * Features:
 * - Subscribes to offlineQueue changes
 * - Shows count with animated dot and badge copy
 * - Uses Animated.loop for pulse effect
 * - Proper cleanup of animations on unmount
 */

import { View, Animated, StyleSheet } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { offlineQueue } from '../lib/offline-queue';
import { Badge } from '@/components/primitives';
import { useAppTheme } from '@/hooks/use-app-theme';

interface SyncStatusIndicatorProps {
  /** Optional override for deterministic tests/stories */
  pendingCountOverride?: number;
}

export function SyncStatusIndicator({ pendingCountOverride }: SyncStatusIndicatorProps = {}) {
  const { colors } = useAppTheme();
  const [pendingCount, setPendingCount] = useState(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  // Store animation reference for cleanup on unmount
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const activePendingCount = pendingCountOverride ?? pendingCount;

  useEffect(() => {
    if (pendingCountOverride != null) {
      return;
    }

    offlineQueue.getPendingCount().then(setPendingCount);
    const unsubscribe = offlineQueue.subscribe(async () => {
      const count = await offlineQueue.getPendingCount();
      setPendingCount(count);
    });
    return unsubscribe;
  }, [pendingCountOverride]);

  // Animation effect with proper cleanup
  useEffect(() => {
    // Stop any existing animation before starting a new one
    if (animationRef.current) {
      animationRef.current.stop();
      animationRef.current = null;
    }

    if (activePendingCount > 0) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.5, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      );
      animationRef.current = pulse;
      pulse.start();
    } else {
      pulseAnim.setValue(1);
    }

    // Cleanup on unmount OR when pendingCount changes
    return () => {
      if (animationRef.current) {
        animationRef.current.stop();
        animationRef.current = null;
      }
    };
  }, [activePendingCount, pulseAnim]);

  if (activePendingCount === 0) return null;

  return (
    <Animated.View style={[styles.container, { opacity: pulseAnim }]}>
      <Badge
        label={`${activePendingCount} pending ${activePendingCount === 1 ? 'change' : 'changes'}`}
        shape="pill"
        size="md"
        backgroundColor={colors.accentMuted}
        textTone="accent"
        leadingAccessory={<View style={[styles.dot, { backgroundColor: colors.accent }]} />}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
