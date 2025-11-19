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
          totalActions={actions.length}
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
  totalActions: number;
  side: 'left' | 'right';
  translateX: SharedValue<number>;
  onPress: () => void;
}

function SwipeActionButton({
  action,
  index,
  totalActions,
  side,
  translateX,
  onPress,
}: SwipeActionButtonProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const absTranslateX = Math.abs(translateX.value);
    
    // When swiping right (positive translateX), reveal left actions:
    // First action (index 0) should appear first
    // When swiping left (negative translateX), reveal right actions:
    // Last action should appear first
    const animIndex = side === 'left' ? index : (totalActions - 1 - index);
    const startReveal = animIndex * ACTION_WIDTH;
    const endReveal = (animIndex + 1) * ACTION_WIDTH;

    // Opacity: fade in as action is revealed
    const opacity = interpolate(
      absTranslateX,
      [startReveal, endReveal],
      [0, 1],
      Extrapolation.CLAMP
    );

    // Scale: grow from 0 to full size as action is revealed
    const scale = interpolate(
      absTranslateX,
      [startReveal, endReveal],
      [0, 1],
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
        side === 'left'
          ? { left: index * ACTION_WIDTH }
          : { right: index * ACTION_WIDTH },
      ]}
    >
      <Animated.View style={[styles.iconCircle, { backgroundColor: action.color }, animatedStyle]}>
        {action.icon}
      </Animated.View>
      {action.label && <Text style={styles.actionLabel}>{action.label}</Text>}
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
    gap: 4,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#000',
  },
  actionContent: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  actionLabel: {
    color: '#666',
    fontSize: 12,
    fontWeight: '600',
  },
});
