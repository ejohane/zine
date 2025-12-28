/**
 * PressableScale Component
 *
 * An animated pressable wrapper that provides scale feedback on press.
 * Uses react-native-reanimated for smooth spring animations.
 */

import { Pressable } from 'react-native';
import Animated, {
  FadeInRight,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: React.ComponentProps<typeof Pressable>['style'];
  /** Animation delay in ms for stagger effects */
  delay?: number;
}

/**
 * Pressable wrapper with scale animation feedback.
 *
 * @example
 * ```tsx
 * <PressableScale onPress={handlePress} delay={100}>
 *   <Card />
 * </PressableScale>
 * ```
 */
export function PressableScale({ children, onPress, style, delay = 0 }: PressableScaleProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.96, { damping: 15, stiffness: 400 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  };

  return (
    <Animated.View entering={FadeInRight.delay(delay).duration(400)}>
      <AnimatedPressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[animatedStyle, style]}
      >
        {children}
      </AnimatedPressable>
    </Animated.View>
  );
}
