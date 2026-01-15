/**
 * SwipeableInboxItem Component
 *
 * Wraps inbox items with swipeable gesture support for quick actions.
 * Uses ReanimatedSwipeable from react-native-gesture-handler for 60 FPS performance.
 *
 * Features:
 * - Swipe left to archive (gray action panel)
 * - Swipe right to bookmark (primary color panel)
 * - Full swipe auto-completes action
 * - Partial swipe + release animates back smoothly
 */

import React, { useRef } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { useAnimatedStyle, interpolate, type SharedValue } from 'react-native-reanimated';

import { ItemCard, type ItemCardData } from '@/components/item-card';
import { ArchiveIcon, BookmarkIcon } from '@/components/icons';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

// ============================================================================
// Types
// ============================================================================

export interface SwipeableInboxItemProps {
  /** The item data to display */
  item: ItemCardData;
  /** Callback when archive action is triggered */
  onArchive: (id: string) => void;
  /** Callback when bookmark action is triggered */
  onBookmark: (id: string) => void;
  /** Animation delay index for staggered entry */
  index?: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Width of action panel in pixels - ~100px for finger-friendly tap target */
const ACTION_WIDTH = 100;

/** Swipe threshold to trigger action (full swipe distance) */
const SWIPE_THRESHOLD = 100;

// ============================================================================
// Action Panel Components
// ============================================================================

interface ActionPanelProps {
  progress: SharedValue<number>;
}

/**
 * Left action panel (Archive) - revealed when swiping right
 * Gray/neutral styling per design spec (soft delete, not destructive)
 */
function LeftActionPanel({ progress }: ActionPanelProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const animatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(progress.value, [0, 1], [0.8, 1]);
    const opacity = interpolate(progress.value, [0, 0.5, 1], [0, 0.5, 1]);

    return {
      transform: [{ scale }],
      opacity,
    };
  });

  return (
    <View
      style={[
        styles.actionPanel,
        styles.leftActionPanel,
        { backgroundColor: colors.backgroundTertiary },
      ]}
    >
      <Animated.View style={[styles.actionContent, animatedStyle]}>
        <ArchiveIcon size={24} color={colors.textSecondary} />
        <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>Archive</Text>
      </Animated.View>
    </View>
  );
}

/**
 * Right action panel (Bookmark) - revealed when swiping left
 * Primary color styling per design spec
 */
function RightActionPanel({ progress }: ActionPanelProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const animatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(progress.value, [0, 1], [0.8, 1]);
    const opacity = interpolate(progress.value, [0, 0.5, 1], [0, 0.5, 1]);

    return {
      transform: [{ scale }],
      opacity,
    };
  });

  return (
    <View
      style={[styles.actionPanel, styles.rightActionPanel, { backgroundColor: colors.primary }]}
    >
      <Animated.View style={[styles.actionContent, animatedStyle]}>
        <BookmarkIcon size={24} color={colors.buttonPrimaryText} />
        <Text style={[styles.actionLabel, { color: colors.buttonPrimaryText }]}>Save</Text>
      </Animated.View>
    </View>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function SwipeableInboxItem({
  item,
  onArchive,
  onBookmark,
  index = 0,
}: SwipeableInboxItemProps) {
  const swipeableRef = useRef<SwipeableMethods>(null);

  /**
   * Render left actions (Archive) - appears when swiping right
   */
  const renderLeftActions = (progress: SharedValue<number>, _dragX: SharedValue<number>) => {
    return <LeftActionPanel progress={progress} />;
  };

  /**
   * Render right actions (Bookmark) - appears when swiping left
   */
  const renderRightActions = (progress: SharedValue<number>, _dragX: SharedValue<number>) => {
    return <RightActionPanel progress={progress} />;
  };

  /**
   * Handle swipeable open (full swipe completed)
   */
  const handleSwipeableOpen = (direction: 'left' | 'right') => {
    if (direction === 'left') {
      // Swiped left = right action panel revealed = bookmark
      onBookmark(item.id);
    } else if (direction === 'right') {
      // Swiped right = left action panel revealed = archive
      onArchive(item.id);
    }

    // Close the swipeable after action
    swipeableRef.current?.close();
  };

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      friction={2}
      leftThreshold={SWIPE_THRESHOLD}
      rightThreshold={SWIPE_THRESHOLD}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      onSwipeableOpen={handleSwipeableOpen}
    >
      <ItemCard item={item} variant="compact" index={index} />
    </ReanimatedSwipeable>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  actionPanel: {
    width: ACTION_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
    // Ensure minimum touch target (iOS HIG: 44x44)
    minHeight: 44,
  },
  leftActionPanel: {
    // Archive panel - left side (revealed on right swipe)
  },
  rightActionPanel: {
    // Bookmark panel - right side (revealed on left swipe)
  },
  actionContent: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  actionLabel: {
    ...Typography.labelSmall,
  },
});

export default SwipeableInboxItem;
