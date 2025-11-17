import { View, StyleSheet, Pressable, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';
import type { SwipeAction } from './types';
import { ACTION_WIDTH } from './gestureConstants';

interface SwipeActionsProps {
  actions: SwipeAction[];
  side: 'left' | 'right';
  translateX: SharedValue<number>;
  onActionPress: (action: SwipeAction) => void;
}

export function SwipeActions({
  actions,
  side,
  translateX,
  onActionPress,
}: SwipeActionsProps) {
  if (actions.length === 0) return null;

  const totalWidth = actions.length * ACTION_WIDTH;

  return (
    <View
      style={[
        styles.container,
        side === 'left' ? styles.leftContainer : styles.rightContainer,
        { width: totalWidth },
      ]}
    >
      {actions.map((action, index) => (
        <SwipeActionButton
          key={action.key}
          action={action}
          index={index}
          side={side}
          translateX={translateX}
          onPress={() => onActionPress(action)}
        />
      ))}
    </View>
  );
}

interface SwipeActionButtonProps {
  action: SwipeAction;
  index: number;
  side: 'left' | 'right';
  translateX: SharedValue<number>;
  onPress: () => void;
}

function SwipeActionButton({
  action,
  index,
  side,
  translateX,
  onPress,
}: SwipeActionButtonProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const absTranslateX = Math.abs(translateX.value);
    const startReveal = index * ACTION_WIDTH;
    const endReveal = (index + 1) * ACTION_WIDTH;

    // Opacity: fade in as action is revealed
    const opacity = interpolate(
      absTranslateX,
      [startReveal, endReveal],
      [0, 1],
      Extrapolation.CLAMP
    );

    // Scale: slightly scale up as action is revealed
    const scale = interpolate(
      absTranslateX,
      [startReveal, endReveal],
      [0.8, 1],
      Extrapolation.CLAMP
    );

    return {
      opacity,
      transform: [{ scale }],
    };
  });

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.actionButton,
        { backgroundColor: action.color },
        side === 'left'
          ? { left: index * ACTION_WIDTH }
          : { right: index * ACTION_WIDTH },
      ]}
    >
      <Animated.View style={[styles.actionContent, animatedStyle]}>
        {action.icon}
        {action.label && <Text style={styles.actionLabel}>{action.label}</Text>}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  leftContainer: {
    left: 0,
  },
  rightContainer: {
    right: 0,
  },
  actionButton: {
    width: ACTION_WIDTH,
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionContent: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  actionLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
