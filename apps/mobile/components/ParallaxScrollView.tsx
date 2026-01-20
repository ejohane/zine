/**
 * ParallaxScrollView Component
 *
 * A scroll view with a parallax header effect and fade transition.
 * The header image scales when pulled down and fades out when scrolling up.
 *
 * Features:
 * - Parallax effect: header moves slower than content
 * - Fade effect: header fades out as you scroll
 * - Scale effect: bouncy scaling when pulling down
 * - Gradient overlay: smooth transition to background
 */

import { LinearGradient } from 'expo-linear-gradient';
import type { PropsWithChildren, ReactElement } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedRef,
  useAnimatedStyle,
  useScrollViewOffset,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type Props = PropsWithChildren<{
  headerImage: ReactElement;
  scrollEnabled?: boolean;
  /** Aspect ratio for the header (width/height). Defaults to 1 (square). Use 16/9 for videos. */
  headerAspectRatio?: number;
  /** Fraction of screen height to use for header when aspect ratio <= 1. Defaults to 0.33. */
  headerHeightFraction?: number;
}>;

export default function ParallaxScrollView({
  children,
  headerImage,
  scrollEnabled = true,
  headerAspectRatio = 1,
  headerHeightFraction = 0.33,
}: Props) {
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollOffset = useScrollViewOffset(scrollRef);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];

  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  // Calculate header height based on aspect ratio
  // For square (1:1), use headerHeightFraction of screen height
  // For wider ratios (16:9), calculate based on width to maintain aspect ratio
  const headerHeight =
    headerAspectRatio > 1 ? width / headerAspectRatio : height * headerHeightFraction;

  const headerAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(scrollOffset.value, [-headerHeight, 0, headerHeight / 2], [1, 1, 0]),
      transform: [
        {
          translateY: interpolate(
            scrollOffset.value,
            [-headerHeight, 0, headerHeight],
            [-headerHeight / 2, 0, headerHeight * 0.75]
          ),
        },
        {
          scale: interpolate(scrollOffset.value, [-headerHeight, 0, headerHeight], [2, 1, 1]),
        },
      ],
    };
  });

  return (
    <Animated.ScrollView
      ref={scrollRef}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      scrollEnabled={scrollEnabled}
    >
      <Animated.View
        style={[styles.headerContainer, { height: headerHeight }, headerAnimatedStyle]}
      >
        {headerImage}
        <LinearGradient colors={['transparent', colors.background]} style={styles.gradient} />
      </Animated.View>
      <View style={styles.contentContainer}>{children}</View>
    </Animated.ScrollView>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    overflow: 'hidden',
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 200,
    pointerEvents: 'none',
  },
  contentContainer: {
    flex: 1,
    marginTop: -40,
    zIndex: 50,
  },
});
