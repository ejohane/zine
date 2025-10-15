import { View, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  interpolate,
  type SharedValue,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { SWIPE_CONFIG } from './swipeAnimations';
import type { SwipeAction } from '../types';

interface SwipeActionViewProps {
  actions: SwipeAction[];
  side: 'left' | 'right';
  translateX: SharedValue<number>;
  onActionPress: (actionId: string) => void;
}

export function SwipeActionView({
  actions,
  side,
  translateX,
  onActionPress,
}: SwipeActionViewProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      Math.abs(translateX.value),
      [0, SWIPE_CONFIG.actionWidth * 0.4, SWIPE_CONFIG.actionWidth],
      [0, 0.5, 1]
    );

    const scale = interpolate(
      Math.abs(translateX.value),
      [0, SWIPE_CONFIG.actionWidth * 0.4, SWIPE_CONFIG.actionWidth],
      [0.8, 0.9, 1]
    );

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
            side === 'left' ? { left: index * SWIPE_CONFIG.actionWidth } : { right: index * SWIPE_CONFIG.actionWidth },
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
    width: SWIPE_CONFIG.actionWidth,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
});
