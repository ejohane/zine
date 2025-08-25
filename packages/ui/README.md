# @zine/ui

Unified component library for Zine web and mobile applications.

## Features

- ✅ Cross-platform components (React & React Native)
- ✅ Platform detection utilities
- ✅ Tailwind CSS support with NativeWind for mobile
- ✅ Component variants with CVA
- ✅ Uses @zine/design-tokens for consistent styling

## Installation

```bash
bun add @zine/ui
```

## Usage

### Button Component

```tsx
import { Button } from '@zine/ui';

// Web usage
<Button 
  variant="primary" 
  size="md"
  onClick={() => console.log('Clicked!')}
>
  Click me
</Button>

// React Native usage
<Button 
  variant="primary" 
  size="md"
  onPress={() => console.log('Pressed!')}
>
  Press me
</Button>
```

### Utilities

```tsx
import { cn, isReactNative, platformSelect } from '@zine/ui';

// Merge class names
const className = cn('base-class', condition && 'conditional-class');

// Platform detection
if (isReactNative()) {
  // React Native specific code
}

// Platform-specific values
const value = platformSelect({
  web: 'web-value',
  ios: 'ios-value',
  android: 'android-value',
  default: 'fallback-value'
});
```

## Available Components

- **Button**: Cross-platform button with variants and loading state

## Available Utilities

- **cn**: Class name merging utility
- **Platform detection**: isReactNative, isWeb, isIOS, isAndroid
- **platformSelect**: Select values based on platform
- **CVA variants**: buttonVariants, textVariants, cardVariants

## Development

```bash
# Install dependencies
bun install

# Build the package
bun run build

# Type checking
bun run type-check

# Watch mode
bun run dev
```
