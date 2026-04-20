/**
 * SwipeableInboxItem Component
 *
 * Wraps inbox items with swipeable gesture support for quick actions.
 * Uses ReanimatedSwipeable from react-native-gesture-handler for 60 FPS performance.
 *
 * Features:
 * - Swipe right to save (primary color panel)
 * - Swipe left to archive (gray action panel)
 * - Full swipe auto-completes action
 * - Partial swipe + release animates back smoothly
 * - Smooth exit animation when action completes
 * - Haptic feedback on action completion (Medium for save, Light for archive)
 * - Long-press context menu as accessibility fallback
 * - VoiceOver accessibility actions
 *
 * Performance Considerations (see zine-iln):
 * - ReanimatedSwipeable runs gesture handling on UI thread (not JS thread)
 * - All interpolations use useAnimatedStyle worklets (UI thread)
 * - Exit animations use hardware-accelerated transforms (SlideOut)
 * - Layout animation uses spring physics with controlled damping (no bounce)
 * - Haptics are fire-and-forget (async, non-blocking)
 * - Callbacks wrapped in useCallback to prevent re-renders
 *
 * To profile performance:
 * 1. Shake device / Cmd+D in simulator
 * 2. Enable "Perf Monitor"
 * 3. Watch JS and UI frame rates during swipes
 * 4. Both should stay at or near 60 FPS
 * Note: Simulator performance is not representative - test on real device
 *
 * @see zine-iln for performance profiling task
 * @see swipeable-inbox-performance.test.ts for performance validation tests
 */

import React, { useRef, useState, useCallback } from 'react';
import { View, StyleSheet, Text, type AccessibilityActionEvent } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  useAnimatedStyle,
  interpolate,
  type SharedValue,
  SlideOutLeft,
  SlideOutRight,
  Layout,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import ContextMenu from '../lib/context-menu';

import { ItemCard, type ItemCardData } from '@/components/item-card';
import { ArchiveIcon, BookmarkIcon } from '@/components/icons';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/** Direction from which item should enter (for rollback animation) */
export type EnterDirection = 'left' | 'right' | 'fade' | null;

export interface SwipeableInboxItemProps {
  /** The item data to display */
  item: ItemCardData;
  /** Callback when archive action is triggered */
  onArchive: (id: string) => void;
  /** Callback when bookmark action is triggered */
  onBookmark: (id: string) => void;
  /** Animation delay index for staggered entry */
  index?: number;
  /** Direction from which item should enter (for rollback animation) */
  enterFrom?: EnterDirection;
}

/** Direction of exit animation */
export type ExitDirection = 'left' | 'right' | null;

/** Width of action panel in pixels - ~100px for finger-friendly tap target */
const ACTION_WIDTH = 100;

/**
 * Swipe threshold to trigger action (full swipe distance)
 * 100px chosen because:
 * - Large enough to prevent accidental triggers (~2.5x typical accidental swipe of 40px)
 * - Small enough to be easily reachable (~1/4 of smallest phone width)
 * - Matches action panel width for consistent feel
 * @see zine-2qn for threshold tuning rationale
 */
const SWIPE_THRESHOLD = 100;

/**
 * Friction value for swipe resistance (1-3 range)
 * Value of 2 provides balanced resistance:
 * - 1: Too loose, feels slippery
 * - 2: Balanced, feels responsive but controlled
 * - 3: Too stiff, feels sluggish
 * @see zine-2qn for friction tuning rationale
 */
const SWIPE_FRICTION = 2;

/** Exit animation duration in milliseconds (~200-300ms for quick but visible) */
const EXIT_ANIMATION_DURATION = 250;

interface ActionPanelProps {
  progress: SharedValue<number>;
}

/**
 * Left action panel (Save) - revealed when swiping right
 * Primary color styling per design spec
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
    <View style={[styles.actionPanel, styles.leftActionPanel, { backgroundColor: colors.primary }]}>
      <Animated.View style={[styles.actionContent, animatedStyle]}>
        <BookmarkIcon size={24} color={colors.buttonPrimaryText} />
        <Text style={[styles.actionLabel, { color: colors.buttonPrimaryText }]}>Save</Text>
      </Animated.View>
    </View>
  );
}

/**
 * Right action panel (Archive) - revealed when swiping left
 * Gray/neutral styling per design spec (soft delete, not destructive)
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
      style={[
        styles.actionPanel,
        styles.rightActionPanel,
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

/** Context menu action names (match title for handler dispatch) */
const CONTEXT_MENU_ACTION = {
  SAVE_TO_LIBRARY: 'Save to Library',
  ARCHIVE: 'Archive',
} as const;

/** Accessibility action names (for VoiceOver) */
const ACCESSIBILITY_ACTION = {
  BOOKMARK: 'bookmark',
  ARCHIVE: 'archive',
} as const;

export function SwipeableInboxItem({
  item,
  onArchive,
  onBookmark,
  index = 0,
}: SwipeableInboxItemProps) {
  const swipeableRef = useRef<SwipeableMethods>(null);
  const [exitDirection, setExitDirection] = useState<ExitDirection>(null);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();

  // Prevents ItemCard's onPress from firing when completing a swipe gesture
  const isSwipeActionPending = useRef(false);

  /** Called via runOnJS from animation worklet */
  const executeAction = useCallback(
    (direction: 'left' | 'right') => {
      if (direction === 'left') {
        onArchive(item.id);
      } else {
        onBookmark(item.id);
      }
    },
    [item.id, onArchive, onBookmark]
  );

  const handleBookmarkAction = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setExitDirection('right');
    onBookmark(item.id);
  }, [item.id, onBookmark]);

  const handleArchiveAction = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExitDirection('left');
    onArchive(item.id);
  }, [item.id, onArchive]);

  const renderLeftActions = (progress: SharedValue<number>, _dragX: SharedValue<number>) => {
    return <LeftActionPanel progress={progress} />;
  };

  const renderRightActions = (progress: SharedValue<number>, _dragX: SharedValue<number>) => {
    return <RightActionPanel progress={progress} />;
  };

  const handleSwipeableWillOpen = useCallback(() => {
    isSwipeActionPending.current = true;
  }, []);

  const handleSwipeableOpen = useCallback(
    (direction: 'left' | 'right') => {
      if (direction === 'right') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      setExitDirection(direction);
      executeAction(direction);
    },
    [executeAction]
  );

  const handleItemPress = useCallback(() => {
    if (isSwipeActionPending.current) {
      return;
    }
    router.push(`/item/${item.id}` as never);
  }, [router, item.id]);

  const handleContextMenuPress = useCallback(
    (e: { nativeEvent: { name: string } }) => {
      const { name } = e.nativeEvent;
      if (name === CONTEXT_MENU_ACTION.SAVE_TO_LIBRARY) {
        handleBookmarkAction();
      } else if (name === CONTEXT_MENU_ACTION.ARCHIVE) {
        handleArchiveAction();
      }
    },
    [handleBookmarkAction, handleArchiveAction]
  );

  const handleAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      switch (event.nativeEvent.actionName) {
        case ACCESSIBILITY_ACTION.BOOKMARK:
          handleBookmarkAction();
          break;
        case ACCESSIBILITY_ACTION.ARCHIVE:
          handleArchiveAction();
          break;
      }
    },
    [handleBookmarkAction, handleArchiveAction]
  );

  const exitAnimation =
    exitDirection === 'left'
      ? SlideOutLeft.duration(EXIT_ANIMATION_DURATION)
      : exitDirection === 'right'
        ? SlideOutRight.duration(EXIT_ANIMATION_DURATION)
        : undefined;

  const contextMenuActions = [
    {
      title: CONTEXT_MENU_ACTION.SAVE_TO_LIBRARY,
      systemIcon: 'bookmark',
    },
    {
      title: CONTEXT_MENU_ACTION.ARCHIVE,
      systemIcon: 'archivebox',
    },
  ];

  const accessibilityActions = [
    { name: ACCESSIBILITY_ACTION.BOOKMARK, label: 'Save to Library' },
    { name: ACCESSIBILITY_ACTION.ARCHIVE, label: 'Archive' },
  ];

  return (
    <Animated.View
      exiting={exitAnimation}
      layout={Layout.springify().damping(15).stiffness(100)}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}${item.creator ? ` by ${item.creator}` : ''}`}
      accessibilityHint="Swipe right to save, swipe left to archive. Double tap and hold for more options."
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={handleAccessibilityAction}
    >
      <ContextMenu
        actions={contextMenuActions}
        onPress={handleContextMenuPress}
        previewBackgroundColor={colors.background}
      >
        <ReanimatedSwipeable
          ref={swipeableRef}
          friction={SWIPE_FRICTION}
          leftThreshold={SWIPE_THRESHOLD}
          rightThreshold={SWIPE_THRESHOLD}
          overshootLeft={false}
          overshootRight={false}
          renderLeftActions={renderLeftActions}
          renderRightActions={renderRightActions}
          onSwipeableWillOpen={handleSwipeableWillOpen}
          onSwipeableOpen={handleSwipeableOpen}
        >
          <ItemCard item={item} shape="row" index={index} onPress={handleItemPress} />
        </ReanimatedSwipeable>
      </ContextMenu>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  actionPanel: {
    width: ACTION_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
    // Ensure minimum touch target (iOS HIG: 44x44)
    minHeight: 44,
  },
  leftActionPanel: {
    // Save panel - left side (revealed on right swipe)
  },
  rightActionPanel: {
    // Archive panel - right side (revealed on left swipe)
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
