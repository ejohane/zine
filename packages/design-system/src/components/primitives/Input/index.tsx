import { isReactNative } from '../../../lib/platform';

// Re-export types
export type { InputProps } from './Input.web';

// Import implementations
import { Input as InputWeb } from './Input.web';
import { Input as InputNative } from './Input.native';

// Export platform-appropriate implementation
const isNative = isReactNative();
export const Input = isNative ? InputNative : InputWeb;