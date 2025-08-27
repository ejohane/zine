import { isReactNative } from '../../../lib/platform';

// Re-export types
export type { MediaCardProps } from './MediaCard.web';

// Import implementations
import { MediaCard as MediaCardWeb } from './MediaCard.web';
import { MediaCard as MediaCardNative } from './MediaCard.native';

// Export platform-appropriate implementation
const isNative = isReactNative();
export const MediaCard = isNative ? MediaCardNative : MediaCardWeb;