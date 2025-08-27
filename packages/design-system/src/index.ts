// Tokens
export * from './tokens';
export * as tokens from './tokens';

// Library utilities
export { cn, type ClassName } from './lib/cn';
export {
  isReactNative,
  isWeb,
  isIOS,
  isAndroid,
  getPlatform,
  platformSelect,
  type PlatformType,
} from './lib/platform';
export {
  cva,
  buttonVariants,
  textVariants,
  cardVariants,
  badgeVariants,
  type VariantProps,
} from './lib/variants';

// Primitive Components with platform support
export { Button, type ButtonProps } from './components/primitives/Button';
export { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardDescription, 
  CardContent, 
  CardFooter,
  type CardProps 
} from './components/primitives/Card';
export { Input, type InputProps } from './components/primitives/Input';
export { Badge, type BadgeProps } from './components/primitives/Badge';
export { 
  Text, 
  H1, H2, H3, H4, H5, H6,
  Body, Caption, Label,
  type TextProps 
} from './components/primitives/Text';

// Re-export existing shadcn components (web-only for now)
export * from './components/ui/button';
export * from './components/ui/label';
export * from './components/ui/avatar';
export * from './components/ui/tabs';
export * from './components/ui/dialog';
export * from './components/ui/dropdown-menu';
export * from './components/ui/skeleton';
export * from './components/ui/separator';

// Export layout components
export * from './components/layout/AppShell';
export * from './components/layout/Container';
export * from './components/layout/Section';
export * from './components/layout/Grid';
export * from './components/layout/Stack';
export * from './components/layout/Flex';

// Export navigation components
export * from './components/navigation/NavItem';
export * from './components/navigation/BottomNav';
export * from './components/navigation/QuickActionButton';
export * from './components/navigation/QuickActionGrid';
export * from './components/navigation/Navbar';
export * from './components/navigation/Sidebar';
export * from './components/navigation/Breadcrumb';

// Export feedback components
export * from './components/feedback/Spinner';
export * from './components/feedback/Progress';
export * from './components/feedback/Toast';

// Export patterns
export * from './components/patterns/BookmarkCard';
export * from './components/patterns/SubscriptionItem';
export { MediaCard, type MediaCardProps } from './components/patterns/MediaCard';
export { QueueItem, type QueueItemProps } from './components/patterns/QueueItem';
export { ActionCard, type ActionCardProps } from './components/patterns/ActionCard';

// Export Silk components
export * from './components/silk/Sheet';
export * from './components/silk/BottomSheet';

// Export theme provider and components
export { ThemeProvider, useTheme, type Theme, type ThemeContextValue } from './providers/theme/ThemeProvider';
export { ThemeSwitcher, type ThemeSwitcherProps } from './components/ThemeSwitcher';

// Export utils (backward compatibility)
export { cn as default } from './lib/cn';
export { cn as utils } from './lib/cn';