/**
 * @deprecated This component uses the old swipe gesture system.
 * New screens should use SwipeableList from '../swipeable-list' instead.
 * This component remains for backwards compatibility with screens not yet migrated.
 * 
 * Migration path:
 * - Use SwipeableList from '../swipeable-list/SwipeableList'
 * - Use BookmarkListItem directly (no wrapper needed)
 * - Define actions via getRightActions callback
 * 
 * See apps/mobile/app/(app)/(tabs)/inbox.tsx for migration example.
 */
import { View, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { BookmarkListItem } from './BookmarkListItem';
import { SwipeActionView } from './swipe-actions/SwipeActionView';
import { useSwipeGesture } from './swipe-actions/useSwipeGesture';
import type { SwipeableBookmarkItemProps } from './types';

export function SwipeableBookmarkItem({
  bookmark,
  variant = 'compact',
  onPress,
  showThumbnail = true,
  showMetadata = true,
  showPublishDate = true,
  showPlatformIcon = true,
  enableHaptics = true,
  leftActions = [],
  rightActions = [],
  enableHapticFeedback = true,
}: SwipeableBookmarkItemProps) {
  const handleActionPress = (actionId: string) => {
    const allActions = [...leftActions, ...rightActions];
    const action = allActions.find((a) => a.id === actionId);
    if (action) {
      action.onPress(bookmark.id);
      reset();
    }
  };

  const { panHandlers, translateX, reset } = useSwipeGesture({
    leftActions,
    rightActions,
    onActionPress: handleActionPress,
    enableHapticFeedback,
  });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const hasActions = leftActions.length > 0 || rightActions.length > 0;

  return (
    <View style={styles.container}>
      {rightActions.length > 0 && (
        <SwipeActionView
          actions={rightActions}
          side="right"
          translateX={translateX}
          onActionPress={handleActionPress}
        />
      )}
      {leftActions.length > 0 && (
        <SwipeActionView
          actions={leftActions}
          side="left"
          translateX={translateX}
          onActionPress={handleActionPress}
        />
      )}
      <Animated.View style={[styles.itemContainer, animatedStyle]} {...(hasActions ? panHandlers : {})}>
        <BookmarkListItem
          bookmark={bookmark}
          variant={variant}
          onPress={onPress}
          showThumbnail={showThumbnail}
          showMetadata={showMetadata}
          showPublishDate={showPublishDate}
          showPlatformIcon={showPlatformIcon}
          enableHaptics={enableHaptics}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
  },
  itemContainer: {
    backgroundColor: 'transparent',
  },
});
