import { isReactNative } from '../../../lib/platform';

// Re-export types
export type { CardProps } from './Card.web';

// Import implementations
import { 
  Card as CardWeb,
  CardHeader as CardHeaderWeb,
  CardTitle as CardTitleWeb,
  CardDescription as CardDescriptionWeb,
  CardContent as CardContentWeb,
  CardFooter as CardFooterWeb
} from './Card.web';

import { 
  Card as CardNative,
  CardHeader as CardHeaderNative,
  CardTitle as CardTitleNative,
  CardDescription as CardDescriptionNative,
  CardContent as CardContentNative,
  CardFooter as CardFooterNative
} from './Card.native';

// Export platform-appropriate implementation
const isNative = isReactNative();
export const Card = isNative ? CardNative : CardWeb;
export const CardHeader = isNative ? CardHeaderNative : CardHeaderWeb;
export const CardTitle = isNative ? CardTitleNative : CardTitleWeb;
export const CardDescription = isNative ? CardDescriptionNative : CardDescriptionWeb;
export const CardContent = isNative ? CardContentNative : CardContentWeb;
export const CardFooter = isNative ? CardFooterNative : CardFooterWeb;