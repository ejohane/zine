import { useRef } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import { PanResponder, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { SWIPE_CONFIG, snapToTarget, closeSwipe } from './swipeAnimations';
import type { SwipeAction } from '../types';

interface UseSwipeGestureProps {
  leftActions?: SwipeAction[];
  rightActions?: SwipeAction[];
  onActionPress?: (actionId: string) => void;
  enableHapticFeedback?: boolean;
}

export function useSwipeGesture({
  leftActions = [],
  rightActions = [],
  onActionPress,
  enableHapticFeedback = true,
}: UseSwipeGestureProps) {
  const translateX = useSharedValue(0);
  const hasTriggeredHaptic = useRef(false);

  const maxLeftSwipe = leftActions.length * SWIPE_CONFIG.actionWidth;
  const maxRightSwipe = -rightActions.length * SWIPE_CONFIG.actionWidth;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 5;
      },
      onPanResponderGrant: () => {
        hasTriggeredHaptic.current = false;
      },
      onPanResponderMove: (_, gestureState) => {
        const newTranslateX = gestureState.dx;
        
        if (newTranslateX > 0 && leftActions.length > 0) {
          translateX.value = Math.min(newTranslateX, maxLeftSwipe * 1.2);
        } else if (newTranslateX < 0 && rightActions.length > 0) {
          translateX.value = Math.max(newTranslateX, maxRightSwipe * 1.2);
        }

        const absTranslateX = Math.abs(translateX.value);
        const threshold = SWIPE_CONFIG.actionWidth * SWIPE_CONFIG.threshold;

        if (absTranslateX > threshold && !hasTriggeredHaptic.current && enableHapticFeedback) {
          hasTriggeredHaptic.current = true;
          if (Platform.OS === 'ios') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }
        } else if (absTranslateX <= threshold) {
          hasTriggeredHaptic.current = false;
        }
      },
      onPanResponderRelease: () => {
        const absTranslateX = Math.abs(translateX.value);
        const threshold = SWIPE_CONFIG.actionWidth * SWIPE_CONFIG.threshold;
        const fullThreshold = SWIPE_CONFIG.actionWidth * SWIPE_CONFIG.fullThreshold;

        if (absTranslateX > fullThreshold) {
          if (translateX.value > 0 && leftActions.length > 0) {
            const actionIndex = Math.min(
              Math.floor(absTranslateX / SWIPE_CONFIG.actionWidth) - 1,
              leftActions.length - 1
            );
            const action = leftActions[actionIndex];
            if (action && onActionPress) {
              onActionPress(action.id);
            }
            translateX.value = closeSwipe();
          } else if (translateX.value < 0 && rightActions.length > 0) {
            const actionIndex = Math.min(
              Math.floor(absTranslateX / SWIPE_CONFIG.actionWidth) - 1,
              rightActions.length - 1
            );
            const action = rightActions[actionIndex];
            if (action && onActionPress) {
              onActionPress(action.id);
            }
            translateX.value = closeSwipe();
          }
        } else if (absTranslateX > threshold) {
          if (translateX.value > 0) {
            translateX.value = snapToTarget(maxLeftSwipe);
          } else {
            translateX.value = snapToTarget(maxRightSwipe);
          }
        } else {
          translateX.value = closeSwipe();
        }

        hasTriggeredHaptic.current = false;
      },
    })
  ).current;

  const reset = () => {
    translateX.value = closeSwipe();
  };

  return {
    panHandlers: panResponder.panHandlers,
    translateX,
    reset,
  };
}
