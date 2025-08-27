import { isReactNative } from '../../../lib/platform';

// Re-export types
export type { BadgeProps } from './Badge.web';

// Import implementations
import { Badge as BadgeWeb } from './Badge.web';
import { Badge as BadgeNative } from './Badge.native';

// Export platform-appropriate implementation
const isNative = isReactNative();
export const Badge = isNative ? BadgeNative : BadgeWeb;