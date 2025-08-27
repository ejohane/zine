import { isReactNative } from '../../../lib/platform';

// Re-export types
export type { ActionCardProps } from './ActionCard.web';

// Import implementations
import { ActionCard as ActionCardWeb } from './ActionCard.web';
import { ActionCard as ActionCardNative } from './ActionCard.native';

// Export platform-appropriate implementation
const isNative = isReactNative();
export const ActionCard = isNative ? ActionCardNative : ActionCardWeb;