# @zine/design-system

A unified component library for the Zine platform, providing consistent UI components across web and mobile applications using HeroUI and HeroUI Native.

## 🚀 Features

- **Cross-platform Support**: Single API for both web (React) and mobile (React Native) applications
- **HeroUI Integration**: Modern React components built on Tailwind CSS and React Aria
- **Type Safety**: Full TypeScript support with comprehensive type definitions
- **Design Tokens**: Consistent colors, typography, spacing, and breakpoints
- **Custom Components**: Zine-specific patterns like BookmarkCard, SubscriptionItem, and FeedCard
- **Testing**: Unit tests with Vitest and React Testing Library
- **Documentation**: Storybook for component exploration and documentation

## 📦 Installation

```bash
# Using bun (recommended)
bun add @zine/design-system

# Using npm
npm install @zine/design-system

# Using yarn
yarn add @zine/design-system
```

## 🎨 Usage

### Web Applications

```tsx
import React from 'react';
import { DesignSystemProvider, Button, Card, BookmarkCard } from '@zine/design-system/web';

function App() {
  return (
    <DesignSystemProvider>
      <Button color="primary" onPress={() => console.log('Clicked!')}>
        Click me
      </Button>
      
      <BookmarkCard
        id="1"
        title="My Bookmark"
        url="https://example.com"
        platform="spotify"
        onView={(id) => console.log('View', id)}
      />
    </DesignSystemProvider>
  );
}
```

### Mobile Applications (React Native)

```tsx
import React from 'react';
import { DesignSystemProvider, Button } from '@zine/design-system/native';

function App() {
  return (
    <DesignSystemProvider>
      <Button variant="solid" onPress={() => console.log('Pressed!')}>
        Press me
      </Button>
    </DesignSystemProvider>
  );
}
```

## 🧩 Components

### Core Components (HeroUI)

All standard HeroUI components are available and wrapped for consistency:

- **Button**: Primary interaction element with variants and states
- **Input**: Text input with form field support
- **Card**: Container component with Header, Body, and Footer sections
- **Badge**: Small status indicators
- **Avatar**: User profile images
- **Spinner**: Loading indicators
- **Modal**: Overlay dialogs
- **Select**: Dropdown selection component

### Zine-Specific Patterns

Custom components designed specifically for the Zine platform:

#### BookmarkCard

Display saved bookmarks with platform-specific styling:

```tsx
<BookmarkCard
  id="bookmark-1"
  title="Interesting Article"
  url="https://example.com/article"
  description="A fascinating read about..."
  thumbnail="https://example.com/thumb.jpg"
  platform="web"
  tags={['tech', 'news']}
  onView={(id) => handleView(id)}
  onEdit={(id) => handleEdit(id)}
  onDelete={(id) => handleDelete(id)}
/>
```

#### SubscriptionItem

Display subscription content with playback controls:

```tsx
<SubscriptionItem
  id="episode-1"
  title="Episode 42"
  description="In this episode..."
  thumbnail="https://example.com/episode.jpg"
  platform="spotify"
  duration={3600}
  progress={1800}
  isPlaying={false}
  episodeNumber={42}
  seasonNumber={2}
  onPlay={(id) => handlePlay(id)}
  onPause={(id) => handlePause(id)}
/>
```

#### FeedCard

Manage feed subscriptions:

```tsx
<FeedCard
  id="feed-1"
  title="Tech News Feed"
  description="Latest technology news"
  thumbnail="https://example.com/feed.jpg"
  subscriberCount={1000}
  updateFrequency="Daily"
  isActive={true}
  isSubscribed={false}
  categories={['Technology', 'News']}
  onSubscribe={(id) => handleSubscribe(id)}
  onUnsubscribe={(id) => handleUnsubscribe(id)}
/>
```

## 🎨 Design Tokens

The design system includes a comprehensive set of design tokens for consistency:

### Colors

```js
// Brand colors
primary: {
  50: '#fef2f2',
  // ... full scale
  900: '#7f1d1d',
  DEFAULT: '#ef4444',
}

// Platform colors
spotify: '#1DB954'
youtube: '#FF0000'
apple: '#000000'
google: '#4285F4'
```

### Typography

```js
fontFamily: {
  sans: ['Inter', 'system-ui', 'sans-serif'],
  mono: ['JetBrains Mono', 'monospace'],
  display: ['Cal Sans', 'sans-serif'],
}

fontSize: {
  xs: '0.75rem',
  sm: '0.875rem',
  base: '1rem',
  lg: '1.125rem',
  xl: '1.25rem',
  '2xl': '1.5rem',
  // ... up to 6xl
}
```

### Spacing

Consistent spacing scale from 0 to 32 (0px to 128px):

```js
spacing: {
  0: '0px',
  1: '4px',
  2: '8px',
  4: '16px',
  8: '32px',
  // ... up to 32
}
```

## 🧪 Testing

The design system includes comprehensive unit tests:

```bash
# Run tests
bun run test

# Run tests with UI
bun run test:ui

# Run tests with coverage
bun run test:coverage
```

## 📚 Documentation

### Storybook

View and interact with components in isolation:

```bash
# Start Storybook
bun run storybook

# Build Storybook
bun run build-storybook
```

Visit http://localhost:6006 to explore components.

## 🏗️ Architecture

### Package Structure

```
packages/design-system/
├── src/
│   ├── core/                    # Shared abstractions
│   │   ├── tokens/              # Design tokens
│   │   ├── types/               # TypeScript types
│   │   └── utils/               # Utilities
│   ├── web/                     # Web-specific
│   │   ├── components/          # HeroUI wrappers
│   │   ├── patterns/            # Zine components
│   │   └── providers/           # Context providers
│   ├── native/                  # Mobile-specific
│   │   ├── components/          # HeroUI Native wrappers
│   │   └── providers/           # Native providers
│   └── lib/                     # Shared utilities
├── tailwind.config.shared.js    # Shared Tailwind config
└── vitest.config.ts            # Test configuration
```

### Platform-Specific Exports

The package provides separate exports for web and mobile:

```json
{
  "exports": {
    "./web": "./dist/web/index.js",
    "./native": "./dist/native/index.js",
    "./tokens": "./dist/core/tokens/index.js",
    "./tailwind.config.shared": "./tailwind.config.shared.js"
  }
}
```

## 🔄 Migration Guide

### From shadcn/ui to HeroUI

If you're migrating from the previous shadcn/ui implementation:

1. **Update imports**:
```tsx
// Before
import { Button } from '@/components/ui/button';

// After
import { Button } from '@zine/design-system/web';
```

2. **Update props**:
```tsx
// Before
<Button variant="outline" onClick={handleClick}>

// After
<Button variant="bordered" onPress={handleClick}>
```

3. **Wrap with provider**:
```tsx
// Add at app root
import { DesignSystemProvider } from '@zine/design-system/web';

<DesignSystemProvider>
  {/* Your app */}
</DesignSystemProvider>
```

## 🛠️ Development

### Prerequisites

- Node.js 18+
- Bun 1.0+

### Setup

```bash
# Install dependencies
bun install

# Build the package
bun run build

# Start development mode
bun run dev

# Run tests
bun run test

# Start Storybook
bun run storybook
```

### Adding New Components

1. Create component in appropriate directory:
   - Web: `src/web/components/`
   - Native: `src/native/components/`
   - Shared patterns: `src/web/patterns/` and `src/native/patterns/`

2. Export from index files

3. Add tests in `__tests__` directory

4. Create Storybook story

5. Update documentation

## 📝 License

MIT

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## 🐛 Issues

Found a bug? Please report it on our [GitHub Issues](https://github.com/zine/design-system/issues) page.

## 📞 Support

For questions and support, please refer to our documentation or contact the team.

---

Built with ❤️ by the Zine team