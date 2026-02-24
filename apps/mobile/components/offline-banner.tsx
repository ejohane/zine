/**
 * OfflineBanner component for displaying network connectivity status.
 *
 * Shows a yellow warning banner at the top of the screen when the device
 * is offline, with smooth slide-in/out animations.
 *
 * @see Frontend Spec Section 9.2 for detailed requirements
 */

import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNetworkStatus, type NetworkStatus } from '@/hooks/use-network-status';

const ANIMATION_DURATION = 300;

/**
 * OfflineBanner displays a prominent yellow banner when the device loses
 * internet connectivity.
 *
 * Features:
 * - Detects offline state using both isConnected and isInternetReachable
 * - Smooth slide-in/out animation (300ms)
 * - Positioned at top with proper safe area handling
 * - Yellow warning color for visibility
 *
 * @example
 * ```tsx
 * // Place at the top level of your screen/layout
 * function App() {
 *   return (
 *     <View style={{ flex: 1 }}>
 *       <OfflineBanner />
 *       <MainContent />
 *     </View>
 *   );
 * }
 * ```
 */
interface OfflineBannerProps {
  /** Optional override for deterministic tests/stories */
  statusOverride?: Pick<NetworkStatus, 'isConnected' | 'isInternetReachable'>;
  /** Optional override for deterministic tests/stories */
  topInsetOverride?: number;
}

export function OfflineBanner({ statusOverride, topInsetOverride }: OfflineBannerProps = {}) {
  const networkStatus = useNetworkStatus();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const isConnected = statusOverride?.isConnected ?? networkStatus.isConnected;
  const isInternetReachable =
    statusOverride?.isInternetReachable ?? networkStatus.isInternetReachable;
  const topInset = topInsetOverride ?? insets.top;

  // Determine if we're offline:
  // - isConnected is false, OR
  // - isInternetReachable is explicitly false (not null, which means unknown)
  const isOffline = !isConnected || isInternetReachable === false;

  // Animation value for slide in/out (0 = hidden, 1 = visible)
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: isOffline ? 1 : 0,
      duration: ANIMATION_DURATION,
      useNativeDriver: true,
    }).start();
  }, [isOffline, slideAnim]);

  // Calculate the banner height (content + safe area)
  const bannerHeight = 44 + topInset;

  // Interpolate the animation value to translate Y
  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-bannerHeight, 0],
  });

  // Don't render anything if we've never been offline
  // (to avoid unnecessary layout calculations)
  const opacity = slideAnim.interpolate({
    inputRange: [0, 0.01, 1],
    outputRange: [0, 1, 1],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          paddingTop: topInset,
          backgroundColor: colors.warning,
          transform: [{ translateY }],
          opacity,
        },
      ]}
      pointerEvents={isOffline ? 'auto' : 'none'}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel="Network status: You're offline. Changes will sync when you reconnect."
    >
      <View style={styles.content}>
        <Text style={styles.icon}>📡</Text>
        <Text style={styles.text}>You&apos;re offline. Changes will sync when you reconnect.</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  icon: {
    fontSize: 16,
    marginRight: Spacing.sm,
  },
  text: {
    ...Typography.bodySmall,
    color: '#000000', // Dark text on yellow background for contrast
    fontWeight: '500',
  },
});

export default OfflineBanner;
