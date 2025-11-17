import { useEffect, useRef } from 'react';
import { View, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { SwipeActions } from './SwipeActions';
import type { SwipeableRowProps, SwipeAction } from './types';
import {
  ACTION_WIDTH,
  FULL_SWIPE_THRESHOLD,
  PARTIAL_SWIPE_THRESHOLD,
  SPRING_CONFIG,
  OVERSCROLL_FRICTION,
} from './gestureConstants';

export function SwipeableRow({
  children,
  leftActions = [],
  rightActions = [],
  onOpen,
  onClose,
  closeSignal = 0,
  enableHaptics = true,
}: SwipeableRowProps) {
  const { width: screenWidth } = useWindowDimensions();
  
  // Shared values
  const translateX = useSharedValue(0);
  const startX = useSharedValue(0);
  const hasTriggeredHaptic = useSharedValue(false);
  
  // Track if row is open
  const isOpen = useRef(false);

  // Calculate boundaries
  const maxLeftSwipe = leftActions.length * ACTION_WIDTH;
  const maxRightSwipe = -rightActions.length * ACTION_WIDTH;
  const fullSwipeThreshold = screenWidth * FULL_SWIPE_THRESHOLD;

  // Handle action execution
  const executeAction = (action: SwipeAction) => {
    action.onPress();
    // Close the row after action
    translateX.value = withSpring(0, SPRING_CONFIG);
    isOpen.current = false;
    onClose?.();
  };

  // Close row programmatically
  useEffect(() => {
    if (closeSignal > 0) {
      translateX.value = withSpring(0, SPRING_CONFIG);
      if (isOpen.current) {
        isOpen.current = false;
        onClose?.();
      }
    }
  }, [closeSignal, onClose]);

  // Pan gesture
  const panGesture = Gesture.Pan()
    .onBegin(() => {
      startX.value = translateX.value;
      hasTriggeredHaptic.value = false;
    })
    .onUpdate((event) => {
      const delta = event.translationX;
      let newTranslateX = startX.value + delta;

      // Apply boundaries with friction for overscroll
      if (newTranslateX > 0) {
        // Swiping right (revealing left actions)
        if (leftActions.length === 0) {
          newTranslateX = 0;
        } else if (newTranslateX > maxLeftSwipe) {
          // Apply friction to overscroll
          const overshoot = newTranslateX - maxLeftSwipe;
          newTranslateX = maxLeftSwipe + overshoot / OVERSCROLL_FRICTION;
        }
      } else if (newTranslateX < 0) {
        // Swiping left (revealing right actions)
        if (rightActions.length === 0) {
          newTranslateX = 0;
        } else if (newTranslateX < maxRightSwipe) {
          // Apply friction to overscroll
          const overshoot = Math.abs(newTranslateX) - Math.abs(maxRightSwipe);
          newTranslateX = maxRightSwipe - overshoot / OVERSCROLL_FRICTION;
        }
      }

      translateX.value = newTranslateX;

      // Trigger haptic at threshold
      const absTranslateX = Math.abs(newTranslateX);
      const threshold = ACTION_WIDTH * PARTIAL_SWIPE_THRESHOLD;
      
      if (absTranslateX > threshold && !hasTriggeredHaptic.value) {
        hasTriggeredHaptic.value = true;
        if (enableHaptics && Platform.OS === 'ios') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      } else if (absTranslateX <= threshold && hasTriggeredHaptic.value) {
        hasTriggeredHaptic.value = false;
      }
    })
    .onEnd((event) => {
      const absTranslateX = Math.abs(translateX.value);
      const velocity = event.velocityX;

      // Check for full swipe action
      if (absTranslateX > fullSwipeThreshold) {
        if (translateX.value > 0 && leftActions.length > 0) {
          const primaryAction = leftActions.find((a) => a.isPrimary) || leftActions[leftActions.length - 1];
          executeAction(primaryAction);
          return;
        } else if (translateX.value < 0 && rightActions.length > 0) {
          const primaryAction = rightActions.find((a) => a.isPrimary) || rightActions[rightActions.length - 1];
          executeAction(primaryAction);
          return;
        }
      }

      // Check for partial swipe open
      const partialThreshold = ACTION_WIDTH * PARTIAL_SWIPE_THRESHOLD;
      const shouldOpen = absTranslateX > partialThreshold || Math.abs(velocity) > 500;

      if (shouldOpen) {
        // Snap to open position
        if (translateX.value > 0) {
          translateX.value = withSpring(maxLeftSwipe, SPRING_CONFIG);
          if (!isOpen.current) {
            isOpen.current = true;
            onOpen?.();
          }
        } else {
          translateX.value = withSpring(maxRightSwipe, SPRING_CONFIG);
          if (!isOpen.current) {
            isOpen.current = true;
            onOpen?.();
          }
        }
      } else {
        // Snap closed
        translateX.value = withSpring(0, SPRING_CONFIG);
        if (isOpen.current) {
          isOpen.current = false;
          onClose?.();
        }
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View style={styles.container}>
      {/* Left actions (revealed by swiping right) */}
      {leftActions.length > 0 && (
        <SwipeActions
          actions={leftActions}
          side="left"
          translateX={translateX}
          onActionPress={executeAction}
        />
      )}
      
      {/* Right actions (revealed by swiping left) */}
      {rightActions.length > 0 && (
        <SwipeActions
          actions={rightActions}
          side="right"
          translateX={translateX}
          onActionPress={executeAction}
        />
      )}

      {/* Foreground row content */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.foreground, animatedStyle]}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
  },
  foreground: {
    backgroundColor: '#fff',
  },
});
