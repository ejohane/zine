/**
 * Width of each action button in pixels
 */
export const ACTION_WIDTH = 80;

/**
 * Threshold for partial swipe (as percentage of action width)
 * When user releases gesture beyond this, the row stays open
 */
export const PARTIAL_SWIPE_THRESHOLD = 0.5;

/**
 * Threshold for full swipe activation (as percentage of row width)
 * When user swipes beyond this, the primary action is triggered
 */
export const FULL_SWIPE_THRESHOLD = 0.55;

/**
 * Spring animation configuration for snapping animations
 */
export const SPRING_CONFIG = {
  damping: 20,
  stiffness: 300,
  mass: 0.5,
  overshootClamping: false,
  restDisplacementThreshold: 0.01,
  restSpeedThreshold: 0.01,
};

/**
 * Timing animation configuration for closing animations
 */
export const TIMING_CONFIG = {
  duration: 250,
};

/**
 * Friction applied to overscroll (beyond max swipe distance)
 */
export const OVERSCROLL_FRICTION = 3;

/**
 * Minimum velocity to trigger action on release (pts/sec)
 */
export const VELOCITY_THRESHOLD = 500;
