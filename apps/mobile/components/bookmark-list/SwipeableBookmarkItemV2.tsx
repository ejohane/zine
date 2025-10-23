import { useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import SwipeableItem, {
  OpenDirection,
  type SwipeableItemImperativeRef,
} from 'react-native-swipeable-item';
import * as Haptics from 'expo-haptics';
import { BookmarkListItem } from './BookmarkListItem';
import { SwipeUnderlay } from './swipe-actions-v2/SwipeUnderlay';
import type { SwipeableBookmarkItemV2Props, SwipeChangeParams } from './types';

const ACTION_WIDTH = 80;
const ACTIVATION_THRESHOLD = 20;
const SWIPE_DAMPING = 10;

export function SwipeableBookmarkItemV2({
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
  onSwipeChange,
  swipeEnabled = true,
  activationThreshold = ACTIVATION_THRESHOLD,
  swipeDamping = SWIPE_DAMPING,
  enableHapticFeedback = true,
}: SwipeableBookmarkItemV2Props) {
  const itemRef = useRef<SwipeableItemImperativeRef>(null);
  const hasTriggeredHaptic = useRef(false);

  const handleSwipeChange = useCallback(
    (params: { openDirection: OpenDirection; snapPoint: number }) => {
      const swipeParams: SwipeChangeParams = {
        openDirection: params.openDirection,
        snapPoint: params.snapPoint,
      };

      if (enableHapticFeedback && Platform.OS === 'ios') {
        const isOpening =
          params.openDirection !== OpenDirection.NONE && params.snapPoint > 0;
        const shouldTriggerHaptic = isOpening && !hasTriggeredHaptic.current;

        if (shouldTriggerHaptic) {
          hasTriggeredHaptic.current = true;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } else if (params.openDirection === OpenDirection.NONE) {
          hasTriggeredHaptic.current = false;
        }
      }

      onSwipeChange?.(swipeParams);
    },
    [enableHapticFeedback, onSwipeChange]
  );

  const calculateSnapPoints = (actions: any[]) => {
    if (actions.length === 0) return [];
    return [ACTION_WIDTH];
  };

  const snapPointsLeft = calculateSnapPoints(leftActions);
  const snapPointsRight = calculateSnapPoints(rightActions);

  const handleActionPress = useCallback(
    (actionId: string) => {
      const allActions = [...leftActions, ...rightActions];
      const action = allActions.find((a) => a.id === actionId);
      if (action) {
        action.onPress(bookmark.id);
        itemRef.current?.close();
      }
    },
    [leftActions, rightActions, bookmark.id]
  );

  const renderUnderlayLeft = useCallback(() => {
    if (leftActions.length === 0) return null;
    return <SwipeUnderlay actions={leftActions} side="left" onActionPress={handleActionPress} />;
  }, [leftActions, handleActionPress]);

  const renderUnderlayRight = useCallback(() => {
    if (rightActions.length === 0) return null;
    return <SwipeUnderlay actions={rightActions} side="right" onActionPress={handleActionPress} />;
  }, [rightActions, handleActionPress]);

  const hasActions = leftActions.length > 0 || rightActions.length > 0;

  if (!hasActions) {
    return (
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
    );
  }

  return (
    <SwipeableItem
      ref={itemRef}
      item={bookmark}
      renderUnderlayLeft={renderUnderlayLeft}
      renderUnderlayRight={renderUnderlayRight}
      snapPointsLeft={snapPointsLeft}
      snapPointsRight={snapPointsRight}
      onChange={handleSwipeChange}
      swipeEnabled={swipeEnabled}
      activationThreshold={activationThreshold}
      swipeDamping={swipeDamping}
    >
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
    </SwipeableItem>
  );
}
