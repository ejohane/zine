# Zine Design System Implementation Guide

> **Note**: This document reflects the current HeroUI-based implementation. For the latest implementation details, see [hero-ui.md](./hero-ui.md).

## Overview

This guide outlines the implementation of a cross-platform design system for the Zine application using HeroUI for web and HeroUI Native for mobile, with shared abstractions for maximum code reuse.

## Architecture Decision

**Approach**: Unified Cross-Platform (HeroUI + HeroUI Native)
- **Primitives**: Use HeroUI components for web and HeroUI Native for mobile
- **Patterns**: Build Zine-specific components using HeroUI primitives
- **Platform Support**: True cross-platform with shared component interfaces

## Project Structure

```
zine/
├── apps/
│   ├── web/           # Vite SPA with HeroUI
│   ├── mobile/        # React Native app with HeroUI Native
│   └── desktop/       # Future Electron/Tauri app
├── packages/
│   ├── api/           # Cloudflare Workers API
│   ├── shared/        # Shared types & services
│   └── design-system/ # Unified design system package
│       ├── src/
│       │   ├── core/             # Shared abstractions
│       │   │   ├── tokens/       # Design tokens
│       │   │   ├── types/        # Shared TypeScript types
│       │   │   └── utils/        # Shared utilities
│       │   ├── web/              # Web-specific exports
│       │   │   ├── components/   # HeroUI React wrappers
│       │   │   ├── patterns/     # Zine-specific web components
│       │   │   └── providers/    # Web providers
│       │   ├── native/           # Mobile-specific exports
│       │   │   ├── components/   # HeroUI Native wrappers
│       │   │   ├── patterns/     # Zine-specific native components
│       │   │   └── providers/    # Native providers
│       │   └── lib/              # Shared utilities
│       ├── .storybook/           # Storybook config
│       ├── tailwind.config.shared.js # Shared Tailwind config
│       ├── package.json
│       └── tsconfig.json
```

## Implementation Steps

### Phase 1: Setup (Day 1-2)

#### 1. Create Design System Package

```bash
# Create package directory
cd packages
mkdir design-system
cd design-system

# Initialize package
bun init

# Add dependencies
bun add class-variance-authority clsx tailwind-merge lucide-react
bun add @radix-ui/react-avatar @radix-ui/react-dialog @radix-ui/react-dropdown-menu
bun add @radix-ui/react-label @radix-ui/react-popover @radix-ui/react-select
bun add @radix-ui/react-separator @radix-ui/react-slot @radix-ui/react-switch
bun add @radix-ui/react-tabs @radix-ui/react-toast @radix-ui/react-tooltip

# Add dev dependencies
bun add -D tailwindcss postcss autoprefixer typescript
bun add -D @storybook/react @storybook/react-vite storybook
bun add -D tsup @types/react @types/react-dom
```

#### 2. Configure Package.json

```json
{
  "name": "@zine/design-system",
  "version": "0.1.0",
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "files": ["dist", "src"],
  "scripts": {
    "dev": "tsup --watch",
    "build": "tsup",
    "lint": "eslint src/",
    "type-check": "tsc --noEmit",
    "storybook": "storybook dev -p 6006",
    "build-storybook": "storybook build",
    "add-component": "npx shadcn-ui@latest add"
  },
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./styles": "./dist/styles.css",
    "./tokens": "./dist/tokens/index.mjs"
  },
  "peerDependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  }
}
```

#### 3. Create tsup Configuration

```typescript
// tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/tokens/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom'],
});
```

#### 4. Setup Tailwind Configuration

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss';
import { tokens } from './src/tokens';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/**/*.{ts,tsx}',
    './stories/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          ...tokens.colors.primary,
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        platforms: tokens.colors.platforms,
      },
      spacing: tokens.spacing,
      fontFamily: tokens.typography.fonts,
      fontSize: tokens.typography.sizes,
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
```

#### 5. Initialize shadcn/ui

```bash
# Initialize shadcn with custom config
npx shadcn-ui@latest init

# When prompted:
# - Would you like to use TypeScript? → Yes
# - Which style would you like to use? → Default
# - Which color would you like to use as base color? → Slate
# - Where is your global CSS file? → src/styles/globals.css
# - Would you like to use CSS variables for colors? → Yes
# - Where is your tailwind.config.js located? → tailwind.config.ts
# - Configure the import alias for components? → @/components
# - Configure the import alias for utils? → @/lib/utils
```

### Phase 2: Design Tokens (Day 3)

#### 1. Create Color Tokens

```typescript
// src/tokens/colors.ts
export const colors = {
  // Brand colors
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
    950: '#172554',
  },
  
  // Neutral colors
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
    950: '#0a0a0a',
  },
  
  // Semantic colors
  success: {
    50: '#f0fdf4',
    500: '#22c55e',
    600: '#16a34a',
    700: '#15803d',
  },
  
  warning: {
    50: '#fefce8',
    500: '#eab308',
    600: '#ca8a04',
    700: '#a16207',
  },
  
  error: {
    50: '#fef2f2',
    500: '#ef4444',
    600: '#dc2626',
    700: '#b91c1c',
  },
  
  // Platform colors
  platforms: {
    spotify: '#1DB954',
    youtube: '#FF0000',
    apple: '#FC3C44',
    google: '#4285F4',
    rss: '#FFA500',
    podcast: '#7C3AED',
  },
};
```

#### 2. Create Typography Tokens

```typescript
// src/tokens/typography.ts
export const typography = {
  fonts: {
    sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'].join(', '),
    mono: ['JetBrains Mono', 'Consolas', 'monospace'].join(', '),
    display: ['Cal Sans', 'Inter', 'sans-serif'].join(', '),
  },
  
  sizes: {
    xs: ['0.75rem', { lineHeight: '1rem' }],      // 12px
    sm: ['0.875rem', { lineHeight: '1.25rem' }],  // 14px
    base: ['1rem', { lineHeight: '1.5rem' }],     // 16px
    lg: ['1.125rem', { lineHeight: '1.75rem' }],  // 18px
    xl: ['1.25rem', { lineHeight: '1.75rem' }],   // 20px
    '2xl': ['1.5rem', { lineHeight: '2rem' }],    // 24px
    '3xl': ['1.875rem', { lineHeight: '2.25rem' }],// 30px
    '4xl': ['2.25rem', { lineHeight: '2.5rem' }],  // 36px
    '5xl': ['3rem', { lineHeight: '1' }],          // 48px
    '6xl': ['3.75rem', { lineHeight: '1' }],       // 60px
  },
  
  weights: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
  
  letterSpacing: {
    tighter: '-0.05em',
    tight: '-0.025em',
    normal: '0em',
    wide: '0.025em',
    wider: '0.05em',
  },
};
```

#### 3. Create Spacing & Layout Tokens

```typescript
// src/tokens/spacing.ts
export const spacing = {
  px: '1px',
  0: '0px',
  0.5: '0.125rem',  // 2px
  1: '0.25rem',     // 4px
  1.5: '0.375rem',  // 6px
  2: '0.5rem',      // 8px
  2.5: '0.625rem',  // 10px
  3: '0.75rem',     // 12px
  3.5: '0.875rem',  // 14px
  4: '1rem',        // 16px
  5: '1.25rem',     // 20px
  6: '1.5rem',      // 24px
  7: '1.75rem',     // 28px
  8: '2rem',        // 32px
  9: '2.25rem',     // 36px
  10: '2.5rem',     // 40px
  12: '3rem',       // 48px
  14: '3.5rem',     // 56px
  16: '4rem',       // 64px
  20: '5rem',       // 80px
  24: '6rem',       // 96px
  28: '7rem',       // 112px
  32: '8rem',       // 128px
};

// src/tokens/breakpoints.ts
export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
};

export const devices = {
  mobile: `(max-width: ${breakpoints.sm})`,
  tablet: `(min-width: ${breakpoints.sm}) and (max-width: ${breakpoints.lg})`,
  desktop: `(min-width: ${breakpoints.lg})`,
};

// src/tokens/index.ts
export * from './colors';
export * from './typography';
export * from './spacing';
export * from './breakpoints';
```

### Phase 3: Component Development (Day 4-7)

#### 1. Add shadcn Components

```bash
# Add essential components
npx shadcn-ui@latest add button
npx shadcn-ui@latest add card
npx shadcn-ui@latest add input
npx shadcn-ui@latest add label
npx shadcn-ui@latest add badge
npx shadcn-ui@latest add avatar
npx shadcn-ui@latest add tabs
npx shadcn-ui@latest add dialog
npx shadcn-ui@latest add dropdown-menu
npx shadcn-ui@latest add toast
npx shadcn-ui@latest add skeleton
npx shadcn-ui@latest add separator
```

#### 2. Create Zine-Specific Patterns

```typescript
// src/components/patterns/BookmarkCard/BookmarkCard.tsx
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { BookmarkIcon, ExternalLinkIcon, MoreVerticalIcon } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface BookmarkCardProps {
  title: string;
  description?: string;
  url: string;
  favicon?: string;
  tags?: string[];
  platform?: 'web' | 'spotify' | 'youtube' | 'rss';
  savedAt: Date;
  onEdit?: () => void;
  onDelete?: () => void;
  onOpen?: () => void;
}

export function BookmarkCard({
  title,
  description,
  url,
  favicon,
  tags = [],
  platform = 'web',
  savedAt,
  onEdit,
  onDelete,
  onOpen,
}: BookmarkCardProps) {
  const platformColors = {
    spotify: 'bg-green-500',
    youtube: 'bg-red-500',
    rss: 'bg-orange-500',
    web: 'bg-blue-500',
  };

  return (
    <Card className="group hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              {favicon ? (
                <AvatarImage src={favicon} alt={title} />
              ) : (
                <AvatarFallback className={platformColors[platform]}>
                  <BookmarkIcon className="h-4 w-4 text-white" />
                </AvatarFallback>
              )}
            </Avatar>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold truncate">{title}</h3>
              <p className="text-sm text-muted-foreground truncate">{new URL(url).hostname}</p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreVerticalIcon className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onOpen}>
                <ExternalLinkIcon className="mr-2 h-4 w-4" />
                Open
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} className="text-destructive">
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      
      {description && (
        <CardContent className="pb-3">
          <p className="text-sm text-muted-foreground line-clamp-2">{description}</p>
        </CardContent>
      )}
      
      <CardFooter className="pt-3">
        <div className="flex items-center justify-between w-full">
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
            {tags.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{tags.length - 3}
              </Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {savedAt.toLocaleDateString()}
          </span>
        </div>
      </CardFooter>
    </Card>
  );
}
```

```typescript
// src/components/patterns/SubscriptionItem/SubscriptionItem.tsx
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PlayIcon, CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SubscriptionItemProps {
  title: string;
  author: string;
  thumbnail?: string;
  duration?: string;
  platform: 'spotify' | 'youtube' | 'podcast';
  isPlayed?: boolean;
  isPlaying?: boolean;
  publishedAt: Date;
  onPlay?: () => void;
  onMarkPlayed?: () => void;
}

export function SubscriptionItem({
  title,
  author,
  thumbnail,
  duration,
  platform,
  isPlayed = false,
  isPlaying = false,
  publishedAt,
  onPlay,
  onMarkPlayed,
}: SubscriptionItemProps) {
  const platformConfig = {
    spotify: { color: 'bg-green-500', label: 'Podcast' },
    youtube: { color: 'bg-red-500', label: 'Video' },
    podcast: { color: 'bg-purple-500', label: 'Episode' },
  };

  const config = platformConfig[platform];

  return (
    <div className={cn(
      "flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors",
      isPlayed && "opacity-60"
    )}>
      <div className="relative">
        <Avatar className="h-16 w-16">
          {thumbnail ? (
            <AvatarImage src={thumbnail} alt={title} />
          ) : (
            <AvatarFallback className={config.color}>
              <PlayIcon className="h-6 w-6 text-white" />
            </AvatarFallback>
          )}
        </Avatar>
        {isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
            <div className="h-8 w-8 bg-white rounded-full flex items-center justify-center">
              <PlayIcon className="h-4 w-4 text-black fill-black" />
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Badge variant="outline" className="text-xs">
            {config.label}
          </Badge>
          {duration && (
            <span className="text-xs text-muted-foreground">{duration}</span>
          )}
        </div>
        <h3 className={cn(
          "font-medium line-clamp-1",
          isPlayed && "line-through"
        )}>
          {title}
        </h3>
        <p className="text-sm text-muted-foreground line-clamp-1">{author}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {publishedAt.toLocaleDateString()}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {!isPlayed && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onMarkPlayed}
            title="Mark as played"
          >
            <CheckIcon className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant={isPlaying ? 'default' : 'outline'}
          size="sm"
          onClick={onPlay}
        >
          <PlayIcon className="h-4 w-4 mr-1" />
          {isPlaying ? 'Playing' : 'Play'}
        </Button>
      </div>
    </div>
  );
}
```

#### 3. Create Index File

```typescript
// src/index.ts
// Re-export shadcn components
export * from './components/ui/button';
export * from './components/ui/card';
export * from './components/ui/input';
export * from './components/ui/label';
export * from './components/ui/badge';
export * from './components/ui/avatar';
export * from './components/ui/tabs';
export * from './components/ui/dialog';
export * from './components/ui/dropdown-menu';
export * from './components/ui/toast';
export * from './components/ui/skeleton';
export * from './components/ui/separator';

// Export patterns
export * from './components/patterns/BookmarkCard';
export * from './components/patterns/SubscriptionItem';

// Export hooks
export * from './hooks/use-toast';

// Export utilities
export { cn } from './lib/utils';

// Export tokens
export * as tokens from './tokens';
```

### Phase 4: Storybook Setup (Day 8)

#### 1. Initialize Storybook

```bash
npx storybook@latest init
```

#### 2. Create Stories

```typescript
// src/components/patterns/BookmarkCard/BookmarkCard.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { BookmarkCard } from './BookmarkCard';

const meta: Meta<typeof BookmarkCard> = {
  title: 'Patterns/BookmarkCard',
  component: BookmarkCard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'Building a Design System',
    description: 'Learn how to build a scalable design system from scratch using modern tools and best practices.',
    url: 'https://example.com/design-system',
    tags: ['design', 'development', 'tutorial'],
    platform: 'web',
    savedAt: new Date(),
  },
};

export const Spotify: Story = {
  args: {
    title: 'The Daily - New York Times',
    description: 'This is what the news should sound like. Twenty minutes a day, five days a week.',
    url: 'https://open.spotify.com/show/123',
    tags: ['news', 'daily', 'podcast'],
    platform: 'spotify',
    savedAt: new Date(),
  },
};

export const YouTube: Story = {
  args: {
    title: 'React 19 Release Explained',
    description: 'Everything you need to know about the new features in React 19.',
    url: 'https://youtube.com/watch?v=123',
    tags: ['react', 'javascript', 'web'],
    platform: 'youtube',
    savedAt: new Date(),
  },
};
```

### Phase 5: Integration (Day 9-10)

#### 1. Update Web App

```typescript
// apps/web/package.json
{
  "dependencies": {
    "@zine/design-system": "workspace:*",
    // ... other deps
  }
}
```

#### 2. Import Design System

```typescript
// apps/web/src/main.tsx
import '@zine/design-system/styles';

// apps/web/src/pages/bookmarks.tsx
import { BookmarkCard, Badge, Button } from '@zine/design-system';

export function BookmarksPage() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {bookmarks.map((bookmark) => (
        <BookmarkCard
          key={bookmark.id}
          {...bookmark}
          onEdit={() => handleEdit(bookmark.id)}
          onDelete={() => handleDelete(bookmark.id)}
        />
      ))}
    </div>
  );
}
```

## Mobile Support Strategy

### React Native Variants

```typescript
// src/components/primitives/Button/Button.native.tsx
import { Pressable, Text, ActivityIndicator, View } from 'react-native';
import { cva } from 'class-variance-authority';

const buttonVariants = cva({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  variants: {
    variant: {
      primary: {
        backgroundColor: '#3b82f6',
      },
      secondary: {
        backgroundColor: '#e5e5e5',
      },
      outline: {
        borderWidth: 1,
        borderColor: '#d4d4d4',
        backgroundColor: 'transparent',
      },
    },
  },
});

export function Button({ variant = 'primary', loading, children, onPress, ...props }) {
  const styles = buttonVariants({ variant });
  
  return (
    <Pressable style={styles} onPress={onPress} disabled={loading} {...props}>
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={{ color: variant === 'primary' ? '#fff' : '#000' }}>
          {children}
        </Text>
      )}
    </Pressable>
  );
}
```

## Testing Strategy

```typescript
// src/components/ui/button/button.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './button';

describe('Button', () => {
  it('renders children correctly', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button')).toHaveTextContent('Click me');
  });

  it('handles click events', async () => {
    const handleClick = jest.fn();
    render(<Button onClick={handleClick}>Click me</Button>);
    
    await userEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('applies variant styles', () => {
    render(<Button variant="destructive">Delete</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-destructive');
  });
});
```

## Commands Reference

```bash
# Development
cd packages/design-system
bun run dev              # Watch mode
bun run storybook        # Start Storybook

# Add new shadcn component
npx shadcn-ui@latest add [component-name]

# Build
bun run build            # Build package
bun run build-storybook  # Build Storybook

# From monorepo root
turbo dev                # Run all packages
turbo build              # Build all packages
turbo type-check         # Type check all packages
```

## Resources

- [shadcn/ui Documentation](https://ui.shadcn.com)
- [Radix UI Documentation](https://www.radix-ui.com)
- [Tailwind CSS Documentation](https://tailwindcss.com)
- [Storybook Documentation](https://storybook.js.org)
- [CVA Documentation](https://cva.style/docs)

## Implementation Status

### ✅ Completed (August 11, 2025)

1. **Phase 1: Package Setup**
   - Created `@zine/design-system` package
   - Configured TypeScript and build tools (tsup)
   - Set up Tailwind CSS configuration
   - Added necessary dependencies

2. **Phase 2: Design Tokens**
   - Implemented color tokens (brand, neutral, semantic, platform colors)
   - Created typography system (fonts, sizes, weights, letter spacing)
   - Defined spacing system
   - Set up responsive breakpoints

3. **Phase 3: Base Components**
   - Integrated shadcn/ui components:
     - Button
     - Card
     - Input
     - Label
     - Badge
     - Avatar
     - Tabs
     - Dialog
     - Dropdown Menu
     - Skeleton
     - Separator

4. **Phase 4: Zine-Specific Patterns**
   - Created BookmarkCard component
   - Created SubscriptionItem component
   - Both components support platform-specific styling

5. **Phase 5: Storybook Documentation**
   - Set up Storybook with Vite
   - Created stories for:
     - Button component
     - BookmarkCard component
     - SubscriptionItem component
   - Configured Tailwind CSS integration

6. **Phase 6: Web App Integration**
   - Added design system as dependency to web app
   - Created showcase route (`/design-system`)
   - Successfully tested component imports and rendering

### 🚀 How to Use

#### Development
```bash
# Run Storybook for component development
cd packages/design-system
bun run storybook

# Build design system
bun run build

# Watch mode for development
bun run dev
```

#### In Web App
```typescript
import { Button, Card, BookmarkCard } from '@zine/design-system';

// Use components in your app
<Button variant="primary">Click me</Button>
<BookmarkCard {...props} />
```

### ✅ Phase 7: Extended Component Library (August 16, 2025)

Successfully implemented additional components to complete the design system:

#### Layout Components
- **Stack**: Flexible vertical/horizontal stacking with gap control
- **Flex**: Advanced flexbox component with grow/shrink controls

#### Feedback Components  
- **Spinner**: Loading indicator with size and color variants
- **Progress**: Progress bars with determinate/indeterminate states
- **Toast**: Notification component with success/error/warning/info variants

#### Navigation Components
- **Navbar**: Responsive navigation bar with mobile menu
- **Sidebar**: Collapsible sidebar with nested navigation support
- **Breadcrumb**: Breadcrumb navigation with truncation support

All components include:
- Full TypeScript support
- Storybook documentation
- Responsive design
- Accessibility features
- Dark mode compatibility

### 🔄 Next Steps

1. **Immediate**:
   - Add more shadcn components as needed
   - Create additional Zine-specific patterns
   - Expand Storybook documentation

2. **Near Future**:
   - Add dark mode support
   - Implement theme customization
   - Create more complex patterns

3. **Future**:
   - React Native component variants
   - Desktop-specific enhancements
   - Advanced theming system