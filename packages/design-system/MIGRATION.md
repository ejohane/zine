# Migration Guide: Unified Design System

This guide helps you migrate from the old package structure (`@zine/ui`, `@zine/design-tokens`, etc.) to the new unified `@zine/design-system` package.

## Table of Contents
- [Overview](#overview)
- [Package Changes](#package-changes)
- [Import Changes](#import-changes)
- [Component Changes](#component-changes)
- [Theme Migration](#theme-migration)
- [Platform-Specific Code](#platform-specific-code)
- [Common Migration Patterns](#common-migration-patterns)

## Overview

The unified design system consolidates multiple packages into a single, platform-aware package that works seamlessly across web and mobile platforms.

### What's New
- **Single Package**: All UI components, tokens, and utilities in one place
- **Platform-Aware**: Components automatically adapt to web/mobile
- **Built-in Theme**: Dark mode support with theme persistence
- **Better TypeScript**: Improved type exports and inference
- **Unified API**: Same component API works on both platforms

### Breaking Changes
- Package names have changed
- Some component APIs have been unified
- Theme provider is now required
- Platform detection utilities have new names

## Package Changes

### Before (Multiple Packages)
```json
{
  "dependencies": {
    "@zine/ui": "^1.0.0",
    "@zine/design-tokens": "^1.0.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.0.0",
    "tailwind-merge": "^2.0.0"
  }
}
```

### After (Single Package)
```json
{
  "dependencies": {
    "@zine/design-system": "^2.0.0"
  }
}
```

All utilities (cn, cva, clsx) are now included and re-exported from the design system.

## Import Changes

### Components

#### Before
```tsx
// Multiple imports from different packages
import { Button } from '@zine/ui';
import { Card } from '@zine/ui/card';
import { Input } from '@zine/ui/input';
import { Badge } from '@zine/ui/badge';
```

#### After
```tsx
// Single import statement
import { Button, Card, Input, Badge } from '@zine/design-system';
```

### Design Tokens

#### Before
```tsx
import { colors, spacing, typography } from '@zine/design-tokens';

const primaryColor = colors.brand.primary[500];
const padding = spacing[4];
const fontSize = typography.fontSize.lg;
```

#### After
```tsx
import { tokens } from '@zine/design-system';

const primaryColor = tokens.colors.brand.primary[500];
const padding = tokens.spacing[4];
const fontSize = tokens.typography.fontSize.lg;
```

### Utilities

#### Before
```tsx
import { cn } from '@zine/ui/lib/utils';
import clsx from 'clsx';
import { cva } from 'class-variance-authority';
```

#### After
```tsx
// All utilities are included
import { cn, clsx, cva } from '@zine/design-system';
```

## Component Changes

### Button

#### Before
```tsx
<Button 
  variant="primary"
  size="medium"
  onClick={handleClick}
>
  Click me
</Button>
```

#### After
```tsx
<Button 
  variant="primary"
  size="md"  // Size values simplified: sm, md, lg
  onPress={handlePress}  // Works on both platforms
>
  Click me
</Button>
```

**Changes:**
- `onClick` → `onPress` (platform-aware)
- Size values: `small/medium/large` → `sm/md/lg`
- New `loading` prop for loading states

### Card

#### Before
```tsx
<Card className="p-4">
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>Content</CardContent>
</Card>
```

#### After
```tsx
<Card>
  <Card.Header>
    <Card.Title>Title</Card.Title>
  </Card.Header>
  <Card.Content>Content</Card.Content>
</Card>
```

**Changes:**
- Nested components use dot notation
- Built-in padding with `padding` prop
- New `variant` prop for different styles
- `pressable` prop for interactive cards

### Input

#### Before
```tsx
<Input 
  type="text"
  value={value}
  onChange={(e) => setValue(e.target.value)}
  className="w-full"
/>
```

#### After
```tsx
<Input 
  type="text"
  value={value}
  onChangeText={setValue}  // Platform-aware
  className="w-full"  // Still works on web
/>
```

**Changes:**
- `onChange` → `onChangeText` (simpler, works on both platforms)
- New `error` prop for validation messages

### Text (New Component)

#### Before
```tsx
// Manual HTML elements
<h1 className="text-2xl font-bold">Heading</h1>
<p className="text-base">Body text</p>
<span className="text-sm text-gray-500">Caption</span>
```

#### After
```tsx
import { Text } from '@zine/design-system';

<Text variant="h1">Heading</Text>
<Text variant="body">Body text</Text>
<Text variant="caption">Caption</Text>
```

**Benefits:**
- Platform-aware text rendering
- Consistent typography across platforms
- Built-in dark mode support

## Theme Migration

### Setting Up Theme Provider

#### Before
```tsx
// No theme provider needed
function App() {
  return <YourApp />;
}
```

#### After
```tsx
import { ThemeProvider } from '@zine/design-system';

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="zine-theme">
      <YourApp />
    </ThemeProvider>
  );
}
```

### Using Theme

#### Before
```tsx
// Manual theme management
const [isDark, setIsDark] = useState(false);

<button onClick={() => setIsDark(!isDark)}>
  Toggle theme
</button>
```

#### After
```tsx
import { useTheme } from '@zine/design-system';

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  
  return (
    <Button onPress={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
      Toggle theme
    </Button>
  );
}
```

### Dark Mode Classes

#### Before
```tsx
// Manual dark mode classes
<div className="bg-white dark:bg-gray-900">
  <p className="text-black dark:text-white">Content</p>
</div>
```

#### After
```tsx
// Use semantic color tokens
<Card>
  <Text>Content automatically adapts to theme</Text>
</Card>

// Or use theme-aware classes
<Box background="surface" borderColor="border">
  <Text>Theme-aware content</Text>
</Box>
```

## Platform-Specific Code

### Platform Detection

#### Before
```tsx
// Manual platform detection
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

if (typeof window !== 'undefined') {
  // Web code
} else {
  // Mobile code
}
```

#### After
```tsx
import { getPlatform, isWeb, isNative, platformSelect } from '@zine/design-system';

// Get current platform
const platform = getPlatform(); // 'web' | 'ios' | 'android'

// Boolean checks
if (isWeb()) {
  // Web-specific code
}

if (isNative()) {
  // Mobile-specific code
}

// Platform-specific values
const style = platformSelect({
  web: 'shadow-lg',
  ios: 'shadow-sm',
  android: 'elevation-2',
  default: 'shadow-md'
});
```

### Event Handlers

#### Before
```tsx
// Different handlers for different platforms
<button onClick={handleClick}>Web Button</button>
<TouchableOpacity onPress={handlePress}>Mobile Button</TouchableOpacity>
```

#### After
```tsx
// Single API for both platforms
<Button onPress={handlePress}>Universal Button</Button>
```

## Common Migration Patterns

### 1. Custom Button Component

#### Before
```tsx
import { Button as BaseButton } from '@zine/ui';
import { cn } from '@zine/ui/lib/utils';

export function CustomButton({ className, ...props }) {
  return (
    <BaseButton 
      className={cn('custom-styles', className)}
      {...props}
    />
  );
}
```

#### After
```tsx
import { Button, cn } from '@zine/design-system';
import type { ButtonProps } from '@zine/design-system';

export function CustomButton({ className, ...props }: ButtonProps) {
  return (
    <Button 
      className={cn('custom-styles', className)}
      {...props}
    />
  );
}
```

### 2. Form Components

#### Before
```tsx
import { Input } from '@zine/ui/input';
import { Label } from '@zine/ui/label';
import { Button } from '@zine/ui';

<form onSubmit={handleSubmit}>
  <Label htmlFor="email">Email</Label>
  <Input 
    id="email"
    type="email"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
  />
  <Button type="submit">Submit</Button>
</form>
```

#### After
```tsx
import { Input, Label, Button, Stack } from '@zine/design-system';

<Stack spacing="md">
  <Label htmlFor="email">Email</Label>
  <Input 
    id="email"
    type="email"
    value={email}
    onChangeText={setEmail}
  />
  <Button onPress={handleSubmit}>Submit</Button>
</Stack>
```

### 3. Card-based Layouts

#### Before
```tsx
import { Card, CardHeader, CardTitle, CardContent } from '@zine/ui/card';

<div className="grid grid-cols-3 gap-4">
  {items.map(item => (
    <Card key={item.id} className="p-4">
      <CardHeader>
        <CardTitle>{item.title}</CardTitle>
      </CardHeader>
      <CardContent>{item.content}</CardContent>
    </Card>
  ))}
</div>
```

#### After
```tsx
import { Card, Box } from '@zine/design-system';

<Box className="grid grid-cols-3 gap-4">
  {items.map(item => (
    <Card key={item.id} variant="elevated">
      <Card.Header>
        <Card.Title>{item.title}</Card.Title>
      </Card.Header>
      <Card.Content>{item.content}</Card.Content>
    </Card>
  ))}
</Box>
```

### 4. Using Design Tokens

#### Before
```tsx
import { colors, spacing } from '@zine/design-tokens';

const styles = {
  backgroundColor: colors.brand.primary[500],
  padding: spacing[4],
  marginBottom: spacing[2]
};
```

#### After
```tsx
import { tokens } from '@zine/design-system';

const styles = {
  backgroundColor: tokens.colors.brand.primary[500],
  padding: tokens.spacing[4],
  marginBottom: tokens.spacing[2]
};
```

## Step-by-Step Migration Process

### 1. Install the new package
```bash
bun add @zine/design-system
bun remove @zine/ui @zine/design-tokens
```

### 2. Add ThemeProvider
Wrap your app root with the theme provider:
```tsx
import { ThemeProvider } from '@zine/design-system';

<ThemeProvider>
  <App />
</ThemeProvider>
```

### 3. Update imports
Use find and replace to update import statements:
- `from '@zine/ui'` → `from '@zine/design-system'`
- `from '@zine/design-tokens'` → `from '@zine/design-system'`

### 4. Update component usage
- Replace `onClick` with `onPress` for buttons
- Replace `onChange` with `onChangeText` for inputs
- Update size props: `medium` → `md`, etc.

### 5. Update token references
- `colors.` → `tokens.colors.`
- `spacing.` → `tokens.spacing.`
- `typography.` → `tokens.typography.`

### 6. Test thoroughly
- Test both light and dark modes
- Verify mobile responsiveness
- Check TypeScript types

## Troubleshooting

### TypeScript Errors

If you see TypeScript errors after migration:

1. **Clear TypeScript cache**:
   ```bash
   rm -rf node_modules/.cache
   bun run type-check
   ```

2. **Update type imports**:
   ```tsx
   // Import types explicitly
   import type { ButtonProps, CardProps } from '@zine/design-system';
   ```

### Style Issues

If styles look different:

1. **Check theme provider**: Ensure ThemeProvider wraps your app
2. **Update Tailwind config**: Use the design system's theme preset
3. **Check dark mode**: Some components now have automatic dark mode support

### Platform Issues

If components behave differently on mobile:

1. **Use platform-aware props**: `onPress` instead of `onClick`
2. **Test on actual devices**: Some behaviors differ in simulators
3. **Check platform detection**: Use `getPlatform()` to debug

## Getting Help

- **Documentation**: See the [README](./README.md) for complete API documentation
- **Examples**: Check the [component documentation](./docs/components.md)
- **Issues**: Report problems in the repository issues

## Next Steps

After migration:
1. Remove old package dependencies
2. Update your CI/CD configuration
3. Update documentation to reference new package
4. Consider adopting new components (Text, Stack, Box)
5. Leverage platform-aware features for better mobile experience