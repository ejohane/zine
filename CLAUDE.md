# Claude Development Guidelines

## Project Focus

**🎯 Mobile-First Architecture**

Zine is now a **mobile-first application**:
- **Primary Platform**: React Native mobile app (actively developed)
- **Web App**: Development/testing tool only (not actively maintained)
- **Design System**: Mobile-only with heroui-native

## Project Architecture

This is a **monorepo with microservices architecture** using Turborepo:

```
zine/ (Monorepo Root)
├── apps/
│   ├── mobile/        # 📱 React Native Mobile App (PRIMARY PLATFORM)
│   └── web/           # 🌐 Vite SPA (Development Tool Only)
├── packages/
│   ├── api/           # Cloudflare Workers API (Hono + D1)
│   ├── shared/        # Shared Types & Services
│   └── design-system/ # Mobile-Only Design System (heroui-native)
```

## Technology Stack

### Mobile App (PRIMARY PLATFORM) 📱

- **Framework**: React Native 0.81 + Expo 54
- **Routing**: Expo Router 6
- **UI Components**: HeroUI Native (mobile-native components)
- **Styling**: NativeWind (Tailwind CSS for React Native)
- **State Management**: TanStack Query for server state
- **Authentication**: Clerk Expo
- **Type Safety**: TypeScript + Zod validation

### Backend (packages/api)

- **Runtime**: Cloudflare Workers
- **Framework**: Hono
- **Database**: D1 (Cloudflare's SQLite)
- **ORM**: Drizzle ORM
- **Deployment**: Wrangler
- **Authentication**: Clerk

### Design System (packages/design-system) - MOBILE ONLY

- **Platform**: React Native only (web support removed)
- **UI Library**: HeroUI Native (1.0.0-alpha.12)
- **Styling**: NativeWind + tailwind-variants
- **Components**: 13 mobile-native components
- **Export**: Single entry point `@zine/design-system`

### Shared Package (packages/shared)

- **Architecture**: Repository pattern with service layer
- **Validation**: Zod schemas for type safety
- **Business Logic**: Services with repository abstraction

### Web App (apps/web) - DEVELOPMENT TOOL ONLY ⚠️

- **Status**: Not actively maintained
- **Purpose**: Development and testing tool
- **Framework**: Vite SPA with React 19
- **Note**: May have build errors due to removed web design system support

## Package Manager

- **Always use `bun` instead of `npm`** for all package management and script execution
- Use `bun install` instead of `npm install`
- Use `bun run <script>` instead of `npm run <script>`
- Use `bun add <package>` instead of `npm install <package>`
- Use `bun remove <package>` instead of `npm uninstall <package>`

## Mobile Development Workflow

### Starting Mobile App

```bash
# Development mode
cd apps/mobile
bun run dev

# iOS (requires Mac + Xcode)
bun run ios

# Android (requires Android Studio)
bun run android
```

### Building Mobile App

```bash
cd apps/mobile

# Development build
bun run build:ios:development
bun run build:android:development

# Preview build
bun run build:ios:preview
bun run build:android:preview

# Production build (requires EAS configuration)
bun run build:ios:production
bun run build:android:production
```

## Design System (@zine/design-system) - MOBILE ONLY

### Architecture

- **Platform**: React Native only
- **Library**: HeroUI Native
- **No Web Support**: Web components have been removed
- **Components**: 13 files total (down from 139)

### Usage

```typescript
// Import components directly from design system
import { Button, Card, BookmarkCard, SubscriptionItem } from '@zine/design-system';

// All components are React Native compatible
<Button variant="primary" onPress={handlePress}>
  Save Bookmark
</Button>

<BookmarkCard
  title="Example Bookmark"
  url="https://example.com"
  onPress={handleBookmark}
/>
```

### Available Components

1. **Core Components**:
   - Button (re-exported from heroui-native)

2. **Pattern Components**:
   - BookmarkCard - Display bookmark items
   - SubscriptionItem - Display subscription content
   - FeedCard - Display feed items

3. **Providers**:
   - DesignSystemProvider - HeroUI Native provider

4. **Tokens**:
   - Design tokens (colors, typography, spacing)

5. **Utilities**:
   - cn() - className utilities

### Import Path

**Always use the default export:**
```typescript
import { ... } from '@zine/design-system';
```

**Do NOT use** (these no longer exist):
```typescript
import { ... } from '@zine/design-system/web';    // ❌ Removed
import { ... } from '@zine/design-system/native';  // ❌ Removed
```

## API Development

### Local Development

```bash
cd packages/api
bun run dev  # Starts local Cloudflare Workers dev server
```

### API Endpoints

All API endpoints use `/api/v1/` prefix:

- `GET /api/v1/bookmarks` - Get all bookmarks
- `GET /api/v1/bookmarks/:id` - Get bookmark by ID
- `POST /api/v1/bookmarks` - Create new bookmark
- `PUT /api/v1/bookmarks/:id` - Update bookmark
- `DELETE /api/v1/bookmarks/:id` - Delete bookmark
- `GET /api/v1/subscriptions` - Get user subscriptions
- `POST /api/v1/subscriptions` - Create subscription
- `GET /api/v1/feed` - Get feed items
- OAuth endpoints for Spotify/YouTube

## Database & ORM

- **Database**: Cloudflare D1 (SQLite)
- **ORM**: Drizzle ORM with Zod integration
- **Schema**: Located in `packages/api/src/schema.ts`
- **Config**: `packages/api/drizzle.config.ts`
- **Migrations**: Use `bun run db:generate` and `bun run db:migrate`

## Data Fetching (Mobile)

- **Always use TanStack Query** for all data fetching
- Create custom hooks for data fetching operations
- Place API functions in `apps/mobile/lib/api.ts`
- Place custom hooks in `apps/mobile/hooks/`

Example:
```typescript
// In apps/mobile/hooks/useBookmarks.ts
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export function useBookmarks() {
  return useQuery({
    queryKey: ['bookmarks'],
    queryFn: () => api.getBookmarks(),
  });
}

// In component
const { data: bookmarks, isLoading } = useBookmarks();
```

## Authentication

### Mobile App (Clerk Expo)

```typescript
import { ClerkProvider, useAuth } from '@clerk/clerk-expo';
import { tokenCache } from './lib/tokenCache';

// Wrap app with ClerkProvider
<ClerkProvider publishableKey={CLERK_KEY} tokenCache={tokenCache}>
  <App />
</ClerkProvider>

// Use auth in components
const { isSignedIn, userId } = useAuth();
```

### API Authentication

- Uses Clerk secret key for validation
- Middleware validates JWT tokens
- User ID extracted from token claims

## Environment Variables

### Mobile App Environment Variables

- **Naming Convention**: Prefix with `EXPO_PUBLIC_`
- **Local Development**: Use `.env.development` file
- **Files**: `.env.development`, `.env.preview`, `.env.production`

Example:
```bash
EXPO_PUBLIC_API_URL=https://api.myzine.app
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
```

### Backend Environment Variables (packages/api)

- **Local Development**: Use `.dev.vars` file (not committed to git)
- **Production**: Set through Cloudflare Workers dashboard
- **GitHub Actions**: Use `env` section in workflow

#### OAuth Setup (Required for Subscription Features)

To enable Spotify and YouTube account connections:

1. **Create OAuth Applications**:
   - **Spotify**: [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   - **YouTube**: [Google Cloud Console](https://console.developers.google.com)

2. **Configure Redirect URIs**:
   - **Development**: `http://localhost:8787/api/v1/auth/{provider}/callback`
   - **Production**: `https://api.myzine.app/api/v1/auth/{provider}/callback`

3. **Set Required Scopes**:
   - **Spotify**: `user-read-playback-position`, `user-library-read`
   - **YouTube**: `https://www.googleapis.com/auth/youtube.readonly`

4. **Required Environment Variables**:
   ```
   API_BASE_URL=http://localhost:8787
   SPOTIFY_CLIENT_ID=your_spotify_client_id
   SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
   YOUTUBE_CLIENT_ID=your_youtube_client_id
   YOUTUBE_CLIENT_SECRET=your_youtube_client_secret
   CLERK_SECRET_KEY=your_clerk_secret_key
   ```

## Development Workflow

### Monorepo Commands

```bash
# Start all services
bun dev

# Build all packages
bun build

# Type check all packages
bun type-check

# Lint all packages
bun lint

# Clean build artifacts
bun clean
```

### Mobile-Specific Commands

```bash
cd apps/mobile

# Development
bun run dev          # Start Expo dev server
bun run ios          # Run on iOS simulator
bun run android      # Run on Android emulator

# Building
bun run build:ios:preview
bun run build:android:preview
```

### API-Specific Commands

```bash
cd packages/api

# Development
bun run dev          # Start local dev server

# Database
bun run db:generate  # Generate migrations
bun run db:migrate   # Run migrations

# Deployment
bun run deploy       # Deploy to preview
bun run deploy:production  # Deploy to production
```

## Deployment

### Mobile App Deployment

- **Platform**: Expo Application Services (EAS)
- **Builds**: Configured in `eas.json`
- **Profiles**: development, preview, production

```bash
cd apps/mobile

# Build and submit to stores
eas build --platform ios --profile production
eas build --platform android --profile production

# Submit to stores
eas submit --platform ios
eas submit --platform android
```

### API Deployment

- **Platform**: Cloudflare Workers
- **Automatic**: GitHub Actions on push to main
- **Manual**: `bun run deploy:production`

### Web App Deployment (Optional)

- **Platform**: Cloudflare Pages
- **Status**: Tool only, not actively maintained
- **May fail**: Due to removed web design system support

## Deployment Guidelines

- **Do not run deploy scripts locally**
- **Always use GitHub CI/CD** for production deployments
- **Test in preview environment** before production

## Git Worktree Database Sync

When working with git worktrees, sync the database from main project:

```bash
# Run sync script
bun run sync-db

# Or manually
./scripts/sync-db-from-main.sh
```

This copies:
- `.wrangler/state` directory (D1 database)
- `local.db` and related WAL/SHM files

## Web App Status - IMPORTANT ⚠️

The web app is **NOT actively maintained**:

- **Purpose**: Development and testing tool only
- **Status**: May have build errors
- **Reason**: Web design system support removed (mobile-only)
- **Support**: No active development or bug fixes
- **Use Case**: Internal testing and API debugging only

**For production use, use the mobile app.**

## Current Status

- ✅ Mobile app (React Native) - Primary platform, actively developed
- ✅ API (Cloudflare Workers) - Fully functional
- ✅ Design system (heroui-native) - Mobile-only, simplified
- ✅ Authentication (Clerk) - Working for mobile and API
- ✅ Database (D1) - Production ready
- ⚠️ Web app - Development tool only, not maintained

## Project Statistics

- **Design System**: 13 files (down from 139) - 91% reduction
- **Dependencies**: 10 packages (down from 30) - 67% reduction
- **Focus**: 100% mobile-first development
- **Platforms**: React Native (primary), Web (tool only)

---

**Primary Development**: Mobile App (React Native)  
**Design System**: Mobile-only (heroui-native)  
**Web App**: Development tool (not maintained)