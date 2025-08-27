import { isReactNative } from '../../../lib/platform';

// Re-export types
export type { QueueItemProps } from './QueueItem.web';

// Import implementations
import { QueueItem as QueueItemWeb } from './QueueItem.web';
import { QueueItem as QueueItemNative } from './QueueItem.native';

// Export platform-appropriate implementation
const isNative = isReactNative();
export const QueueItem = isNative ? QueueItemNative : QueueItemWeb;