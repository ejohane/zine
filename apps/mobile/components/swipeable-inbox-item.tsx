/**
 * SwipeableInboxItem Component
 *
 * Wraps inbox items with swipeable gesture support for quick actions.
 * Uses ReanimatedSwipeable from react-native-gesture-handler for 60 FPS performance.
 *
 * Features:
 * - Swipe right to save (full-height iOS-style action panel)
 * - Swipe left to archive (full-height iOS-style action panel)
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
import { View, StyleSheet, type AccessibilityActionEvent } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  useAnimatedStyle,
  useAnimatedReaction,
  useSharedValue,
  interpolate,
  Extrapolation,
  runOnJS,
  type SharedValue,
  SlideOutLeft,
  SlideOutRight,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import ContextMenu from '../lib/context-menu';

import { ItemCard, type ItemCardData } from '@/components/item-card';
import { ArchiveIcon, BookmarkIcon } from '@/components/icons';
import { Spacing } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

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

/** Final measured width of each action lane. */
const ACTION_LANE_WIDTH = 220;
const ACTION_CIRCLE_SIZE = 64;
const ACTION_ICON_SIZE = 24;
const STRETCH_START_DISTANCE = 96;
const COMMIT_DISTANCE = 164;
const ACTION_STRETCHED_WIDTH = 156;
const ACTION_MAX_WIDTH = 204;

/**
 * Swipe threshold to trigger action.
 * Matched to the point where the capsule finishes stretching and vibrates.
 * @see zine-2qn for threshold tuning rationale
 */
const SWIPE_THRESHOLD = COMMIT_DISTANCE;

/**
 * Friction value for swipe resistance (1-3 range)
 * Values near 1 track the finger closely, which better matches native iOS rows.
 * @see zine-2qn for friction tuning rationale
 */
const SWIPE_FRICTION = 1.08;

/** Native-feeling rubber-band resistance once the row moves past the action width. */
const OVERSHOOT_FRICTION = 8;

/** Exit animation duration in milliseconds (~200-300ms for quick but visible) */
const EXIT_ANIMATION_DURATION = 250;

interface ActionPanelProps {
  progress: SharedValue<number>;
  translation: SharedValue<number>;
  releaseLocked: SharedValue<boolean>;
}

type MorphingActionCapsuleProps = ActionPanelProps & {
  direction: 'left' | 'right';
  color: string;
  children: React.ReactNode;
};

function triggerSwipeCommitHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

function MorphingActionCapsule({
  progress,
  translation,
  releaseLocked,
  direction,
  color,
  children,
}: MorphingActionCapsuleProps) {
  const isLeft = direction === 'left';
  const frozenWidth = useSharedValue(-1);

  const getDragDistance = () => {
    'worklet';
    return isLeft ? Math.max(translation.value, 0) : Math.max(-translation.value, 0);
  };

  const getCapsuleWidth = (dragDistance: number) => {
    'worklet';
    return interpolate(
      dragDistance,
      [0, STRETCH_START_DISTANCE, COMMIT_DISTANCE, ACTION_LANE_WIDTH],
      [ACTION_CIRCLE_SIZE, ACTION_CIRCLE_SIZE, ACTION_STRETCHED_WIDTH, ACTION_MAX_WIDTH],
      Extrapolation.CLAMP
    );
  };

  useAnimatedReaction(
    () => {
      const dragDistance = isLeft
        ? Math.max(translation.value, 0)
        : Math.max(-translation.value, 0);
      return dragDistance >= COMMIT_DISTANCE;
    },
    (isCommitted, wasCommitted) => {
      if (isCommitted && !wasCommitted) {
        runOnJS(triggerSwipeCommitHaptic)();
      }
    },
    [isLeft]
  );

  useAnimatedReaction(
    () => {
      return {
        dragDistance: getDragDistance(),
        releaseLocked: releaseLocked.value,
      };
    },
    ({ dragDistance, releaseLocked: isReleaseLocked }) => {
      if (!isReleaseLocked) {
        frozenWidth.value = -1;
        return;
      }

      if (frozenWidth.value < 0) {
        frozenWidth.value = getCapsuleWidth(dragDistance);
      }
    },
    [isLeft]
  );

  const capsuleStyle = useAnimatedStyle(() => {
    const dragDistance = getDragDistance();
    const width = frozenWidth.value >= 0 ? frozenWidth.value : getCapsuleWidth(dragDistance);
    const scaleY = interpolate(
      dragDistance,
      [0, STRETCH_START_DISTANCE, COMMIT_DISTANCE, ACTION_LANE_WIDTH],
      [1, 1, 1.035, 1.035],
      Extrapolation.CLAMP
    );
    const opacity = interpolate(progress.value, [0, 0.18, 0.35], [0, 0.8, 1], Extrapolation.CLAMP);

    return {
      width,
      opacity,
      transform: [{ scaleY }],
    };
  });

  const iconStyle = useAnimatedStyle(() => {
    const dragDistance = getDragDistance();
    const scaleX = interpolate(
      dragDistance,
      [0, STRETCH_START_DISTANCE, COMMIT_DISTANCE, ACTION_LANE_WIDTH],
      [1, 1, 1.15, 1.28],
      Extrapolation.CLAMP
    );
    const scaleY = interpolate(
      dragDistance,
      [0, STRETCH_START_DISTANCE, COMMIT_DISTANCE, ACTION_LANE_WIDTH],
      [1, 1, 0.9, 0.84],
      Extrapolation.CLAMP
    );

    return {
      transform: [{ scaleX }, { scaleY }],
    };
  });

  return (
    <View style={[styles.actionPanel, isLeft ? styles.leftActionPanel : styles.rightActionPanel]}>
      <Animated.View style={[styles.actionCapsule, { backgroundColor: color }, capsuleStyle]}>
        <Animated.View style={iconStyle}>{children}</Animated.View>
      </Animated.View>
    </View>
  );
}

/**
 * Left action panel (Save) - revealed when swiping right
 */
function LeftActionPanel({ progress, translation, releaseLocked }: ActionPanelProps) {
  const { colors } = useAppTheme();

  return (
    <MorphingActionCapsule
      progress={progress}
      translation={translation}
      releaseLocked={releaseLocked}
      direction="left"
      color={colors.statusSuccess}
    >
      <BookmarkIcon size={ACTION_ICON_SIZE} color={colors.overlayForeground} />
    </MorphingActionCapsule>
  );
}

/**
 * Right action panel (Archive) - revealed when swiping left
 */
function RightActionPanel({ progress, translation, releaseLocked }: ActionPanelProps) {
  const { colors } = useAppTheme();

  return (
    <MorphingActionCapsule
      progress={progress}
      translation={translation}
      releaseLocked={releaseLocked}
      direction="right"
      color={colors.statusError}
    >
      <ArchiveIcon size={ACTION_ICON_SIZE} color={colors.overlayForeground} />
    </MorphingActionCapsule>
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
  const releaseLocked = useSharedValue(false);
  const { colors } = useAppTheme();
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

  const renderLeftActions = (progress: SharedValue<number>, translation: SharedValue<number>) => {
    return (
      <LeftActionPanel
        progress={progress}
        translation={translation}
        releaseLocked={releaseLocked}
      />
    );
  };

  const renderRightActions = (progress: SharedValue<number>, translation: SharedValue<number>) => {
    return (
      <RightActionPanel
        progress={progress}
        translation={translation}
        releaseLocked={releaseLocked}
      />
    );
  };

  const handleSwipeableWillOpen = useCallback(() => {
    isSwipeActionPending.current = true;
    releaseLocked.value = true;
  }, [releaseLocked]);

  const handleSwipeableWillClose = useCallback(() => {
    releaseLocked.value = false;
  }, [releaseLocked]);

  const handleSwipeableOpen = useCallback(
    (direction: 'left' | 'right') => {
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
          overshootLeft={true}
          overshootRight={true}
          overshootFriction={OVERSHOOT_FRICTION}
          renderLeftActions={renderLeftActions}
          renderRightActions={renderRightActions}
          onSwipeableWillOpen={handleSwipeableWillOpen}
          onSwipeableWillClose={handleSwipeableWillClose}
          onSwipeableOpen={handleSwipeableOpen}
          containerStyle={styles.swipeableContainer}
          childrenContainerStyle={{ backgroundColor: colors.background }}
        >
          <View style={styles.rowContent}>
            <ItemCard item={item} shape="row" index={index} onPress={handleItemPress} />
            <View style={[styles.rowSeparator, { backgroundColor: colors.borderDefault }]} />
          </View>
        </ReanimatedSwipeable>
      </ContextMenu>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  swipeableContainer: {
    minHeight: 64,
  },
  rowContent: {
    minHeight: 64,
  },
  rowSeparator: {
    position: 'absolute',
    left: 80,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
  actionPanel: {
    width: ACTION_LANE_WIDTH,
    flex: 1,
    justifyContent: 'center',
    overflow: 'visible',
  },
  leftActionPanel: {
    alignItems: 'flex-start',
    paddingLeft: Spacing.sm,
  },
  rightActionPanel: {
    alignItems: 'flex-end',
    paddingRight: Spacing.sm,
  },
  actionCapsule: {
    height: ACTION_CIRCLE_SIZE,
    minWidth: ACTION_CIRCLE_SIZE,
    borderRadius: ACTION_CIRCLE_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default SwipeableInboxItem;
