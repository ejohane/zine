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
 * - Smooth exit animation when action completes
 * - Haptic feedback on action completion (Light for archive, Medium for bookmark)
 * - Long-press context menu as accessibility fallback
 * - VoiceOver accessibility actions
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
  FadeIn,
  SlideInLeft,
  SlideInRight,
  Layout,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import ContextMenu from 'react-native-context-menu-view';

import { ItemCard, type ItemCardData } from '@/components/item-card';
import { ArchiveIcon, BookmarkIcon } from '@/components/icons';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

// ============================================================================
// Types
// ============================================================================

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

// ============================================================================
// Constants
// ============================================================================

/** Width of action panel in pixels - ~100px for finger-friendly tap target */
const ACTION_WIDTH = 100;

/** Swipe threshold to trigger action (full swipe distance) */
const SWIPE_THRESHOLD = 100;

/** Exit animation duration in milliseconds (~200-300ms for quick but visible) */
const EXIT_ANIMATION_DURATION = 250;

/** Re-entry animation duration in milliseconds (after rollback) */
const REENTRY_ANIMATION_DURATION = 300;

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
  enterFrom = null,
}: SwipeableInboxItemProps) {
  const swipeableRef = useRef<SwipeableMethods>(null);
  const [exitDirection, setExitDirection] = useState<ExitDirection>(null);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  /**
   * Execute the actual action callback after exit animation starts
   * Called via runOnJS from animation worklet
   */
  const executeAction = useCallback(
    (direction: 'left' | 'right') => {
      if (direction === 'left') {
        onBookmark(item.id);
      } else {
        onArchive(item.id);
      }
    },
    [item.id, onArchive, onBookmark]
  );

  /**
   * Handle bookmark action (from context menu or swipe)
   * Triggers haptic feedback and exit animation, then calls callback
   */
  const handleBookmarkAction = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setExitDirection('right');
    onBookmark(item.id);
  }, [item.id, onBookmark]);

  /**
   * Handle archive action (from context menu or swipe)
   * Triggers haptic feedback and exit animation, then calls callback
   */
  const handleArchiveAction = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExitDirection('left');
    onArchive(item.id);
  }, [item.id, onArchive]);

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
   * Triggers haptic feedback, exit animation, then executes the action callback
   */
  const handleSwipeableOpen = useCallback(
    (direction: 'left' | 'right') => {
      // Trigger haptic feedback on action completion
      // Archive (swipe right) = Light haptic (subtle, neutral action)
      // Bookmark (swipe left) = Medium haptic (more prominent, positive action)
      if (direction === 'right') {
        // Archive action - subtle feedback
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } else {
        // Bookmark action - more satisfying feedback
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      // Set exit direction to trigger exit animation
      // Archive (swipe right) exits to left, Bookmark (swipe left) exits to right
      const exitDir = direction === 'right' ? 'left' : 'right';
      setExitDirection(exitDir);

      // Execute the action callback
      executeAction(direction);
    },
    [executeAction]
  );

  /**
   * Handle context menu action selection
   * Dispatches to the appropriate handler based on action name
   */
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

  /**
   * Handle VoiceOver accessibility action
   * Provides non-gesture access to bookmark/archive for users who can't swipe
   */
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

  // Determine exit animation based on direction
  // Archive exits left (SlideOutLeft), Bookmark exits right (SlideOutRight)
  const exitAnimation =
    exitDirection === 'left'
      ? SlideOutLeft.duration(EXIT_ANIMATION_DURATION)
      : exitDirection === 'right'
        ? SlideOutRight.duration(EXIT_ANIMATION_DURATION)
        : undefined;

  // Determine entering animation for items reappearing after rollback
  // Item slides back in from the direction it exited (tracked by parent)
  const enteringAnimation =
    enterFrom === 'left'
      ? SlideInLeft.duration(REENTRY_ANIMATION_DURATION)
      : enterFrom === 'right'
        ? SlideInRight.duration(REENTRY_ANIMATION_DURATION)
        : enterFrom === 'fade'
          ? FadeIn.duration(REENTRY_ANIMATION_DURATION)
          : undefined;

  // Context menu actions - native iOS menu with system icons
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

  // Accessibility actions for VoiceOver users
  const accessibilityActions = [
    { name: ACCESSIBILITY_ACTION.BOOKMARK, label: 'Save to Library' },
    { name: ACCESSIBILITY_ACTION.ARCHIVE, label: 'Archive' },
  ];

  // Don't render if item is exiting (animation will handle unmount)
  // The exiting prop triggers Reanimated's exit animation before removal
  return (
    <Animated.View
      entering={enteringAnimation}
      exiting={exitAnimation}
      layout={Layout.springify().damping(15).stiffness(100)}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}${item.creator ? ` by ${item.creator}` : ''}`}
      accessibilityHint="Swipe right to archive, swipe left to save. Double tap and hold for more options."
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
      </ContextMenu>
    </Animated.View>
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
