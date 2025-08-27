# @zine/design-system

A unified, platform-aware design system for Zine applications supporting both web and mobile platforms.

## 🚀 Features

- **Unified Component Library** - Single source of truth for all UI components
- **Platform-Aware** - Components automatically adapt to web and mobile environments
- **Dark Mode Support** - Built-in theme system with light and dark modes
- **TypeScript First** - Full type safety and excellent IDE support
- **Tree-Shakeable** - Import only what you need
- **Accessible** - Built on Radix UI primitives with ARIA compliance
- **Design Tokens** - Consistent colors, typography, spacing across platforms

## 📦 Installation

```bash
# Using bun (recommended)
bun add @zine/design-system

# Using npm
npm install @zine/design-system

# Using yarn
yarn add @zine/design-system
```

## 🎯 Quick Start

### 1. Wrap your app with the theme provider

```tsx
import { ThemeProvider } from '@zine/design-system';

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="zine-theme">
      {/* Your app content */}
    </ThemeProvider>
  );
}
```

### 2. Import and use components

```tsx
import { Button, Card, Input, Badge } from '@zine/design-system';

function MyComponent() {
  return (
    <Card>
      <Card.Header>
        <Card.Title>Welcome to Zine</Card.Title>
        <Badge variant="success">New</Badge>
      </Card.Header>
      <Card.Content>
        <Input placeholder="Enter your email" />
        <Button variant="primary">Subscribe</Button>
      </Card.Content>
    </Card>
  );
}
```

## 🏗️ Architecture

```
packages/design-system/
├── src/
│   ├── tokens/              # Design tokens (colors, typography, spacing)
│   ├── lib/                 # Utilities (platform detection, cn, variants)
│   ├── providers/           # Theme provider and context
│   ├── components/
│   │   ├── primitives/      # Core components with .web.tsx and .native.tsx
│   │   ├── patterns/        # Complex components (BookmarkCard, etc.)
│   │   └── ui/             # shadcn/ui components (web-only currently)
│   └── index.ts            # Main exports
```

### Platform-Specific Implementation

Components use platform extensions for optimal performance:

- `Component.web.tsx` - Web implementation using React DOM
- `Component.native.tsx` - React Native implementation
- `Component.tsx` - Shared logic and platform detection
- `index.tsx` - Component exports

## 📱 Platform Detection

The design system automatically detects and adapts to the platform:

```tsx
import { getPlatform, platformSelect, isWeb, isNative } from '@zine/design-system';

// Get current platform
const platform = getPlatform(); // 'web' | 'ios' | 'android'

// Conditional logic
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

## 🎨 Component Library

### Core Components

#### Button
Versatile button with multiple variants and sizes:

```tsx
// Variants
<Button variant="default">Default</Button>
<Button variant="primary">Primary</Button>
<Button variant="destructive">Delete</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="link">Link</Button>

// Sizes
<Button size="sm">Small</Button>
<Button size="md">Medium</Button>
<Button size="lg">Large</Button>

// States
<Button disabled>Disabled</Button>
<Button loading>Loading...</Button>

// Platform-aware onPress
<Button onPress={() => console.log('Works on both platforms!')}>
  Click me
</Button>
```

#### Card
Container for grouped content:

```tsx
<Card>
  <Card.Header>
    <Card.Title>Card Title</Card.Title>
    <Card.Description>Optional description</Card.Description>
  </Card.Header>
  <Card.Content>
    {/* Your content */}
  </Card.Content>
  <Card.Footer>
    <Button>Action</Button>
  </Card.Footer>
</Card>
```

#### Input
Text input with validation:

```tsx
<Input 
  placeholder="Enter email"
  type="email"
  error="Invalid email"
  disabled={false}
  onChangeText={(text) => console.log(text)} // Works on both platforms
/>
```

#### Badge
Status and category indicators:

```tsx
<Badge variant="default">Default</Badge>
<Badge variant="secondary">Secondary</Badge>
<Badge variant="success">Success</Badge>
<Badge variant="warning">Warning</Badge>
<Badge variant="destructive">Error</Badge>
<Badge variant="outline">Outline</Badge>
```

#### Text
Platform-aware typography:

```tsx
<Text variant="h1">Heading 1</Text>
<Text variant="h2">Heading 2</Text>
<Text variant="h3">Heading 3</Text>
<Text variant="body">Body text</Text>
<Text variant="caption">Caption</Text>
<Text variant="label">Label</Text>

// With styles
<Text variant="body" weight="bold" align="center">
  Centered bold text
</Text>
```

### Layout Components

#### Stack
Vertical layout with spacing:

```tsx
<Stack spacing="md" align="center">
  <Text>Item 1</Text>
  <Text>Item 2</Text>
  <Text>Item 3</Text>
</Stack>
```

#### Box
Container with padding and styling:

```tsx
<Box padding="lg" background="surface">
  <Text>Content with padding</Text>
</Box>
```

### Form Components

#### Checkbox
```tsx
<Checkbox 
  checked={checked}
  onCheckedChange={setChecked}
  label="Accept terms"
/>
```

#### Switch
```tsx
<Switch 
  checked={enabled}
  onCheckedChange={setEnabled}
  label="Enable notifications"
/>
```

### Feedback Components

#### Skeleton
Loading placeholders:

```tsx
<Skeleton className="w-full h-12" />
<Skeleton variant="text" lines={3} />
<Skeleton variant="avatar" />
<Skeleton variant="card" />
```

#### Spinner
Loading indicators:

```tsx
<Spinner size="sm" />
<Spinner size="md" color="primary" />
<Spinner size="lg" />
```

### Pattern Components

#### BookmarkCard
Display bookmarks with platform info:

```tsx
<BookmarkCard
  title="Article Title"
  description="Brief description"
  url="https://example.com"
  favicon="https://example.com/icon.png"
  platform="web"
  savedAt={new Date()}
  onPress={() => console.log('Open bookmark')}
/>
```

## 🌙 Theme System

### Using the Theme

```tsx
import { useTheme } from '@zine/design-system';

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  
  return (
    <Button onPress={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
      Toggle to {theme === 'dark' ? 'Light' : 'Dark'} Mode
    </Button>
  );
}
```

### Theme Configuration

```tsx
<ThemeProvider 
  defaultTheme="system" // 'light' | 'dark' | 'system'
  storageKey="zine-theme" // localStorage key for persistence
  enableSystem={true} // Use system preference
>
  <App />
</ThemeProvider>
```

### Design Tokens

Access consistent design values:

```tsx
import { tokens } from '@zine/design-system';

// Colors
const primary = tokens.colors.brand.primary[500];
const background = tokens.colors.background;
const surface = tokens.colors.surface;

// Typography
const fontSize = tokens.typography.fontSize.lg;
const fontFamily = tokens.typography.fontFamily.sans;

// Spacing
const padding = tokens.spacing[4]; // 16px
const margin = tokens.spacing[8]; // 32px

// Breakpoints (web only)
const mobile = tokens.breakpoints.sm; // 640px
const tablet = tokens.breakpoints.md; // 768px
```

## 🛠️ Utilities

### cn() - Class name utility
Merge conditional classes (web):

```tsx
import { cn } from '@zine/design-system';

<div className={cn(
  'base-class',
  isActive && 'active-class',
  { 'conditional-class': condition },
  className // Merge with props
)} />
```

### Platform Utilities

```tsx
import { 
  getPlatform, 
  isWeb, 
  isNative, 
  isIOS, 
  isAndroid,
  platformSelect 
} from '@zine/design-system';

// Conditional rendering
{isWeb() && <WebOnlyComponent />}
{isNative() && <MobileOnlyComponent />}

// Platform-specific styles
const containerStyle = platformSelect({
  web: { boxShadow: '0 2px 4px rgba(0,0,0,0.1)' },
  ios: { shadowOffset: { width: 0, height: 2 } },
  android: { elevation: 4 }
});
```

## 📝 TypeScript Support

Full TypeScript support with exported types:

```tsx
import type { 
  ButtonProps, 
  CardProps, 
  TextProps,
  Theme 
} from '@zine/design-system';

// Extend component props
interface CustomButtonProps extends ButtonProps {
  icon?: React.ReactNode;
}

// Use theme types
const applyTheme = (theme: Theme) => {
  // Type-safe theme usage
};
```

## 🎯 Best Practices

### 1. Use Semantic Variants
Choose variants that communicate intent:
- `primary` - Main CTAs
- `destructive` - Dangerous actions
- `ghost` - Subtle interactions
- `outline` - Secondary actions

### 2. Leverage Platform Awareness
Let components handle platform differences:

```tsx
// ✅ Good - Component handles platform
<Button onPress={handlePress}>Click me</Button>

// ❌ Avoid - Manual platform checks
{isWeb() ? <button onClick={handle}> : <TouchableOpacity onPress={handle}>}
```

### 3. Use Design Tokens
Maintain consistency with tokens:

```tsx
// ✅ Good - Using tokens
<Stack spacing="md">
  <Text variant="h2">Title</Text>
</Stack>

// ❌ Avoid - Hardcoded values
<div style={{ gap: 16 }}>
  <h2>Title</h2>
</div>
```

### 4. Theme-Aware Colors
Use theme-aware color values:

```tsx
// ✅ Good - Theme-aware
<Box background="surface" borderColor="border">

// ❌ Avoid - Hardcoded colors
<div style={{ background: '#fff', border: '1px solid #ccc' }}>
```

## 🚀 Migration Guide

For detailed migration instructions from the old package structure, see [MIGRATION.md](./MIGRATION.md).

### Quick Migration

```tsx
// Old imports
import { Button } from '@zine/ui';
import { colors } from '@zine/design-tokens';
import { BookmarkCard } from 'apps/web/src/components';

// New unified import
import { 
  Button, 
  BookmarkCard, 
  tokens 
} from '@zine/design-system';

// Access colors through tokens
const primaryColor = tokens.colors.brand.primary[500];
```

## 🧪 Testing

```bash
# Run tests
bun test

# Run tests in watch mode
bun test --watch

# Type checking
bun run type-check
```

## 📚 Storybook

View and test components in isolation:

```bash
# Start Storybook (web components)
bun run storybook

# Build Storybook
bun run build-storybook
```

## 🔧 Development

### Setup
```bash
# Install dependencies
bun install

# Build the package
bun run build

# Watch mode
bun run dev
```

### Adding Components

1. Create component files:
   ```
   src/components/primitives/MyComponent/
   ├── index.tsx
   ├── MyComponent.tsx
   ├── MyComponent.web.tsx
   └── MyComponent.native.tsx
   ```

2. Export from index:
   ```tsx
   // src/index.ts
   export { MyComponent } from './components/primitives/MyComponent';
   export type { MyComponentProps } from './components/primitives/MyComponent';
   ```

3. Add tests and stories

### Contributing Guidelines

1. **Platform Parity** - Ensure components work on both web and mobile
2. **Type Safety** - Add proper TypeScript types and exports
3. **Theme Support** - Respect light/dark mode
4. **Documentation** - Update README and add Storybook stories
5. **Testing** - Add unit tests for new components
6. **Accessibility** - Include ARIA attributes and keyboard support

## 📖 Resources

- [Component Documentation](./docs/components.md)
- [Migration Guide](./MIGRATION.md)
- [Design Principles](./docs/design-principles.md)
- [Contributing Guide](./CONTRIBUTING.md)

## 📄 License

MIT