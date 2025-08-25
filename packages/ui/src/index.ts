// Components
export { Button } from './components/Button';
export type { ButtonProps } from './components/Button';

export { Text } from './components/Text';
export type { TextProps } from './components/Text';

export { 
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent 
} from './components/Card';
export type { 
  CardProps,
  CardHeaderProps,
  CardTitleProps,
  CardDescriptionProps,
  CardContentProps
} from './components/Card';

export { Input } from './components/Input';
export type { InputProps } from './components/Input';

export { Badge } from './components/Badge';
export type { BadgeProps } from './components/Badge';

export { Alert, AlertDescription } from './components/Alert';
export type { AlertProps, AlertDescriptionProps } from './components/Alert';

export { Checkbox } from './components/Checkbox';
export type { CheckboxProps } from './components/Checkbox';

// Providers
export { ThemeProvider, useTheme } from './providers/ThemeProvider';
export type { ThemeProviderProps } from './providers/ThemeProvider';

// Utilities
export { cn, type ClassName } from './lib/cn';
export { 
  isReactNative, 
  isWeb, 
  isIOS, 
  isAndroid, 
  getPlatform, 
  platformSelect,
  type PlatformType 
} from './lib/platform';

// Variants
export {
  cva,
  buttonVariants,
  textVariants,
  cardVariants,
  type VariantProps
} from './lib/variants';