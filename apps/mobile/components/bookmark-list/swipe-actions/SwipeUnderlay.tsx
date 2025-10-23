import { View, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  interpolate,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useSwipeableItemParams } from 'react-native-swipeable-item';
import type { SwipeAction } from '../types';

const ACTION_WIDTH = 80;

interface SwipeUnderlayProps {
  actions: SwipeAction[];
  side: 'left' | 'right';
  onActionPress: (actionId: string) => void;
}

export function SwipeUnderlay({ actions, side, onActionPress }: SwipeUnderlayProps) {
  const { percentOpen } = useSwipeableItemParams();

  const animatedStyle = useAnimatedStyle(() => {
    const absPercentOpen = Math.abs(percentOpen.value);

    const opacity = interpolate(absPercentOpen, [0, 0.4, 1], [0, 0.5, 1]);

    const scale = interpolate(absPercentOpen, [0, 0.4, 1], [0.8, 0.9, 1]);

    return {
      opacity,
      transform: [{ scale }],
    };
  });

  return (
    <View
      style={[
        styles.container,
        side === 'left' ? styles.leftContainer : styles.rightContainer,
      ]}
    >
      {actions.map((action, index) => (
        <Pressable
          key={action.id}
          onPress={() => onActionPress(action.id)}
          style={[
            styles.actionButton,
            { backgroundColor: action.backgroundColor },
            side === 'left'
              ? { left: index * ACTION_WIDTH }
              : { right: index * ACTION_WIDTH },
          ]}
        >
          <Animated.View style={animatedStyle}>
            <Feather
              name={action.icon as any}
              size={20}
              color={action.iconColor || '#fff'}
            />
          </Animated.View>
        </Pressable>
      ))}
    </View>
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
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
});
