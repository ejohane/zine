# Zine Design System Architecture

> **Note**: This document outlines the design principles. For the current HeroUI implementation details, see [hero-ui.md](./hero-ui.md).

## Core Principles

### Design Philosophy
- **Content-First**: Optimize for readability and content consumption
- **Progressive Disclosure**: Show essential information first, details on demand
- **Responsive by Default**: Mobile-first approach that scales beautifully
- **Accessible**: WCAG 2.1 AA compliance minimum
- **Performance-Oriented**: Lightweight components with optimal bundle sizes

## Package Structure

```
packages/design-system/
├── src/
│   ├── tokens/              # Design tokens
│   │   ├── colors.ts
│   │   ├── typography.ts
│   │   ├── spacing.ts
│   │   ├── breakpoints.ts
│   │   ├── shadows.ts
│   │   ├── borders.ts
│   │   └── index.ts
│   ├── foundations/         # Base styles and utilities
│   │   ├── reset.css
│   │   ├── global.css
│   │   └── utilities.ts
│   ├── components/          # UI components
│   │   ├── primitives/     # Base components
│   │   │   ├── Box/
│   │   │   ├── Text/
│   │   │   ├── Button/
│   │   │   ├── Input/
│   │   │   └── Icon/
│   │   ├── layout/         # Layout components
│   │   │   ├── Container/
│   │   │   ├── Grid/
│   │   │   ├── Stack/
│   │   │   └── Flex/
│   │   ├── feedback/       # User feedback
│   │   │   ├── Toast/
│   │   │   ├── Skeleton/
│   │   │   ├── Spinner/
│   │   │   └── Progress/
│   │   ├── navigation/     # Navigation components
│   │   │   ├── Navbar/
│   │   │   ├── Sidebar/
│   │   │   ├── Tabs/
│   │   │   └── Breadcrumb/
│   │   └── content/        # Content display
│   │       ├── Card/
│   │       ├── Badge/
│   │       ├── Avatar/
│   │       └── MediaObject/
│   ├── patterns/           # Complex UI patterns
│   │   ├── BookmarkCard/
│   │   ├── SubscriptionItem/
│   │   ├── SearchBar/
│   │   └── FilterPanel/
│   ├── themes/             # Theme configurations
│   │   ├── default.ts
│   │   ├── dark.ts
│   │   └── types.ts
│   ├── hooks/              # Design system hooks
│   │   ├── useTheme.ts
│   │   ├── useMediaQuery.ts
│   │   ├── useColorMode.ts
│   │   └── useResponsive.ts
│   └── utils/              # Utility functions
│       ├── responsive.ts
│       ├── colors.ts
│       └── platform.ts
├── .storybook/             # Storybook configuration
├── package.json
└── tsconfig.json
```

## Design Tokens

### Color System

```typescript
// packages/design-system/src/tokens/colors.ts
export const colors = {
  // Semantic colors
  primary: {
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
    800: '#1e40af',
    900: '#1e3a8a',
  },
  
  neutral: {
    50: '#fafafa',
    100: '#f5f5f5',
    200: '#e5e5e5',
    300: '#d4d4d4',
    400: '#a3a3a3',
    500: '#737373',
    600: '#525252',
    700: '#404040',
    800: '#262626',
    900: '#171717',
  },
  
  // Functional colors
  success: { /* green scale */ },
  warning: { /* yellow scale */ },
  error: { /* red scale */ },
  info: { /* blue scale */ },
  
  // Platform-specific colors (Spotify, YouTube, etc.)
  platforms: {
    spotify: '#1DB954',
    youtube: '#FF0000',
    apple: '#FC3C44',
    google: '#4285F4',
  }
};
```

### Typography System

```typescript
// packages/design-system/src/tokens/typography.ts
export const typography = {
  fonts: {
    sans: 'Inter, system-ui, -apple-system, sans-serif',
    mono: 'JetBrains Mono, monospace',
    display: 'Cal Sans, Inter, sans-serif',
  },
  
  sizes: {
    xs: '0.75rem',    // 12px
    sm: '0.875rem',   // 14px
    base: '1rem',     // 16px
    lg: '1.125rem',   // 18px
    xl: '1.25rem',    // 20px
    '2xl': '1.5rem',  // 24px
    '3xl': '1.875rem', // 30px
    '4xl': '2.25rem', // 36px
    '5xl': '3rem',    // 48px
  },
  
  weights: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  
  lineHeights: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
  },
};
```

### Spacing System

```typescript
// packages/design-system/src/tokens/spacing.ts
export const spacing = {
  0: '0',
  px: '1px',
  0.5: '0.125rem',  // 2px
  1: '0.25rem',     // 4px
  2: '0.5rem',      // 8px
  3: '0.75rem',     // 12px
  4: '1rem',        // 16px
  5: '1.25rem',     // 20px
  6: '1.5rem',      // 24px
  8: '2rem',        // 32px
  10: '2.5rem',     // 40px
  12: '3rem',       // 48px
  16: '4rem',       // 64px
  20: '5rem',       // 80px
  24: '6rem',       // 96px
};
```

### Breakpoints

```typescript
// packages/design-system/src/tokens/breakpoints.ts
export const breakpoints = {
  // Mobile-first breakpoints
  sm: '640px',   // Small tablets
  md: '768px',   // Tablets
  lg: '1024px',  // Desktop
  xl: '1280px',  // Large desktop
  '2xl': '1536px', // Extra large screens
};

export const devices = {
  mobile: `(max-width: ${breakpoints.sm})`,
  tablet: `(min-width: ${breakpoints.sm}) and (max-width: ${breakpoints.lg})`,
  desktop: `(min-width: ${breakpoints.lg})`,
};
```

## Component Architecture

### Base Component Structure

```typescript
// Example: Button component
// packages/design-system/src/components/primitives/Button/Button.tsx

import { forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/utils/cn';

const buttonVariants = cva(
  // Base styles
  'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary-600 text-white hover:bg-primary-700',
        secondary: 'bg-neutral-200 text-neutral-900 hover:bg-neutral-300',
        outline: 'border border-neutral-300 bg-transparent hover:bg-neutral-100',
        ghost: 'hover:bg-neutral-100',
        danger: 'bg-error-600 text-white hover:bg-error-700',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4',
        lg: 'h-12 px-6 text-lg',
        icon: 'h-10 w-10',
      },
      fullWidth: {
        true: 'w-full',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, fullWidth, loading, leftIcon, rightIcon, children, disabled, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, fullWidth, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <Spinner className="mr-2" />
        ) : leftIcon ? (
          <span className="mr-2">{leftIcon}</span>
        ) : null}
        {children}
        {rightIcon && <span className="ml-2">{rightIcon}</span>}
      </button>
    );
  }
);
```

## Platform-Specific Adaptations

### Web Implementation
```typescript
// Use Tailwind CSS classes directly
// Leverage Radix UI for complex interactions
// CSS-in-JS for dynamic styles
```

### Mobile Implementation (React Native)
```typescript
// packages/design-system/src/components/primitives/Button/Button.native.tsx
import { Pressable, Text, ActivityIndicator } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

export const Button = ({ variant, size, loading, children, ...props }) => {
  const theme = useTheme();
  const styles = getButtonStyles(theme, variant, size);
  
  return (
    <Pressable style={styles.container} {...props}>
      {loading ? (
        <ActivityIndicator color={styles.text.color} />
      ) : (
        <Text style={styles.text}>{children}</Text>
      )}
    </Pressable>
  );
};
```

### Desktop Implementation (Electron/Tauri)
```typescript
// Reuse web components with desktop-specific enhancements
// Add native menu integration
// Support for keyboard shortcuts
// Window management utilities
```

## Theme System

```typescript
// packages/design-system/src/themes/types.ts
export interface Theme {
  name: string;
  colors: {
    background: string;
    foreground: string;
    primary: string;
    secondary: string;
    muted: string;
    accent: string;
    destructive: string;
    border: string;
    input: string;
    ring: string;
  };
  radius: string;
  spacing: typeof spacing;
  typography: typeof typography;
}

// packages/design-system/src/themes/default.ts
export const defaultTheme: Theme = {
  name: 'default',
  colors: {
    background: 'hsl(0 0% 100%)',
    foreground: 'hsl(222.2 84% 4.9%)',
    primary: 'hsl(221.2 83.2% 53.3%)',
    // ... other colors
  },
  radius: '0.5rem',
  spacing,
  typography,
};
```

## Responsive Design Utilities

```typescript
// packages/design-system/src/hooks/useResponsive.ts
export const useResponsive = () => {
  const isMobile = useMediaQuery(devices.mobile);
  const isTablet = useMediaQuery(devices.tablet);
  const isDesktop = useMediaQuery(devices.desktop);
  
  return {
    isMobile,
    isTablet,
    isDesktop,
    currentBreakpoint: getCurrentBreakpoint(),
  };
};

// Usage in components
const BookmarkCard = ({ bookmark }) => {
  const { isMobile } = useResponsive();
  
  return (
    <Card>
      <Stack spacing={isMobile ? 2 : 4}>
        {/* Responsive layout */}
      </Stack>
    </Card>
  );
};
```

## Integration with Existing Codebase

### 1. Update package.json structure
```json
{
  "name": "@zine/design-system",
  "version": "0.1.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    },
    "./styles": "./dist/styles.css"
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "storybook": "storybook dev -p 6006",
    "build-storybook": "storybook build"
  }
}
```

### 2. Update apps/web to use design system
```typescript
// apps/web/src/main.tsx
import '@zine/design-system/styles';
import { ThemeProvider } from '@zine/design-system';

// apps/web/src/components/BookmarkList.tsx
import { Card, Stack, Badge, Button } from '@zine/design-system';
```

## Documentation Strategy

### Storybook Setup
- Component documentation with live examples
- Design token visualization
- Accessibility testing
- Visual regression testing

### Component Documentation Template
```typescript
// Button.stories.tsx
export default {
  title: 'Primitives/Button',
  component: Button,
  parameters: {
    docs: {
      description: {
        component: 'Base button component with multiple variants and sizes.',
      },
    },
  },
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['primary', 'secondary', 'outline', 'ghost', 'danger'],
    },
    size: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg', 'icon'],
    },
  },
};
```

## Migration Path

### Phase 1: Foundation (Week 1-2)
1. Set up design-system package
2. Define design tokens
3. Create base components (Button, Input, Card)
4. Set up Storybook

### Phase 2: Component Library (Week 3-4)
1. Build out primitive components
2. Create layout components
3. Implement feedback components
4. Add navigation components

### Phase 3: Integration (Week 5-6)
1. Migrate existing web app components
2. Create Zine-specific patterns
3. Implement theme system
4. Add dark mode support

### Phase 4: Platform Expansion (Future)
1. React Native component variants
2. Desktop-specific enhancements
3. Platform-specific optimizations

## Testing Strategy

```typescript
// Component testing with React Testing Library
describe('Button', () => {
  it('renders with correct variant styles', () => {
    render(<Button variant="primary">Click me</Button>);
    // assertions
  });
  
  it('handles loading state', () => {
    render(<Button loading>Loading...</Button>);
    // assertions
  });
});

// Visual regression testing with Chromatic
// Accessibility testing with axe-core
// Cross-platform testing matrix
```

## Performance Considerations

- Tree-shaking support for optimal bundle sizes
- Lazy loading for complex components
- CSS-in-JS runtime optimization
- Platform-specific code splitting
- Icon sprite optimization

## Next Steps

1. **Initialize the design-system package**
   ```bash
   cd packages
   mkdir design-system
   cd design-system
   bun init
   bun add -D tsup storybook @storybook/react vite
   ```

2. **Set up base configuration**
   - TypeScript config
   - Build pipeline with tsup
   - Storybook configuration

3. **Create first components**
   - Start with Button, Input, Card
   - Ensure they work with existing Tailwind setup

4. **Document as you build**
   - Write stories for each component
   - Include usage examples
   - Document props and variants