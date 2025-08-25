# React Native App Implementation Plan

## Overview
Add a React Native mobile app to the Zine monorepo using Expo SDK 53+ that closely matches the web app's design and functionality.

## Design Alignment Requirements

### Core Design Principles
The mobile app MUST match the web app's design language exactly:

1. **Visual Hierarchy**
   - Gray background (#f5f5f5) with white content cards
   - Minimal, clean card design with subtle shadows
   - Consistent spacing and typography scale
   - Platform-specific color badges (Spotify green, YouTube red, etc.)

2. **Navigation Pattern**
   - 3-tab bottom navigation: Home, Search, Profile (NOT 4 tabs)
   - Primary actions on Home screen: Continue, Favorites, Add New
   - Bookmarks and Discover are features within screens, not separate tabs

3. **Content Organization**
   - Time-based greeting header ("Good morning/afternoon/evening")
   - Personalized subtitle ("Welcome back to your personalized content hub")
   - Recent section with large media cards
   - Queue section with compact list items
   - "See all" links for expandable sections

4. **Component Styling**
   - Cards: White background, subtle shadow, no heavy borders
   - Buttons: Minimal, icon-based actions
   - Badges: Small, colored labels for platforms and categories
   - Typography: Clear hierarchy with bold headers, regular body text

## Technology Stack

### Core Framework
- **Expo SDK 53** - Latest version with React Native 0.79 ✅
- **TypeScript 5.8** - Type safety matching web app ✅
- **React 19** - Latest React features ✅
- **Bun** - Package manager (consistent with monorepo) ✅

### Navigation & Routing
- **Expo Router v5** - File-based routing similar to TanStack Router ✅
  - Typed routes ✅
  - Tab navigation ✅
  - Stack navigation
  - Modal support

### Styling & UI Components
- **Tamagui** - Universal component library with excellent performance ✅
  - Pre-built accessible components ✅
  - Theme system with tokens ✅
  - Animations with React Native Reanimated ✅
  - Web/Native code sharing
  - Optimizing compiler for production builds
- **@tamagui/lucide-icons** - Icon library (matches web's lucide-react) ✅
- **React Native Reanimated 3.17+** - Smooth animations (included with Tamagui) ✅

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
│       │   │   ├── index.tsx        # Home (with Continue/Favorites/Add actions)
│       │   │   ├── search.tsx       # Search & Discovery
│       │   │   ├── profile.tsx      # User profile
│       │   │   └── _layout.tsx      # Tab layout (3 tabs only)
│       │   ├── (auth)/
│       │   │   ├── sign-in.tsx      # Sign in screen
│       │   │   ├── sign-up.tsx      # Sign up screen
│       │   │   └── _layout.tsx      # Auth layout
│       │   ├── bookmarks/
│       │   │   ├── index.tsx        # Bookmarks list (navigated from Home)
│       │   │   └── [id].tsx         # Bookmark detail
│       │   ├── favorites/
│       │   │   └── index.tsx        # Favorites list
│       │   ├── queue/
│       │   │   └── index.tsx        # Full queue view
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
│       │   │   ├── MediaCard.tsx        # Large card for Recent section
│       │   │   ├── QueueItem.tsx        # Compact item for Queue
│       │   │   ├── BookmarkCard.tsx     # Minimal bookmark card
│       │   │   └── ActionCard.tsx       # Continue/Favorites/Add cards
│       │   ├── lists/               # List components
│       │   │   ├── BookmarkList.tsx
│       │   │   ├── FeedList.tsx
│       │   │   └── QueueList.tsx
│       │   ├── navigation/          # Navigation components
│       │   │   ├── TabBar.tsx          # Custom 3-tab bar
│       │   │   ├── GreetingHeader.tsx  # Time-based greeting
│       │   │   └── SectionHeader.tsx   # Recent/Queue headers
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

### Phase 1: Foundation (Week 1) ✅ COMPLETED

#### 1.1 Project Setup ✅
- [x] Create `apps/mobile/zine` directory in monorepo
- [x] Expo app created with TypeScript template
- [x] Verify Expo SDK version is 53+ in `package.json` (v53.0.22)
- [x] Test basic Expo app runs with `bun run start`

#### 1.2 TypeScript Configuration ✅
- [x] Configure `tsconfig.json` to extend monorepo base config
- [x] Add path aliases for `@/` imports
- [x] Set up strict TypeScript rules matching web app
- [x] Verify TypeScript compilation with `bun run type-check`

#### 1.3 Monorepo Integration ✅
- [x] Update package name to `@zine/mobile`
- [x] Configure Turborepo tasks for mobile app in `turbo.json`
- [x] Add mobile-specific scripts to root package.json
- [x] Test `bun run mobile` from root works
- [x] Verify shared package imports work (`@zine/shared`)

#### 1.4 Tamagui Installation ✅
- [x] Install core Tamagui packages (`tamagui@1.132.20`, `@tamagui/core`, `@tamagui/config`)
- [x] Install `@tamagui/lucide-icons` for icon support
- [x] React Native Reanimated included and configured
- [x] Create `tamagui.config.ts` with basic theme
- [x] Verify Tamagui provider wraps app root

#### 1.5 Tamagui Theme Configuration ✅
- [x] Map existing web design tokens to Tamagui tokens
- [x] Configure light theme with brand colors
- [x] Configure dark theme with appropriate colors
- [x] Set up typography scale matching web app
- [x] Create spacing tokens (0-32)
- [x] Test theme switching works with system preference

#### 1.6 Expo Router Setup ✅
- [x] Expo Router v5 installed (latest version)
- [x] Create basic `app/_layout.tsx` root layout with Tamagui
- [x] Create `app/(tabs)/_layout.tsx` for tab navigation
- [x] Create placeholder screens for tabs (index, bookmarks, discover, profile)
- [x] Verify navigation between tabs works
- [ ] UPDATE: Restructure to 3 tabs (Home, Search, Profile) to match web

#### 1.7 Development Environment ✅
- [x] Configure Metro bundler for monorepo (`metro.config.js`)
- [x] Set up Babel config for Tamagui (`babel.config.js`)
- [x] Add development scripts to `package.json`
- [x] Configure ESLint with React Native rules
- [x] TypeScript compilation working without errors
- [x] Hot reload works properly

### Phase 2: Core Infrastructure (Week 1-2) ✅ COMPLETED

#### 2.1 TanStack Query Setup ✅
- [x] Install `@tanstack/react-query` and `@tanstack/react-query-devtools`
- [x] Create `QueryClient` with default options in `lib/api.ts`
- [x] Wrap app with `QueryClientProvider`
- [x] Configure query devtools for development
- [x] Test basic query works with mock data

#### 2.2 API Client Configuration ✅
- [x] Create `lib/api.ts` with base configuration
- [x] Set up environment variables for API URL (`EXPO_PUBLIC_API_URL`)
- [x] Implement fetch wrapper with auth headers
- [x] Create typed API methods matching web app
- [x] Test API connection to backend

#### 2.3 API Endpoints Implementation ✅
- [x] Implement `getBookmarks` API method
- [x] Implement `createBookmark` API method
- [x] Implement `updateBookmark` API method
- [x] Implement `deleteBookmark` API method
- [x] Implement `getFeedItems` API method
- [x] Implement `getSubscriptions` API method

#### 2.4 MMKV Storage Setup ✅
- [x] Install `react-native-mmkv`
- [x] Create `lib/storage.ts` with MMKV instance
- [x] Implement storage helpers (get, set, delete, clear)
- [x] Create typed storage keys enum
- [x] Test storage persistence across app restarts

#### 2.5 Secure Storage Setup ✅
- [x] Install `expo-secure-store`
- [x] Create secure storage wrapper for sensitive data
- [x] Implement auth token storage methods
- [x] Test secure storage with mock credentials

#### 2.6 Clerk Authentication Setup ✅
- [x] Install `@clerk/clerk-expo`
- [x] Configure Clerk provider with publishable key
- [x] Implement `useAuth` hook wrapping Clerk
- [x] Set up token storage in secure store
- [x] Test authentication state persistence

#### 2.7 Theme System Implementation ✅
- [x] Create `contexts/ThemeContext.tsx`
- [x] Implement theme persistence in MMKV
- [x] Create `useTheme` hook for theme access
- [x] Add theme toggle component in Profile screen
- [x] Verify theme changes persist across sessions

### Phase 3: UI Components (Week 2-3) ✅ COMPLETED

#### 3.1 Base UI Components ✅
- [x] Create `Button.tsx` with Tamagui variants (primary, secondary, ghost, outlined, danger)
- [x] Create `Input.tsx` with validation states and error/helper text
- [x] Create `Card.tsx` with elevation styles (elevated, outlined, filled)
- [x] Create `Badge.tsx` with color variants (includes platform colors)
- [x] Create `Text.tsx` with typography variants (handled by Tamagui)
- [x] Create `Skeleton.tsx` for loading states with pulse animation
- [ ] UPDATE: Simplify Card to match web's minimal design (white bg, subtle shadow)
- [ ] UPDATE: Adjust Button to be more minimal/icon-focused

#### 3.2 Icon System ✅
- [x] Set up Lucide icons from `@tamagui/lucide-icons`
- [x] Create `Icon` wrapper component with dynamic icon loading
- [x] Define commonly used icon exports for convenience
- [x] Icons properly sized and colored

#### 3.3 Card Components ✅
- [x] Create `components/cards/BookmarkCard.tsx`
- [x] Implement card layout with image and text
- [x] Add bookmark/unbookmark button functionality
- [x] Add share button with native share sheet integration
- [x] Implement press handler for navigation
- [x] Platform-specific badge styling
- [ ] UPDATE: Create `MediaCard.tsx` for Recent section (larger, image-focused)
- [ ] UPDATE: Create `QueueItem.tsx` for Queue section (compact list item)
- [ ] UPDATE: Create `ActionCard.tsx` for Continue/Favorites/Add actions

#### 3.4 FeedItemCard Component ✅
- [x] Create `components/cards/FeedItemCard.tsx`
- [x] Implement platform-specific styling (Spotify, YouTube, Apple, etc.)
- [x] Add media preview with thumbnail/artwork
- [x] Implement duration/episode info display
- [x] Add play/queue actions with proper button states

#### 3.5 SubscriptionCard Component ✅
- [x] Create `components/cards/SubscriptionCard.tsx`
- [x] Display subscription metadata (name, platform, image)
- [x] Show last updated timestamp
- [x] Add subscribe/unsubscribe toggle
- [x] Implement navigation handler for subscription detail

#### 3.6 List Components ✅
- [x] Components integrated directly in screens using ScrollView
- [x] Empty state handling in screens
- [x] Pull-to-refresh support implemented
- [x] Components ready for FlashList integration
- [x] Screens updated to use new card components

### Phase 3.5: Design Alignment Update (URGENT - Week 2)

#### 3.5.1 Navigation Restructure
- [ ] Update tab navigation to 3 tabs: Home, Search, Profile
- [ ] Remove Bookmarks and Discover as separate tabs
- [ ] Update tab icons: Home, Search (magnifying glass), Profile (user)
- [ ] Ensure tab bar matches web styling (minimal, clean)

#### 3.5.2 Theme Configuration Update
- [ ] Update background color to #f5f5f5 (light gray)
- [ ] Ensure cards have white background (#ffffff)
- [ ] Add subtle shadow tokens for cards
- [ ] Update typography scale to match web
- [ ] Ensure platform colors match exactly (Spotify: #1DB954, YouTube: #FF0000)

#### 3.5.3 Home Screen Redesign
- [ ] Add GreetingHeader component with time-based greeting
- [ ] Add personalized subtitle text
- [ ] Create 3 action cards: Continue, Favorites, Add New
- [ ] Implement Recent section with MediaCard components
- [ ] Implement Queue section with horizontal scroll
- [ ] Add "See all" links for each section

#### 3.5.4 Component Updates
- [ ] Simplify Card component (remove heavy borders)
- [ ] Update BookmarkCard to match web's minimal style
- [ ] Create MediaCard for Recent section (image-focused)
- [ ] Create QueueItem for compact queue display
- [ ] Create ActionCard for primary actions
- [ ] Update all buttons to be more icon-focused

### Phase 4: Core Features (Week 3-4)

#### 4.1 Tab Navigation Implementation
- [ ] Create custom `TabBar.tsx` component (3 tabs only)
- [ ] Implement tab icons: Home, Search, Profile
- [ ] Add tab press animations
- [ ] Configure tab bar styling to match web
- [ ] Test navigation state persistence

#### 4.2 Home Screen
- [ ] Update `app/(tabs)/index.tsx` with new layout
- [ ] Implement greeting header with time logic
- [ ] Create action cards section (Continue, Favorites, Add)
- [ ] Implement Recent section with `useFeed` hook
- [ ] Implement Queue section with `useQueue` hook
- [ ] Add navigation to Bookmarks/Favorites screens
- [ ] Add "See all" navigation for sections

#### 4.3 Search Screen
- [ ] Create `app/(tabs)/search.tsx`
- [ ] Implement search bar at top
- [ ] Add discovery section below search
- [ ] Implement `useSearch` hook
- [ ] Display search results
- [ ] Add filters for content types
- [ ] Include subscription discovery

#### 4.4 Bookmarks Screen (Nested)
- [ ] Create `app/bookmarks/index.tsx` (not a tab)
- [ ] Navigate from Home's action card or "See all"
- [ ] Implement `useBookmarks` hook
- [ ] Display bookmarks with minimal cards
- [ ] Add sorting options
- [ ] Add bookmark deletion with swipe

#### 4.5 Profile Screen
- [ ] Update `app/(tabs)/profile.tsx`
- [ ] Display user information from Clerk
- [ ] Show usage statistics
- [ ] Add settings navigation button
- [ ] Implement sign out functionality
- [ ] Match web's profile layout

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
      // UPDATED: Match web's color scheme exactly
      background: '#f5f5f5',        // Gray background like web
      backgroundHover: '#ebebeb',
      backgroundPress: '#e0e0e0',
      backgroundFocus: '#d6d6d6',
      backgroundStrong: '#ffffff',   // White for cards
      color: '#000000',
      colorHover: '#111111',
      colorPress: '#222222',
      colorFocus: '#333333',
      colorTransparent: 'rgba(0,0,0,0.05)',
      // Shadows for cards (subtle like web)
      shadowColor: 'rgba(0,0,0,0.1)',
      shadowColorHover: 'rgba(0,0,0,0.15)',
      shadowColorPress: 'rgba(0,0,0,0.2)',
      // Brand colors
      primary: '#ff6b35',            // Orange accent like web
      secondary: '#64748b',
      success: '#22c55e',
      warning: '#f59e0b',
      error: '#ef4444',
      // Platform colors (exact matches)
      spotify: '#1DB954',
      youtube: '#FF0000',
      apple: '#000000',
      google: '#4285F4',
      medium: '#000000',
      devto: '#0a0a0a',
    },
    dark: {
      // Dark theme tokens (if needed)
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

### 4. Component Implementation Examples

```typescript
// Example: MediaCard for Recent Section (matches web design)
// apps/mobile/components/cards/MediaCard.tsx
import { Card, H4, Paragraph, XStack, YStack, Image, Badge } from 'tamagui'
import { Play } from '@tamagui/lucide-icons'

export function MediaCard({ item, onPress }) {
  return (
    <Card 
      pressable
      onPress={onPress}
      backgroundColor="$backgroundStrong"  // White card
      borderRadius="$3"
      shadowColor="$shadowColor"           // Subtle shadow
      shadowOffset={{ width: 0, height: 2 }}
      shadowOpacity={0.1}
      shadowRadius={8}
      margin="$2"
      overflow="hidden"
    >
      <Image 
        source={{ uri: item.imageUrl }}
        width="100%"
        height={200}
        resizeMode="cover"
      />
      <YStack padding="$3" gap="$2">
        <Badge 
          size="$1" 
          backgroundColor={`$${item.platform.toLowerCase()}`}
          color="white"
        >
          {item.type.toUpperCase()}
        </Badge>
        <H4 size="$6" fontWeight="600" numberOfLines={2}>
          {item.title}
        </H4>
        <Paragraph size="$3" color="$colorHover" numberOfLines={1}>
          {item.creator}
        </Paragraph>
      </YStack>
    </Card>
  )
}

// Example: ActionCard for Continue/Favorites/Add (matches web)
// apps/mobile/components/cards/ActionCard.tsx
import { Card, Text, YStack } from 'tamagui'

export function ActionCard({ icon: Icon, label, onPress }) {
  return (
    <Card
      pressable
      onPress={onPress}
      backgroundColor="$backgroundStrong"
      borderRadius="$4"
      shadowColor="$shadowColor"
      shadowOffset={{ width: 0, height: 1 }}
      shadowOpacity={0.05}
      shadowRadius={4}
      padding="$6"
      alignItems="center"
      justifyContent="center"
      width={100}
      height={120}
    >
      <YStack alignItems="center" gap="$3">
        <Icon size={32} color="$color" />
        <Text fontSize="$4" fontWeight="500">
          {label}
        </Text>
      </YStack>
    </Card>
  )
}

// Example: GreetingHeader Component
// apps/mobile/components/navigation/GreetingHeader.tsx
import { H1, Paragraph, YStack } from 'tamagui'

export function GreetingHeader() {
  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 18) return 'Good afternoon'
    return 'Good evening'
  }

  return (
    <YStack padding="$4" gap="$2">
      <H1 size="$9" fontWeight="700">
        {getGreeting()}
      </H1>
      <Paragraph size="$5" color="$colorHover">
        Welcome back to your personalized content hub
      </Paragraph>
    </YStack>
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

## Design Alignment Checklist

### Must Match Web Design
- [ ] Gray background (#f5f5f5) with white cards
- [ ] 3-tab navigation (Home, Search, Profile)
- [ ] Time-based greeting header
- [ ] Action cards for Continue/Favorites/Add
- [ ] Recent section with large media cards
- [ ] Queue section with compact items
- [ ] Minimal card design with subtle shadows
- [ ] Platform-specific color badges
- [ ] "See all" navigation pattern
- [ ] Clean typography hierarchy

## Success Metrics

- [ ] Visual parity with web app design
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

## Screen Layout Specifications

### Home Screen Layout
```
┌─────────────────────────────────────┐
│  Good [morning/afternoon/evening]   │ <- GreetingHeader
│  Welcome back to your personalized  │
│  content hub                        │
├─────────────────────────────────────┤
│ ┌──────┐ ┌──────┐ ┌──────┐        │ <- Action Cards
│ │  ▶️  │ │  ⭐  │ │  ➕  │        │
│ │Contin│ │Favor-│ │ Add  │        │
│ │  ue  │ │ ites │ │ New  │        │
│ └──────┘ └──────┘ └──────┘        │
├─────────────────────────────────────┤
│ Recent                    See all > │ <- Section Header
├─────────────────────────────────────┤
│ ┌─────────────┐ ┌─────────────┐    │ <- MediaCard Grid
│ │   [Image]   │ │   [Image]   │    │
│ │ [PODCAST]   │ │   [VIDEO]   │    │
│ │    Title    │ │    Title    │    │
│ │   Creator   │ │   Creator   │    │
│ └─────────────┘ └─────────────┘    │
├─────────────────────────────────────┤
│ Queue                     See all > │ <- Section Header
├─────────────────────────────────────┤
│ [icon] Title - Creator    podcast   │ <- QueueItem List
│ [icon] Title - Creator    video     │
│ [icon] Title - Creator    article   │
└─────────────────────────────────────┘
│ [Home]    [Search]    [Profile]    │ <- Tab Bar (3 tabs)
└─────────────────────────────────────┘
```

### Search Screen Layout
```
┌─────────────────────────────────────┐
│ ┌─────────────────────────────┐    │
│ │ 🔍 Search...                │    │ <- Search Bar
│ └─────────────────────────────┘    │
├─────────────────────────────────────┤
│ Discover                            │ <- Section Header
├─────────────────────────────────────┤
│ Browse by Platform:                 │
│ [Spotify] [YouTube] [Apple] [RSS]   │ <- Filter Pills
├─────────────────────────────────────┤
│ Suggested Subscriptions             │
│ ┌─────────────────────────────┐    │
│ │ [img] Subscription Name      │    │
│ │       Platform • Updated     │    │
│ └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

### Profile Screen Layout
```
┌─────────────────────────────────────┐
│ ┌──────┐                           │
│ │ User │  User Name                │ <- User Info
│ │ Icon │  user@email.com           │
│ └──────┘                           │
├─────────────────────────────────────┤
│ Your Stats                          │
│ • 42 Bookmarks                     │
│ • 12 Subscriptions                 │
│ • 5 Items in Queue                 │
├─────────────────────────────────────┤
│ Settings                        >   │ <- Navigation Items
│ Connected Accounts              >   │
│ Help & Support                  >   │
├─────────────────────────────────────┤
│ [Sign Out Button]                   │
└─────────────────────────────────────┘
```

## Resources & References

- [Expo SDK 53 Docs](https://docs.expo.dev)
- [Expo Router v4](https://docs.expo.dev/router/introduction/)
- [Tamagui Documentation](https://tamagui.dev)
- [Tamagui with Expo Guide](https://tamagui.dev/docs/guides/expo)
- [TanStack Query React Native](https://tanstack.com/query/latest/docs/framework/react/react-native)
- [Clerk Expo Documentation](https://clerk.com/docs/quickstarts/expo)

## Phase 1 Completion Summary

Phase 1 has been successfully completed with the following achievements:

### ✅ Completed Features
- Full monorepo integration with Turborepo
- TypeScript configuration with strict typing
- Tamagui UI framework with custom theme matching web design system
- Expo Router v5 with tab navigation
- Four functional screens (Feed, Bookmarks, Discover, Profile)
- Light/Dark theme support based on system preference
- Development environment fully configured

### 📱 Current App State
- App runs on iOS/Android with `bun run mobile`
- Navigation working with 4 tabs and Lucide icons
- Placeholder content ready for Phase 2 data integration
- TypeScript compilation passes without errors
- Hot reload functioning properly

## Phase 2 Completion Summary

Phase 2 has been successfully completed with the following achievements:

### ✅ Completed Features
- TanStack Query setup with QueryClient and provider
- Full API client implementation with typed endpoints
- MMKV storage for local data persistence
- Expo Secure Store for sensitive data
- Clerk authentication with token management
- Theme system with persistent preferences
- All hooks created and tested

## Phase 3 Completion Summary

Phase 3 has been successfully completed with the following achievements:

### ✅ Completed UI Components
- **Base Components**: Button, Input, Card, Badge, Skeleton with full Tamagui styling
- **Icon System**: Complete Lucide icon integration with Icon wrapper
- **Card Components**: BookmarkCard, FeedItemCard, SubscriptionCard all functional
- **Screen Integration**: Feed and Bookmarks screens now using real components
- **Animations**: Smooth animations and interactions on all cards
- **Platform Badges**: Spotify, YouTube, Apple platform-specific styling

### 📱 Current Implementation Status
- All UI components created and styled with Tamagui
- Feed screen displays FeedItemCard components with mock data
- Bookmarks screen displays BookmarkCard components
- TypeScript compilation passes without errors
- Components ready for real data integration

## Next Steps - Phase 4: Core Features

1. **Tab Navigation Implementation** - Custom tab bar with animations
2. **Home/Feed Screen** - Full feed functionality with filters
3. **Bookmarks Screen** - Complete bookmark management
4. **Discover Screen** - Subscription discovery and management
5. **Profile Screen** - User profile and settings navigation
