# React Native V2 Implementation Plan

## Executive Summary

This plan outlines the strategy to unify and optimize the Zine mobile app architecture, leveraging the existing implementation while addressing key improvements needed for production readiness. The current mobile app already uses NativeWind v4 and has a solid foundation, but needs alignment with the design system and architecture improvements.

## Current State Analysis

### What's Already Built
- ✅ **Mobile app exists** at `apps/mobile/zine` using Expo SDK 53
- ✅ **NativeWind v4** already integrated with Tailwind CSS
- ✅ **Unified UI package** (`@zine/ui`) with platform detection
- ✅ **Design tokens package** (`@zine/design-tokens`) shared across platforms
- ✅ **3-tab navigation** (Home, Search, Profile) matching web design
- ✅ **Component library** with both native-specific and unified components
- ✅ **Authentication** with Clerk Expo SDK
- ✅ **Data fetching** with TanStack Query
- ✅ **State management** with MMKV and Secure Store
- ✅ **Web theme support** (Light/Dark/System modes already functional)

### Current Architecture

```
packages/
├── design-system/        # Web-only components (shadcn/ui based)
├── design-tokens/        # Shared tokens (colors, spacing, typography)
├── ui/                   # Unified components with platform detection
│   ├── components/
│   │   ├── Button.tsx   # Platform-aware component
│   │   ├── Card/        # Unified card components
│   │   └── ...
│   └── lib/
│       ├── platform.ts  # Platform detection utilities
│       ├── cn.ts        # className merger (works for both)
│       └── variants.ts  # CVA variants shared

apps/mobile/zine/
├── components/          # Mobile-specific components
│   ├── ui/             # Native overrides when needed
│   └── cards/          # Mobile-specific card implementations

apps/web/
├── src/
│   ├── contexts/       # Web theme context (already implemented)
│   │   └── theme.tsx  # Light/dark/system mode support
│   └── components/    # Web components with theme support
```

## Key Issues to Address

### 1. Component Duplication
- **Problem**: Components exist in both `@zine/ui` and `apps/mobile/zine/components`
- **Example**: Two Button implementations with different variant systems
- **Impact**: Confusion about which to use, maintenance overhead

### 2. Design Token Misalignment
- **Problem**: Mobile components don't consistently use design tokens
- **Example**: Hardcoded colors like `bg-green-600` instead of token references
- **Impact**: Inconsistent theming, difficult to maintain brand consistency

### 3. Package Structure Confusion
- **Problem**: Three separate design-related packages without clear boundaries
- **Impact**: Developers unsure where to add new components

### 4. Theme Support Inconsistency
- **Problem**: Web app has theme support, mobile app doesn't
- **Example**: Web has working light/dark/system modes, mobile is light-only
- **Impact**: Feature parity gap, inconsistent user experience across platforms

## Proposed Solution

### Phase 1: Consolidate and Clarify Architecture (Week 1)

#### 1.1 Unified Design System Structure
Consolidate everything into a single, well-organized design-system package:

```
packages/design-system/
├── src/
│   ├── tokens/                 # Shared design tokens
│   │   ├── colors.ts
│   │   ├── typography.ts
│   │   ├── spacing.ts
│   │   └── index.ts
│   │
│   ├── lib/                    # Shared utilities
│   │   ├── utils.ts           # cn() function for both platforms
│   │   ├── variants.ts        # Shared CVA definitions
│   │   └── platform.ts        # Platform detection
│   │
│   ├── components/
│   │   ├── primitives/        # Base components (shared logic)
│   │   │   ├── Button/
│   │   │   │   ├── Button.types.ts      # Shared types
│   │   │   │   ├── Button.variants.ts   # CVA variants
│   │   │   │   ├── Button.web.tsx       # Web implementation
│   │   │   │   ├── Button.native.tsx    # Native implementation
│   │   │   │   └── index.ts            # Smart export
│   │   │   └── ...
│   │   │
│   │   ├── patterns/          # Business components
│   │   │   ├── BookmarkCard/
│   │   │   ├── MediaCard/
│   │   │   └── QueueItem/
│   │   │
│   │   └── index.ts          # Main exports
│   │
│   └── styles/
│       ├── globals.css       # Web global styles
│       └── theme.ts          # Unified theme config
│
├── tailwind.config.ts        # Base Tailwind config
├── tailwind.native.config.ts # Native-specific extensions
└── package.json             # Smart exports configuration
```

#### 1.2 Smart Component Exports
```typescript
// packages/design-system/src/components/primitives/Button/index.ts
import { isReactNative } from '../../lib/platform';

// Dynamic import based on platform
export const Button = isReactNative() 
  ? require('./Button.native').Button 
  : require('./Button.web').Button;

// Export shared types and variants
export type { ButtonProps } from './Button.types';
export { buttonVariants } from './Button.variants';
```

#### 1.3 Package.json Export Strategy
```json
{
  "name": "@zine/design-system",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "react-native": "./dist/index.native.js",
      "default": "./dist/index.js"
    },
    "./tokens": "./dist/tokens/index.js",
    "./utils": "./dist/lib/utils.js"
  }
}
```

### Phase 2: Component Migration (Week 1-2)

#### 2.1 Migrate Existing Components
1. **Identify duplicates** between `@zine/ui` and `apps/mobile/zine/components`
2. **Merge best implementations** into unified design-system
3. **Ensure variant consistency** using shared CVA definitions
4. **Test on both platforms** during migration

#### 2.2 Component Priority List
```typescript
// High Priority (Core UI)
- Button (merge 3 implementations)
- Card (unify styling approach)
- Input (consolidate validation)
- Badge (align with design tokens)
- Text/Typography (standardize scales)

// Medium Priority (Patterns)
- BookmarkCard (share business logic)
- MediaCard (new, for Recent section)
- QueueItem (new, for Queue display)
- ActionCard (new, for home actions)

// Low Priority (Can remain platform-specific)
- Navigation components
- Platform-specific animations
```

#### 2.3 Variant Standardization
```typescript
// packages/design-system/src/lib/variants.ts
export const buttonVariants = cva(
  // Base classes (platform-aware)
  'inline-flex items-center justify-center rounded-md font-medium transition-colors',
  {
    variants: {
      variant: {
        primary: 'bg-primary-500 text-white',
        secondary: 'bg-neutral-200 text-neutral-900',
        ghost: 'hover:bg-neutral-100',
        outline: 'border border-neutral-300 bg-transparent',
        danger: 'bg-error-500 text-white',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4',
        lg: 'h-12 px-6 text-lg',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);
```

### Phase 3: Design Token Integration & Theme Support (Week 2)

#### 3.1 Theme Mode Support (Light/Dark/System)
Building on the existing web implementation, add unified theme support across platforms:

```typescript
// packages/design-system/src/lib/theme.ts
import { useColorScheme } from 'react-native'; // For mobile
import { useTheme as useWebTheme } from '../contexts/theme'; // For web

export type ThemeMode = 'light' | 'dark' | 'system';

// Unified theme hook
export function useTheme() {
  if (Platform.OS === 'web') {
    return useWebTheme();
  }
  
  // Native implementation
  const colorScheme = useColorScheme();
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  
  const resolvedTheme = themeMode === 'system' ? colorScheme : themeMode;
  
  return {
    theme: resolvedTheme,
    setTheme: setThemeMode,
    systemTheme: colorScheme,
  };
}
```

#### 3.2 Theme Provider Implementation
```typescript
// packages/design-system/src/providers/ThemeProvider.tsx
import React, { createContext, useEffect, useState } from 'react';
import { Appearance, ColorSchemeName } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ThemeContextType {
  theme: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: ThemeMode) => void;
  systemTheme: ColorSchemeName;
}

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState<ThemeMode>('system');
  const systemTheme = useColorScheme();
  
  useEffect(() => {
    // Load saved preference
    AsyncStorage.getItem('theme-mode').then((saved) => {
      if (saved) setTheme(saved as ThemeMode);
    });
  }, []);
  
  const resolvedTheme = theme === 'system' 
    ? (systemTheme || 'light') 
    : theme;
  
  const updateTheme = (newTheme: ThemeMode) => {
    setTheme(newTheme);
    AsyncStorage.setItem('theme-mode', newTheme);
    
    // Update NativeWind
    if (Platform.OS !== 'web') {
      const resolved = newTheme === 'system' 
        ? systemTheme 
        : newTheme;
      Appearance.setColorScheme(resolved);
    }
  };
  
  return (
    <ThemeContext.Provider value={{
      theme,
      resolvedTheme,
      setTheme: updateTheme,
      systemTheme,
    }}>
      <View className={resolvedTheme}>
        {children}
      </View>
    </ThemeContext.Provider>
  );
};
```

#### 3.3 Token Usage Enforcement
```typescript
// Before (hardcoded)
<Button className="bg-green-600" />

// After (theme-aware token-based)
<Button className="bg-platforms-spotify dark:bg-platforms-spotify-dark" />
```

#### 3.4 Tailwind Config Alignment with Theme Support
```javascript
// packages/design-system/tailwind.base.config.ts
import { colors, spacing, typography } from './src/tokens';

export const baseConfig = {
  darkMode: 'class', // Enable class-based dark mode
  theme: {
    extend: {
      colors: {
        ...colors,
        // Platform colors as first-class citizens
        platforms: colors.platforms,
        // Theme-aware semantic colors
        background: {
          DEFAULT: 'hsl(var(--background))',
          secondary: 'hsl(var(--background-secondary))',
        },
        foreground: {
          DEFAULT: 'hsl(var(--foreground))',
          muted: 'hsl(var(--foreground-muted))',
        },
      },
      spacing,
      fontSize: typography.sizes,
    },
  },
};

// For mobile (tailwind.native.config.ts)
module.exports = {
  ...baseConfig,
  presets: [require('nativewind/preset')],
  darkMode: 'class', // NativeWind v4 supports class-based dark mode
};
```

#### 3.5 CSS Variable Mapping for Themes
```css
/* Web: globals.css */
:root {
  --background: 0 0% 100%;
  --foreground: 0 0% 3.9%;
  --color-primary: theme('colors.primary.500');
  --color-platforms-spotify: #1DB954;
  --color-platforms-youtube: #FF0000;
}

.dark {
  --background: 0 0% 3.9%;
  --foreground: 0 0% 98%;
  --color-platforms-spotify: #1ed760;
  --color-platforms-youtube: #ff3333;
}

/* Native: Use NativeWind's theming */
```

#### 3.6 Theme-Aware Component Example
```typescript
// packages/design-system/src/components/primitives/Card/Card.native.tsx
export const Card = ({ className, ...props }) => {
  return (
    <View
      className={cn(
        'rounded-lg border bg-background p-4',
        'border-neutral-200 dark:border-neutral-800',
        'bg-white dark:bg-neutral-900',
        className
      )}
      {...props}
    />
  );
};
```

#### 3.7 Settings Screen Theme Switcher
```typescript
// Mobile implementation matching web
import { useTheme } from '@zine/design-system';
import { SegmentedControl } from '@react-native-segmented-control/segmented-control';

export function ThemeSettings() {
  const { theme, setTheme } = useTheme();
  
  return (
    <View className="p-4">
      <Text className="mb-2 text-foreground">Theme</Text>
      <SegmentedControl
        values={['Light', 'Dark', 'System']}
        selectedIndex={['light', 'dark', 'system'].indexOf(theme)}
        onChange={(event) => {
          const themes: ThemeMode[] = ['light', 'dark', 'system'];
          setTheme(themes[event.nativeEvent.selectedSegmentIndex]);
        }}
        appearance={theme === 'dark' ? 'dark' : 'light'}
      />
    </View>
  );
}
```

### Phase 4: Mobile App Optimization (Week 2-3)

#### 4.1 Performance Improvements
- **Remove duplicate packages**: Consolidate ui, design-tokens into design-system
- **Optimize bundle**: Tree-shake unused components
- **Lazy load screens**: Implement code splitting with Expo Router
- **Image optimization**: Use expo-image with caching

#### 4.2 Native-Specific Enhancements
```typescript
// Platform-specific optimizations
import { Platform } from 'react-native';

export const MediaCard = ({ onPress, ...props }) => {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        Platform.select({
          ios: pressed && { transform: [{ scale: 0.98 }] },
          android: pressed && { elevation: 2 },
        }),
      ]}
    >
      {/* Content */}
    </Pressable>
  );
};
```

#### 4.3 Gesture Support
```typescript
// Add native gestures where appropriate
import { GestureDetector, Gesture } from 'react-native-gesture-handler';

const swipeGesture = Gesture.Pan()
  .onEnd((e) => {
    if (e.translationX < -50) {
      // Handle swipe to delete
    }
  });
```

### Phase 5: Testing & Documentation (Week 3)

#### 5.1 Component Testing Strategy
```typescript
// Test both implementations
describe('Button Component', () => {
  it('renders correctly on web', () => {
    // Web-specific tests
  });
  
  it('renders correctly on native', () => {
    // Native-specific tests
  });
  
  it('maintains variant consistency', () => {
    // Test that variants produce expected styles
  });
});
```

#### 5.2 Storybook Setup
- Configure Storybook for both web and React Native
- Document all component variants
- Show platform differences clearly

#### 5.3 Developer Documentation
```markdown
# Component Development Guide

## Adding a New Component
1. Create in packages/design-system/src/components/
2. Implement .web.tsx and .native.tsx versions
3. Share types and variants
4. Export smartly based on platform
5. Document in Storybook

## Using Components
```tsx
// Works on both platforms automatically
import { Button, Card } from '@zine/design-system';

<Button variant="primary" size="lg">
  Click me
</Button>
```
```

## Implementation Timeline

### Week 1: Foundation
- [ ] Day 1-2: Restructure packages, create new design-system structure
- [ ] Day 3-4: Migrate Button, Card, Input components
- [ ] Day 5: Set up smart exports and platform detection

### Week 2: Migration & Integration  
- [ ] Day 1-2: Migrate remaining UI components
- [ ] Day 3-4: Update mobile app to use unified components
- [ ] Day 5: Fix design token usage throughout

### Week 3: Polish & Optimization
- [ ] Day 1-2: Performance optimization, bundle analysis
- [ ] Day 3-4: Add native gestures and animations
- [ ] Day 5: Testing and documentation

## Success Metrics

### Technical Metrics
- [ ] **Bundle size reduction**: > 20% smaller mobile app
- [ ] **Component reuse**: > 80% code sharing between platforms
- [ ] **Build time**: < 2 minutes for both platforms
- [ ] **Type safety**: 100% TypeScript coverage

### Developer Experience
- [ ] **Setup time**: New developer productive in < 30 minutes
- [ ] **Component discovery**: All components documented in Storybook
- [ ] **Consistency**: Single source of truth for all components

### User Experience
- [ ] **Visual parity**: 95% design consistency between platforms
- [ ] **Performance**: 60 FPS animations on all devices
- [ ] **Accessibility**: WCAG AA compliance on both platforms
- [ ] **Theme consistency**: Unified light/dark/system mode support
- [ ] **Theme persistence**: User preference saved across sessions

## Migration Checklist

### Phase 1 Checklist
- [x] Create new package structure
- [x] Set up build configuration
- [x] Configure exports for platform detection
- [x] Move tokens to unified location
- [x] Set up Tailwind configs

### Phase 2 Checklist  
- [x] Migrate Button component
- [x] Migrate Card component
- [x] Migrate Input component
- [x] Migrate Badge component
- [x] Migrate Typography components
- [x] Create MediaCard for Recent section
- [x] Create QueueItem for Queue section
- [x] Create ActionCard for home actions

### Phase 3 Checklist
- [x] Replace hardcoded colors with tokens
- [x] Align spacing with token system
- [x] Update typography scales
- [x] Add platform color tokens
- [x] Implement theme provider for mobile
- [x] Add theme mode persistence with AsyncStorage
- [x] Create unified useTheme hook
- [x] Update all components with dark: modifiers
- [x] Test theme switching on both platforms
- [x] Add theme switcher to settings screen
- [x] Ensure NativeWind dark mode integration
- [x] Test system theme detection on iOS/Android

### Phase 4 Checklist
- [x] Remove duplicate packages
- [x] Optimize bundle size
- [x] Add gesture handlers
- [x] Implement haptic feedback
- [x] Add native animations

### Phase 5 Checklist
- [x] Set up component tests
- [x] Configure Storybook
- [x] Write developer guide
- [x] Create migration guide
- [x] Document best practices

## Implementation Status

### ✅ All Phases Complete!

The React Native V2 implementation has been successfully completed:

- **Phase 1**: ✅ Unified design-system package structure created
- **Phase 2**: ✅ All components migrated to platform-aware implementations
- **Phase 3**: ✅ Unified theme support with dark mode implemented
- **Phase 4**: ✅ Mobile app optimized and cleaned up
- **Phase 5**: ✅ Documentation and migration guides created

### Key Achievements:
- Created a single unified `@zine/design-system` package that works on both web and mobile
- Implemented platform detection with automatic component selection
- Full dark/light/system theme support on both platforms
- Comprehensive documentation and migration guides
- All components use design tokens consistently
- TypeScript support throughout

### Ready for Production:
The unified design system is now ready for use across both web and mobile platforms with consistent theming, components, and developer experience.

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing app | High | Incremental migration, extensive testing |
| Developer confusion | Medium | Clear documentation, migration guide |
| Performance regression | Medium | Continuous benchmarking, profiling |
| Inconsistent styling | Low | Shared variants, automated testing |

## Code Examples

### Unified Component Example
```typescript
// packages/design-system/src/components/primitives/Button/Button.native.tsx
import React from 'react';
import { Pressable, Text, View, ActivityIndicator } from 'react-native';
import { cn } from '../../../lib/utils';
import { buttonVariants } from './Button.variants';
import type { ButtonProps } from './Button.types';

export const Button = React.forwardRef<View, ButtonProps>(
  ({ variant, size, loading, children, onPress, className, ...props }, ref) => {
    const classes = cn(buttonVariants({ variant, size }), className);
    
    return (
      <Pressable
        ref={ref}
        className={classes}
        onPress={onPress}
        disabled={loading || props.disabled}
        style={({ pressed }) => [
          { opacity: pressed ? 0.8 : 1 }
        ]}
      >
        <View className="flex-row items-center justify-center">
          {loading && <ActivityIndicator className="mr-2" />}
          {children && (
            <Text className={cn(
              'font-medium',
              variant === 'primary' && 'text-white',
              variant === 'ghost' && 'text-neutral-900'
            )}>
              {children}
            </Text>
          )}
        </View>
      </Pressable>
    );
  }
);
```

### Smart Import Example
```typescript
// packages/design-system/src/components/index.ts
import { Platform } from 'react-native';

// This works because Metro bundler handles platform extensions
export { Button } from './primitives/Button';
export { Card } from './primitives/Card';

// Or use conditional exports in package.json
{
  "exports": {
    "./Button": {
      "types": "./dist/components/Button/types.d.ts",
      "react-native": "./dist/components/Button/Button.native.js",
      "default": "./dist/components/Button/Button.web.js"
    }
  }
}
```

### Token Usage Example
```typescript
// Using design tokens consistently
import { colors, spacing } from '@zine/design-system/tokens';

// In Tailwind classes (NativeWind understands these)
<View className="bg-primary-500 p-4" />

// In inline styles when needed
<View style={{ 
  backgroundColor: colors.platforms.spotify,
  padding: spacing[4] 
}} />
```

## Conclusion

This plan provides a clear path to unify the design system while maintaining the flexibility needed for platform-specific optimizations. The key is to:

1. **Consolidate** scattered components into a single source of truth
2. **Standardize** on shared variants and tokens
3. **Optimize** for each platform's strengths
4. **Document** thoroughly for developer success

By following this plan, Zine will have a maintainable, performant, and consistent design system across all platforms.