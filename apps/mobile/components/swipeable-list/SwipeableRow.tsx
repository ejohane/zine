import { useRef, useCallback, useEffect } from 'react';
import { View, StyleSheet, Platform, Animated } from 'react-native';
import { Swipeable, RectButton } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import type { SwipeableRowProps } from './types';
import { ACTION_WIDTH } from './gestureConstants';

export function SwipeableRow({
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

  // Close row programmatically
  useEffect(() => {
    if (closeSignal > 0 && swipeableRef.current) {
      swipeableRef.current.close();
    }
  }, [closeSignal]);

  const renderLeftActions = useCallback(
    (progress: Animated.AnimatedInterpolation<number>, _dragX: Animated.AnimatedInterpolation<number>) => {
      if (leftActions.length === 0) return null;

      return (
        <View style={styles.actionsContainer}>
          {leftActions.map((action, index) => {
            const trans = progress.interpolate({
              inputRange: [0, 1],
              outputRange: [-ACTION_WIDTH * (leftActions.length - index), 0],
            });

            return (
              <Animated.View
                key={action.key}
                style={[
                  styles.actionButton,
                  { 
                    width: ACTION_WIDTH,
                    backgroundColor: action.color,
                    transform: [{ translateX: trans }],
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
                  <View style={styles.actionContent}>
                    {action.icon}
                  </View>
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
    (progress: Animated.AnimatedInterpolation<number>, _dragX: Animated.AnimatedInterpolation<number>) => {
      if (rightActions.length === 0) return null;

      return (
        <View style={styles.actionsContainer}>
          {rightActions.map((action, index) => {
            const trans = progress.interpolate({
              inputRange: [0, 1],
              outputRange: [ACTION_WIDTH * (index + 1), 0],
            });

            return (
              <Animated.View
                key={action.key}
                style={[
                  styles.actionButton,
                  { 
                    width: ACTION_WIDTH,
                    backgroundColor: action.color,
                    transform: [{ translateX: trans }],
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
                  <View style={styles.actionContent}>
                    {action.icon}
                  </View>
                </RectButton>
              </Animated.View>
            );
          })}
        </View>
      );
    },
    [rightActions, enableHaptics]
  );

  const handleSwipeableOpen = useCallback(
    (_direction: 'left' | 'right') => {
      if (!isOpen.current) {
        isOpen.current = true;
        onOpen?.();
        if (enableHaptics && Platform.OS === 'ios') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      }
    },
    [onOpen, enableHaptics]
  );

  const handleSwipeableClose = useCallback(() => {
    if (isOpen.current) {
      isOpen.current = false;
      onClose?.();
    }
  }, [onClose]);

  return (
    <Swipeable
      ref={swipeableRef}
      friction={2}
      leftThreshold={30}
      rightThreshold={30}
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      onSwipeableOpen={handleSwipeableOpen}
      onSwipeableClose={handleSwipeableClose}
      overshootLeft={false}
      overshootRight={false}
    >
      <View style={styles.foreground}>{children}</View>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  foreground: {
    backgroundColor: '#fff',
  },
  actionsContainer: {
    flexDirection: 'row',
  },
  actionButton: {
    justifyContent: 'center',
    alignItems: 'center',
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
});
