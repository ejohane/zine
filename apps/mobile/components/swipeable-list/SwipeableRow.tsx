import { useRef, useState, useCallback, useEffect, memo } from 'react';
import { View, StyleSheet, Platform, Animated } from 'react-native';
import { Swipeable, RectButton } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/theme';
import type { SwipeableRowProps } from './types';
import { ACTION_WIDTH } from './gestureConstants';

export const SwipeableRow = memo(function SwipeableRow({
  children,
  leftActions = [],
  rightActions = [],
  onOpen,
  onClose,
  closeSignal = 0,
  enableHaptics = true,
}: SwipeableRowProps) {
  const swipeableRef = useRef<Swipeable>(null);
  const isOpen = useRef(false);
  const [isSwiping, setIsSwiping] = useState(false);
  const { colors } = useTheme();
  
  // Find primary actions for overshoot
  const primaryLeftAction = leftActions.find(action => action.isPrimary);
  const primaryRightAction = rightActions.find(action => action.isPrimary);

  // Close row programmatically
  useEffect(() => {
    if (closeSignal > 0 && swipeableRef.current) {
      swipeableRef.current.close();
    }
  }, [closeSignal]);

  const renderLeftActions = useCallback(
    (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
      if (leftActions.length === 0) return null;

      return (
        <View style={styles.actionsContainer}>
          {leftActions.map((action, index) => {
            // First action (index 0) should appear first when swiping right
            const revealProgress = index / leftActions.length;
            const opacity = progress.interpolate({
              inputRange: [revealProgress, revealProgress + (1 / leftActions.length)],
              outputRange: [0, 1],
              extrapolate: 'clamp',
            });

            const scale = progress.interpolate({
              inputRange: [revealProgress, revealProgress + (1 / leftActions.length)],
              outputRange: [0, 1],
              extrapolate: 'clamp',
            });

            return (
              <Animated.View
                key={action.key}
                style={[
                  styles.actionButton,
                  { 
                    width: ACTION_WIDTH,
                  },
                ]}
              >
                <RectButton
                  style={styles.actionButtonInner}
                  onPress={() => {
                    action.onPress();
                    swipeableRef.current?.close();
                    if (enableHaptics && Platform.OS === 'ios') {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    }
                  }}
                >
                  <Animated.View 
                    style={[
                      styles.iconCircle, 
                      { 
                        backgroundColor: action.color,
                        opacity,
                        transform: [{ scale }],
                      }
                    ]}
                  >
                    {action.icon}
                  </Animated.View>
                </RectButton>
              </Animated.View>
            );
          })}
        </View>
      );
    },
    [leftActions, enableHaptics]
  );

  const renderRightActions = useCallback(
    (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
      if (rightActions.length === 0) return null;

      return (
        <View style={styles.actionsContainer}>
          {rightActions.map((action, index) => {
            // Last action should appear first when swiping left
            const reversedIndex = rightActions.length - 1 - index;
            const revealProgress = reversedIndex / rightActions.length;
            const opacity = progress.interpolate({
              inputRange: [revealProgress, revealProgress + (1 / rightActions.length)],
              outputRange: [0, 1],
              extrapolate: 'clamp',
            });

            const scale = progress.interpolate({
              inputRange: [revealProgress, revealProgress + (1 / rightActions.length)],
              outputRange: [0, 1],
              extrapolate: 'clamp',
            });

            return (
              <Animated.View
                key={action.key}
                style={[
                  styles.actionButton,
                  { 
                    width: ACTION_WIDTH,
                  },
                ]}
              >
                <RectButton
                  style={styles.actionButtonInner}
                  onPress={() => {
                    action.onPress();
                    swipeableRef.current?.close();
                    if (enableHaptics && Platform.OS === 'ios') {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    }
                  }}
                >
                  <Animated.View 
                    style={[
                      styles.iconCircle, 
                      { 
                        backgroundColor: action.color,
                        opacity,
                        transform: [{ scale }],
                      }
                    ]}
                  >
                    {action.icon}
                  </Animated.View>
                </RectButton>
              </Animated.View>
            );
          })}
        </View>
      );
    },
    [rightActions, enableHaptics]
  );

  const handleSwipeableWillOpen = useCallback(() => {
    // Mark as swiping to prevent child press handlers
    setIsSwiping(true);
  }, []);

  const handleSwipeableOpen = useCallback(
    (_direction: 'left' | 'right') => {
      if (!isOpen.current) {
        isOpen.current = true;
        onOpen?.();
        if (enableHaptics && Platform.OS === 'ios') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      }
      // Keep swiping true while open
      setIsSwiping(true);
    },
    [onOpen, enableHaptics]
  );

  const handleSwipeableClose = useCallback(() => {
    if (isOpen.current) {
      isOpen.current = false;
      onClose?.();
    }
    // Reset swiping state after close
    setIsSwiping(false);
  }, [onClose]);

  // Handle overshoot left (swiping right past threshold)
  const handleOvershootLeft = useCallback(() => {
    if (primaryLeftAction) {
      if (enableHaptics && Platform.OS === 'ios') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }
      primaryLeftAction.onPress();
      swipeableRef.current?.close();
    }
  }, [primaryLeftAction, enableHaptics]);

  // Handle overshoot right (swiping left past threshold)
  const handleOvershootRight = useCallback(() => {
    if (primaryRightAction) {
      if (enableHaptics && Platform.OS === 'ios') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }
      primaryRightAction.onPress();
      swipeableRef.current?.close();
    }
  }, [primaryRightAction, enableHaptics]);

  // Handle press on foreground - prevent if swiping
  const handleForegroundPress = useCallback(() => {
    // Prevent press if we're in the middle of a swipe
    if (isSwiping) {
      return;
    }
    // If row is open, close it
    if (isOpen.current) {
      swipeableRef.current?.close();
    }
  }, [isSwiping]);

  return (
    <Swipeable
      ref={swipeableRef}
      friction={2}
      leftThreshold={30}
      rightThreshold={30}
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      onSwipeableWillOpen={handleSwipeableWillOpen}
      onSwipeableOpen={handleSwipeableOpen}
      onSwipeableClose={handleSwipeableClose}
      overshootLeft={!!primaryLeftAction}
      overshootRight={!!primaryRightAction}
      onSwipeableLeftOpen={handleOvershootLeft}
      onSwipeableRightOpen={handleOvershootRight}
      activeOffsetX={[-10, 10]}
      failOffsetY={[-5, 5]}
    >
      <View 
        style={[styles.foreground, { backgroundColor: colors.card }]}
        pointerEvents={isSwiping ? 'none' : 'auto'}
      >
        {children}
      </View>
    </Swipeable>
  );
});

const styles = StyleSheet.create({
  foreground: {
    // backgroundColor is applied dynamically via theme
  },
  actionsContainer: {
    flexDirection: 'row',
    height: '100%',
  },
  actionButton: {
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
  },
  actionButtonInner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  actionContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
});
