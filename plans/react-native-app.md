# React Native App Implementation Plan

## Overview
Add a React Native mobile app to the Zine monorepo using Expo SDK 53+ that closely matches the web app's design and functionality.

## Technology Stack

### Core Framework
- **Expo SDK 53** - Latest version with React Native 0.76
- **TypeScript 5.3+** - Type safety matching web app
- **React 18.3+** - Latest React features
- **Bun** - Package manager (consistent with monorepo)

### Navigation & Routing
- **Expo Router v4** - File-based routing similar to TanStack Router
  - Typed routes
  - Tab navigation
  - Stack navigation
  - Modal support

### Styling & UI Components
- **Tamagui** - Universal component library with excellent performance
  - Pre-built accessible components
  - Theme system with tokens
  - Animations with React Native Reanimated
  - Web/Native code sharing
  - Optimizing compiler for production builds
- **@tamagui/lucide-icons** - Icon library (matches web's lucide-react)
- **React Native Reanimated 3.16+** - Smooth animations (included with Tamagui)

### State Management & Data Fetching
- **TanStack Query v5** - Same as web app
  - Reuse query keys and patterns
  - Shared caching strategies
- **MMKV** - Fast persistent storage
  - Local caching
  - User preferences
- **Expo Secure Store** - Sensitive data storage
  - Auth tokens
  - OAuth credentials

### Authentication
- **Clerk Expo SDK** - Integration with existing Clerk setup
  - Shared auth state with web
  - SSO support
- **Expo Auth Session** - OAuth flows
  - Spotify integration
  - YouTube integration

### Development & Build Tools
- **Expo Dev Client** - Custom development builds
- **EAS Build** - Cloud builds for iOS/Android
- **Expo Go** - Rapid prototyping (with limitations)
- **Turborepo** - Monorepo task orchestration

## Project Structure

```
zine/
├── apps/
│   ├── web/           # Existing web app
│   └── mobile/        # New React Native app
│       ├── app/       # Expo Router screens
│       │   ├── (tabs)/
│       │   │   ├── index.tsx        # Home/Feed
│       │   │   ├── bookmarks.tsx    # Saved bookmarks
│       │   │   ├── discover.tsx     # Discovery/Browse
│       │   │   ├── profile.tsx      # User profile
│       │   │   └── _layout.tsx      # Tab layout
│       │   ├── (auth)/
│       │   │   ├── sign-in.tsx      # Sign in screen
│       │   │   ├── sign-up.tsx      # Sign up screen
│       │   │   └── _layout.tsx      # Auth layout
│       │   ├── bookmark/
│       │   │   └── [id].tsx         # Bookmark detail
│       │   ├── subscription/
│       │   │   └── [id].tsx         # Subscription detail
│       │   ├── settings/
│       │   │   ├── index.tsx        # Settings main
│       │   │   ├── account.tsx      # Account settings
│       │   │   └── connections.tsx  # OAuth connections
│       │   ├── _layout.tsx          # Root layout
│       │   └── +not-found.tsx       # 404 screen
│       ├── components/
│       │   ├── ui/                  # Tamagui-based UI components
│       │   │   ├── Button.tsx
│       │   │   ├── Card.tsx
│       │   │   ├── Input.tsx
│       │   │   ├── Badge.tsx
│       │   │   ├── Skeleton.tsx
│       │   │   └── Text.tsx
│       │   ├── cards/               # Content cards
│       │   │   ├── BookmarkCard.tsx
│       │   │   ├── FeedItemCard.tsx
│       │   │   └── SubscriptionCard.tsx
│       │   ├── lists/               # List components
│       │   │   ├── BookmarkList.tsx
│       │   │   ├── FeedList.tsx
│       │   │   └── QueueList.tsx
│       │   ├── navigation/          # Navigation components
│       │   │   ├── TabBar.tsx
│       │   │   └── Header.tsx
│       │   └── auth/                # Auth components
│       │       ├── SignInForm.tsx
│       │       └── OAuthButtons.tsx
│       ├── hooks/                   # Custom hooks
│       │   ├── useBookmarks.ts
│       │   ├── useFeed.ts
│       │   ├── useSubscriptions.ts
│       │   ├── useAuth.ts
│       │   └── useTheme.ts
│       ├── lib/                     # Utilities
│       │   ├── api.ts              # API client
│       │   ├── storage.ts          # MMKV setup
│       │   ├── constants.ts        # App constants
│       │   ├── utils.ts            # Helper functions
│       │   └── theme.ts            # Theme configuration
│       ├── assets/                  # Static assets
│       │   ├── images/
│       │   └── fonts/
│       ├── tamagui.config.ts       # Tamagui configuration
│       ├── app.json                # Expo configuration
│       ├── expo-env.d.ts           # Type definitions
│       ├── metro.config.js         # Metro bundler config
│       ├── babel.config.js         # Babel config for Tamagui
│       ├── tsconfig.json           # TypeScript config
│       └── package.json            # Dependencies
├── packages/
│   ├── api/           # Shared backend (no changes)
│   ├── shared/        # Shared business logic
│   │   └── src/
│   │       ├── repositories/       # Add RN-compatible repos
│   │       ├── services/           # Shared services
│   │       └── types.ts            # Shared types
│   └── design-system/ # Extended for React Native
│       └── src/
│           ├── components/
│           │   ├── web/            # Web components
│           │   └── native/         # Native components (Tamagui-based)
│           └── tokens/             # Shared design tokens
```

## Implementation Phases

### Phase 1: Foundation (Week 1)

#### 1.1 Project Setup
- [ ]Create `apps/mobile` directory in monorepo
- [ ]Run `bunx create-expo-app@latest --template blank-typescript` in `apps/mobile`
- [ ]Verify Expo SDK version is 53+ in `package.json`
- [ ]Test basic Expo app runs with `bun run start`

#### 1.2 TypeScript Configuration
- [ ]Configure `tsconfig.json` to extend monorepo base config
- [ ]Add path aliases for `@/` imports
- [ ]Set up strict TypeScript rules matching web app
- [ ]Verify TypeScript compilation with `bun run type-check`

#### 1.3 Monorepo Integration
- [ ]Update root `package.json` to include mobile workspace
- [ ]Configure Turborepo tasks for mobile app in `turbo.json`
- [ ]Add mobile-specific scripts to root package.json
- [ ]Test `turbo dev` includes mobile app
- [ ]Verify shared package imports work (`@zine/shared`)

#### 1.4 Tamagui Installation
- [ ]Install core Tamagui packages (`tamagui`, `@tamagui/core`, `@tamagui/config`)
- [ ]Install `@tamagui/lucide-icons` for icon support
- [ ]Install `react-native-reanimated` and configure
- [ ]Create `tamagui.config.ts` with basic theme
- [ ]Verify Tamagui provider wraps app root

#### 1.5 Tamagui Theme Configuration
- [ ]Map existing web design tokens to Tamagui tokens
- [ ]Configure light theme with brand colors
- [ ]Configure dark theme with appropriate colors
- [ ]Set up typography scale matching web app
- [ ]Create spacing tokens (0-32)
- [ ]Test theme switching works

#### 1.6 Expo Router Setup
- [ ]Install `expo-router` v4
- [ ]Create basic `app/_layout.tsx` root layout
- [ ]Create `app/(tabs)/_layout.tsx` for tab navigation
- [ ]Create placeholder screens for tabs (index, bookmarks, discover, profile)
- [ ]Verify navigation between tabs works

#### 1.7 Development Environment
- [ ] Configure Metro bundler for monorepo (`metro.config.js`)
- [ ] Set up Babel config for Tamagui (`babel.config.js`)
- [ ] Add development scripts to `package.json`
- [ ] Configure ESLint with React Native rules
- [ ] Set up Prettier config matching monorepo
- [ ] Test hot reload works properly

### Phase 2: Core Infrastructure (Week 1-2)

#### 2.1 TanStack Query Setup
- [ ] Install `@tanstack/react-query` and `@tanstack/react-query-devtools`
- [ ] Create `QueryClient` with default options in `lib/api.ts`
- [ ] Wrap app with `QueryClientProvider`
- [ ] Configure query devtools for development
- [ ] Test basic query works with mock data

#### 2.2 API Client Configuration
- [ ] Create `lib/api.ts` with base configuration
- [ ] Set up environment variables for API URL (`EXPO_PUBLIC_API_URL`)
- [ ] Implement fetch wrapper with auth headers
- [ ] Create typed API methods matching web app
- [ ] Test API connection to backend

#### 2.3 API Endpoints Implementation
- [ ] Implement `getBookmarks` API method
- [ ] Implement `createBookmark` API method
- [ ] Implement `updateBookmark` API method
- [ ] Implement `deleteBookmark` API method
- [ ] Implement `getFeedItems` API method
- [ ] Implement `getSubscriptions` API method

#### 2.4 MMKV Storage Setup
- [ ] Install `react-native-mmkv`
- [ ] Create `lib/storage.ts` with MMKV instance
- [ ] Implement storage helpers (get, set, delete, clear)
- [ ] Create typed storage keys enum
- [ ] Test storage persistence across app restarts

#### 2.5 Secure Storage Setup
- [ ] Install `expo-secure-store`
- [ ] Create secure storage wrapper for sensitive data
- [ ] Implement auth token storage methods
- [ ] Test secure storage with mock credentials

#### 2.6 Clerk Authentication Setup
- [ ] Install `@clerk/clerk-expo`
- [ ] Configure Clerk provider with publishable key
- [ ] Implement `useAuth` hook wrapping Clerk
- [ ] Set up token storage in secure store
- [ ] Test authentication state persistence

#### 2.7 Theme System Implementation
- [ ] Create `contexts/ThemeContext.tsx`
- [ ] Implement theme persistence in MMKV
- [ ] Create `useTheme` hook for theme access
- [ ] Add theme toggle component
- [ ] Verify theme changes persist across sessions

### Phase 3: UI Components (Week 2-3)

#### 3.1 Base UI Components
- [ ] Create `Button.tsx` with Tamagui variants
- [ ] Create `Input.tsx` with validation states
- [ ] Create `Card.tsx` with elevation styles
- [ ] Create `Badge.tsx` with color variants
- [ ] Create `Text.tsx` with typography variants
- [ ] Create `Skeleton.tsx` for loading states

#### 3.2 Icon System
- [ ] Set up Lucide icons from `@tamagui/lucide-icons`
- [ ] Create `Icon` wrapper component
- [ ] Define commonly used icon exports
- [ ] Test icons render at different sizes

#### 3.3 BookmarkCard Component
- [ ] Create `components/cards/BookmarkCard.tsx`
- [ ] Implement card layout with image and text
- [ ] Add bookmark/unbookmark button functionality
- [ ] Add share button with native share sheet
- [ ] Implement press handler for navigation
- [ ] Add loading and error states

#### 3.4 FeedItemCard Component
- [ ] Create `components/cards/FeedItemCard.tsx`
- [ ] Implement platform-specific styling (Spotify, YouTube, etc.)
- [ ] Add media preview (thumbnail/artwork)
- [ ] Implement duration/episode info display
- [ ] Add play/queue actions

#### 3.5 SubscriptionCard Component
- [ ] Create `components/cards/SubscriptionCard.tsx`
- [ ] Display subscription metadata (name, platform, image)
- [ ] Show last updated timestamp
- [ ] Add subscribe/unsubscribe toggle
- [ ] Implement navigation to subscription detail

#### 3.6 List Components
- [ ] Create `BookmarkList.tsx` with FlashList
- [ ] Create `FeedList.tsx` with virtualization
- [ ] Create `QueueList.tsx` with drag-to-reorder
- [ ] Implement empty state components
- [ ] Add pull-to-refresh support
- [ ] Implement infinite scroll loading

### Phase 4: Core Features (Week 3-4)

#### 4.1 Tab Navigation Implementation
- [ ] Create custom `TabBar.tsx` component
- [ ] Implement tab icons with badges
- [ ] Add tab press animations
- [ ] Configure tab bar styling
- [ ] Test navigation state persistence

#### 4.2 Home/Feed Screen
- [ ] Create `app/(tabs)/index.tsx`
- [ ] Implement `useFeed` hook with TanStack Query
- [ ] Display feed items in FeedList
- [ ] Add category filters (All, Podcasts, Videos, Articles)
- [ ] Implement mark as played/read functionality
- [ ] Add error boundary and retry logic

#### 4.3 Bookmarks Screen
- [ ] Create `app/(tabs)/bookmarks.tsx`
- [ ] Implement `useBookmarks` hook
- [ ] Display bookmarks in BookmarkList
- [ ] Add sorting options (date, title, source)
- [ ] Implement search/filter functionality
- [ ] Add bookmark deletion with swipe gesture

#### 4.4 Discover Screen
- [ ] Create `app/(tabs)/discover.tsx`
- [ ] Implement `useSubscriptions` hook
- [ ] Display subscription suggestions
- [ ] Add platform filters (Spotify, YouTube, RSS)
- [ ] Implement subscription search
- [ ] Add "Add Subscription" flow

#### 4.5 Profile Screen
- [ ] Create `app/(tabs)/profile.tsx`
- [ ] Display user information from Clerk
- [ ] Show usage statistics (bookmarks count, etc.)
- [ ] Add settings navigation button
- [ ] Implement sign out functionality
- [ ] Add account deletion option

#### 4.6 Bookmark Actions
- [ ] Implement `useSaveBookmark` mutation
- [ ] Implement `useDeleteBookmark` mutation
- [ ] Add optimistic updates for better UX
- [ ] Create bookmark success/error toasts
- [ ] Test offline bookmark queuing

### Phase 5: Authentication & OAuth (Week 4-5)

#### 5.1 Authentication Screens
- [ ] Create `app/(auth)/sign-in.tsx`
- [ ] Create `app/(auth)/sign-up.tsx`
- [ ] Create `app/(auth)/_layout.tsx` for auth flow
- [ ] Implement form validation with Zod
- [ ] Add loading states during auth

#### 5.2 Sign In Implementation
- [ ] Create `SignInForm.tsx` component
- [ ] Implement email/password sign in
- [ ] Add "Remember Me" functionality
- [ ] Implement forgot password flow
- [ ] Add biometric authentication option

#### 5.3 Sign Up Implementation
- [ ] Create `SignUpForm.tsx` component
- [ ] Implement email/password registration
- [ ] Add email verification flow
- [ ] Implement terms acceptance checkbox
- [ ] Add onboarding flow after signup

#### 5.4 OAuth Setup
- [ ] Install `expo-auth-session`
- [ ] Create `OAuthButtons.tsx` component
- [ ] Configure OAuth redirect URIs
- [ ] Implement OAuth state management
- [ ] Test OAuth flow in development

#### 5.5 OAuth Provider Integration
- [ ] Implement Spotify OAuth flow
- [ ] Implement YouTube OAuth flow
- [ ] Store OAuth tokens securely
- [ ] Implement token refresh logic
- [ ] Add account linking in settings

#### 5.6 Settings Screens
- [ ] Create `app/settings/index.tsx`
- [ ] Create `app/settings/account.tsx`
- [ ] Create `app/settings/connections.tsx`
- [ ] Implement settings navigation stack
- [ ] Add back navigation handling

#### 5.7 Account Management
- [ ] Display connected accounts
- [ ] Implement disconnect account flow
- [ ] Add profile edit functionality
- [ ] Implement password change
- [ ] Add notification preferences

### Phase 6: Advanced Features (Week 5-6)

#### 6.1 Pull-to-Refresh
- [ ] Add RefreshControl to FeedList
- [ ] Add RefreshControl to BookmarkList
- [ ] Implement refresh logic with TanStack Query
- [ ] Add custom refresh indicator
- [ ] Test refresh state management

#### 6.2 Infinite Scrolling
- [ ] Implement pagination in API hooks
- [ ] Add infinite query setup for feeds
- [ ] Add infinite query for bookmarks
- [ ] Implement loading footer component
- [ ] Add scroll position restoration

#### 6.3 Search Functionality
- [ ] Create `SearchBar.tsx` component
- [ ] Implement debounced search input
- [ ] Add search API integration
- [ ] Create search results screen
- [ ] Implement recent searches storage
- [ ] Add search suggestions

#### 6.4 Detail Views
- [ ] Create `app/bookmark/[id].tsx`
- [ ] Create `app/subscription/[id].tsx`
- [ ] Implement deep linking support
- [ ] Add share functionality
- [ ] Implement related content section

#### 6.5 Queue Management
- [ ] Create queue context/store
- [ ] Implement add to queue functionality
- [ ] Create queue reordering with drag gesture
- [ ] Add queue persistence in MMKV
- [ ] Implement play next/play later options

### Phase 7: Polish & Optimization (Week 6-7)

#### 7.1 Loading States
- [ ] Add skeleton screens for all lists
- [ ] Implement progressive image loading
- [ ] Add shimmer effect to skeletons
- [ ] Create loading overlay component
- [ ] Test loading states with slow network

#### 7.2 Error Handling
- [ ] Implement global error boundary
- [ ] Create error screen components
- [ ] Add retry mechanisms for failed requests
- [ ] Implement offline detection
- [ ] Add user-friendly error messages

#### 7.3 Haptic Feedback
- [ ] Install `expo-haptics`
- [ ] Add haptic feedback to button presses
- [ ] Add haptic feedback to tab switches
- [ ] Add haptic feedback to swipe actions
- [ ] Test haptic feedback on different devices

#### 7.4 Performance Optimization
- [ ] Enable Tamagui compiler for production
- [ ] Implement React.memo for heavy components
- [ ] Add image caching with `expo-image`
- [ ] Optimize bundle size with tree shaking
- [ ] Profile and fix performance bottlenecks

#### 7.5 Offline Support
- [ ] Implement offline queue for mutations
- [ ] Add offline indicator component
- [ ] Cache critical data in MMKV
- [ ] Implement background sync
- [ ] Test offline/online transitions

#### 7.6 Final Polish
- [ ] Add app splash screen
- [ ] Configure app icon for iOS/Android
- [ ] Implement deep linking handlers
- [ ] Add push notification support
- [ ] Create onboarding tour
- [ ] Implement analytics tracking

## Key Implementation Details

### 1. Monorepo Integration

```json
// apps/mobile/package.json
{
  "name": "@zine/mobile",
  "version": "1.0.0",
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web",
    "lint": "eslint .",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@zine/shared": "workspace:*",
    "expo": "~53.0.0",
    "expo-router": "~4.0.0",
    "@tamagui/core": "^1.115.0",
    "@tamagui/config": "^1.115.0",
    "@tamagui/animations-react-native": "^1.115.0",
    "tamagui": "^1.115.0",
    // ... other deps
  }
}
```

### 2. Tamagui Configuration

```typescript
// apps/mobile/tamagui.config.ts
import { config } from '@tamagui/config/v3'
import { createTamagui } from 'tamagui'

// Custom theme matching your web app
const appConfig = createTamagui({
  ...config,
  themes: {
    light: {
      background: '#ffffff',
      backgroundHover: '#f5f5f5',
      backgroundPress: '#ebebeb',
      backgroundFocus: '#e0e0e0',
      color: '#000000',
      colorHover: '#111111',
      colorPress: '#222222',
      colorFocus: '#333333',
      // Map your existing design tokens
      primary: '#8b5cf6',
      secondary: '#64748b',
      success: '#22c55e',
      warning: '#f59e0b',
      error: '#ef4444',
      // Platform colors
      spotify: '#1DB954',
      youtube: '#FF0000',
      apple: '#000000',
      google: '#4285F4',
    },
    dark: {
      // Dark theme tokens
    }
  },
  tokens: {
    size: {
      0: 0,
      1: 4,
      2: 8,
      3: 12,
      4: 16,
      5: 20,
      6: 24,
      7: 28,
      8: 32,
      9: 36,
      10: 40,
      // ... match your spacing scale
    },
    space: {
      // Match your spacing tokens
    },
    radius: {
      0: 0,
      1: 4,
      2: 8,
      3: 12,
      4: 16,
    },
    font: {
      // Your font configuration
    }
  },
  fonts: {
    body: {
      family: 'System',
      // Font configuration
    },
    heading: {
      family: 'System',
      weight: '700',
    }
  }
})

export default appConfig
```

### 3. API Client Setup

```typescript
// apps/mobile/lib/api.ts
import { BookmarkService } from '@zine/shared'
import { QueryClient } from '@tanstack/react-query'

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.myzine.app'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 2,
    },
  },
})

export const apiClient = {
  // Reuse existing API patterns from web
}
```

### 4. Component Porting Strategy with Tamagui

```typescript
// Example: Porting BookmarkCard with Tamagui
// apps/mobile/components/cards/BookmarkCard.tsx
import { Card, H3, Paragraph, XStack, YStack, Image, Button } from 'tamagui'
import { Bookmark, Share2 } from '@tamagui/lucide-icons'

interface BookmarkCardProps {
  bookmark: {
    id: string
    title: string
    description?: string
    imageUrl?: string
    source: string
    createdAt: string
  }
  onPress: () => void
}

export function BookmarkCard({ bookmark, onPress }: BookmarkCardProps) {
  return (
    <Card 
      elevate 
      bordered 
      pressable
      onPress={onPress}
      animation="quick"
      scale={0.98}
      hoverStyle={{ scale: 0.985 }}
      pressStyle={{ scale: 0.975 }}
    >
      <Card.Header padded>
        <XStack gap="$3">
          {bookmark.imageUrl && (
            <Image 
              source={{ uri: bookmark.imageUrl }}
              width={80}
              height={80}
              borderRadius="$2"
            />
          )}
          <YStack flex={1} gap="$2">
            <H3 size="$5" numberOfLines={2}>
              {bookmark.title}
            </H3>
            {bookmark.description && (
              <Paragraph size="$3" theme="alt2" numberOfLines={2}>
                {bookmark.description}
              </Paragraph>
            )}
            <XStack gap="$2" alignItems="center">
              <Paragraph size="$2" theme="alt2">
                {bookmark.source}
              </Paragraph>
              <Paragraph size="$2" theme="alt2">
                • {new Date(bookmark.createdAt).toLocaleDateString()}
              </Paragraph>
            </XStack>
          </YStack>
        </XStack>
      </Card.Header>
      <Card.Footer padded>
        <XStack gap="$2">
          <Button size="$3" icon={Bookmark} variant="outlined">
            Save
          </Button>
          <Button size="$3" icon={Share2} variant="outlined">
            Share
          </Button>
        </XStack>
      </Card.Footer>
    </Card>
  )
}
```

### 5. Shared Hooks Pattern

```typescript
// apps/mobile/hooks/useBookmarks.ts
import { useQuery, useMutation } from '@tanstack/react-query'
import { apiClient } from '../lib/api'

export function useBookmarks() {
  // Reuse query logic from web with RN-specific error handling
  return useQuery({
    queryKey: ['bookmarks'],
    queryFn: apiClient.getBookmarks,
  })
}
```

### 6. Babel Configuration for Tamagui

```javascript
// apps/mobile/babel.config.js
module.exports = function(api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        '@tamagui/babel-plugin',
        {
          components: ['tamagui'],
          config: './tamagui.config.ts',
          logTimings: true,
          disableExtraction: process.env.NODE_ENV === 'development',
        }
      ],
      'react-native-reanimated/plugin',
    ]
  }
}
```

### 7. Metro Configuration

```javascript
// apps/mobile/metro.config.js
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

// Tamagui configuration
config.resolver.sourceExts.push('mjs')

// Monorepo configuration
const projectRoot = __dirname
const workspaceRoot = require('path').resolve(projectRoot, '../..')

config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  require('path').resolve(projectRoot, 'node_modules'),
  require('path').resolve(workspaceRoot, 'node_modules'),
]

module.exports = config
```

## Development Workflow

### Local Development
```bash
# Start all services
turbo dev

# Start mobile only
cd apps/mobile && bun run start

# Run on iOS simulator
cd apps/mobile && bun run ios

# Run on Android emulator
cd apps/mobile && bun run android
```

### Building
```bash
# Development build
eas build --platform ios --profile development
eas build --platform android --profile development

# Preview build
eas build --platform all --profile preview

# Production build
eas build --platform all --profile production
```

### Testing
```bash
# Unit tests
bun test

# E2E tests with Detox
bun run e2e:ios
bun run e2e:android
```

## Performance Targets

- **App Size**: < 30MB (iOS), < 20MB (Android)
- **Startup Time**: < 2 seconds
- **Frame Rate**: 60 FPS for animations
- **Memory Usage**: < 200MB average
- **Network**: Offline-first with sync

## Design Principles

1. **Consistency**: Match web app UX patterns
2. **Native Feel**: Platform-specific behaviors with Tamagui
3. **Performance**: Optimize with Tamagui compiler
4. **Accessibility**: Full VoiceOver/TalkBack support built into Tamagui
5. **Offline First**: Work without connectivity

## Why Tamagui?

1. **Performance**: Optimizing compiler removes runtime overhead
2. **Developer Experience**: Excellent TypeScript support and debugging
3. **Design System**: Built-in tokens and themes that match your web design
4. **Cross-Platform**: Share components between web and native
5. **Accessibility**: ARIA and platform-specific a11y built-in
6. **Animation**: Powerful animation system with React Native Reanimated
7. **Component Library**: Rich set of pre-built, customizable components

## Success Metrics

- [ ] Feature parity with web app core functionality
- [ ] < 3% crash rate
- [ ] 4.5+ app store rating
- [ ] 60% of mobile users use bookmarks feature
- [ ] 80% retention after 30 days

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Clerk Expo SDK limitations | Implement fallback auth flow |
| Tamagui learning curve | Start with basic components, iterate |
| Large bundle size | Use Tamagui compiler optimization |
| Platform differences | Use Tamagui's platform variants |
| API compatibility | Version API endpoints |

## Resources & References

- [Expo SDK 53 Docs](https://docs.expo.dev)
- [Expo Router v4](https://docs.expo.dev/router/introduction/)
- [Tamagui Documentation](https://tamagui.dev)
- [Tamagui with Expo Guide](https://tamagui.dev/docs/guides/expo)
- [TanStack Query React Native](https://tanstack.com/query/latest/docs/framework/react/react-native)
- [Clerk Expo Documentation](https://clerk.com/docs/quickstarts/expo)

## Next Steps

1. Create `apps/mobile` directory
2. Run `bunx create-expo-app@latest --template blank-typescript`
3. Install Tamagui dependencies
4. Configure Tamagui and theme
5. Set up monorepo workspace integration
6. Implement first screen with Tamagui components
