import { withSpring, withTiming } from 'react-native-reanimated';

export const SWIPE_CONFIG = {
  actionWidth: 80,
  threshold: 0.4,
  fullThreshold: 0.7,
  overshootFriction: 8,
};

export const SPRING_CONFIG = {
  damping: 30,
  stiffness: 300,
  mass: 1,
};

export const TIMING_CONFIG = {
  duration: 200,
};

export function snapToTarget(targetX: number) {
  'worklet';
  return withSpring(targetX, SPRING_CONFIG);
}

export function closeSwipe() {
  'worklet';
  return withSpring(0, SPRING_CONFIG);
}

export function animateToValue(value: number) {
  'worklet';
  return withTiming(value, TIMING_CONFIG);
}
