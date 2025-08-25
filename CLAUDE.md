# Claude Development Guidelines

## Project Architecture

This is a **monorepo with microservices architecture** using Turborepo:

```
zine/ (Monorepo Root)
├── apps/
│   └── web/           # Vite SPA Frontend (React + TanStack Router)
├── packages/
│   ├── api/           # Cloudflare Workers API (Hono + D1)
│   └── shared/        # Shared Types & Services (Repository Pattern)
```

## Technology Stack

### Frontend (apps/web)

- **Framework**: Vite SPA with React 18
- **Routing**: TanStack Router (client-side routing)
- **State Management**: TanStack Query for server state
- **Styling**: Tailwind CSS + Radix UI components
- **Type Safety**: TypeScript + Zod validation

### Backend (packages/api)

- **Runtime**: Cloudflare Workers
- **Framework**: Hono
- **Database**: D1 (Cloudflare's SQLite)
- **ORM**: Drizzle ORM
- **Deployment**: Wrangler

### Shared Package (packages/shared)

- **Architecture**: Repository pattern with service layer
- **Validation**: Zod schemas for type safety
- **Business Logic**: BookmarkService with repository abstraction

## Package Manager

- **Always use `bun` instead of `npm`** for all package management and script execution
- Use `bun install` instead of `npm install`
- Use `bun run <script>` instead of `npm run <script>`
- Use `bun add <package>` instead of `npm install <package>`
- Use `bun remove <package>` instead of `npm uninstall <package>`

## Data Fetching Rules

- **Always use TanStack Query for all data fetching in the UI**
- Create custom hooks for data fetching operations (e.g., `useBookmarks`)
- Use the `useQuery` hook for GET requests
- Place API functions in `apps/web/src/lib/api.ts`
- Place custom hooks in `apps/web/src/hooks/`
- All data operations go through the shared `bookmarkService` from `@zine/shared`

## Repository Pattern

The shared package uses a repository pattern:

- `BookmarkRepository` interface defines the contract
- `InMemoryBookmarkRepository` (current) for mock data
- `BookmarkService` provides business logic
- Easy to swap repositories (e.g., for D1 database)

## API Endpoints

All API endpoints are in `packages/api/src/index.ts` with `/api/v1/` prefix:

- `GET /api/v1/bookmarks` - Get all bookmarks
- `GET /api/v1/bookmarks/:id` - Get bookmark by ID
- `POST /api/v1/bookmarks` - Create new bookmark
- `PUT /api/v1/bookmarks/:id` - Update bookmark
- `DELETE /api/v1/bookmarks/:id` - Delete bookmark

## Database & ORM

- **Database**: Cloudflare D1 (SQLite)
- **ORM**: Drizzle ORM with Zod integration
- **Schema**: Located in `packages/api/src/schema.ts`
- **Config**: `packages/api/drizzle.config.ts`
- **Migrations**: Use `bun run db:generate` and `bun run db:migrate`

## Component Architecture

- **UI Components**: Located in `apps/web/src/components/ui/`
- **Base**: Radix UI primitives
- **Styling**: Tailwind CSS with `class-variance-authority`
- **Utilities**: `clsx` and `tailwind-merge` for conditional classes

## Development Workflow

- **Monorepo**: Use `turbo dev` to run all services
- **Frontend Only**: `cd apps/web && bun run dev`
- **API Only**: `cd packages/api && bun run dev`
- **Type Checking**: `turbo type-check` for all packages
- **Building**: `turbo build` for production builds

## Deployment

- **Frontend**: Cloudflare Workers (SPA)
- **API**: Cloudflare Workers
- **Database**: Cloudflare D1
- **Commands**: `turbo deploy` (staging) or `turbo deploy:production`

## Environment Variables

### Frontend Environment Variables (apps/web)

- **Naming Convention**: All frontend environment variables must be prefixed with `VITE_`
- **Local Development**: Use `.env.local` for local development environment variables
- **Production**: Environment variables are handled through GitHub Actions during deployment

### GitHub Actions Environment Variable Setup

Due to limitations with how Vite handles environment variables in GitHub Actions, the following process is required:

1. **Add secrets to GitHub repository** under Settings → Secrets and variables → Actions
2. **Install dotenv-cli** as a dev dependency: `bun add -D dotenv-cli`
3. **Create .env file during build process** in GitHub Actions workflow:
   ```yaml
   - name: Build Web App (Production)
     run: |
       echo "VITE_YOUR_VAR=$VITE_YOUR_VAR" > .env.production
       bunx dotenv-cli -e .env.production -- bun run build
     working-directory: apps/web
     env:
       VITE_YOUR_VAR: ${{ secrets.VITE_YOUR_VAR }}
   ```

### Backend Environment Variables (packages/api)

- **Local Development**: Use `.dev.vars` file (not committed to git)
- **Production**: Environment variables are set through Cloudflare Workers dashboard or wrangler.toml
- **GitHub Actions**: Use `env` section in workflow for deployment secrets

#### OAuth Setup (Required for Subscription Features)

To enable Spotify and YouTube account connections:

1. **Create OAuth Applications**:
   - **Spotify**: Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and create a new app
   - **YouTube**: Go to [Google Cloud Console](https://console.developers.google.com) and create a new project with YouTube Data API v3 enabled

2. **Configure Redirect URIs**:
   - **Development**: `http://localhost:8787/api/v1/auth/{provider}/callback`
   - **Production**: `https://api.myzine.app/api/v1/auth/{provider}/callback`

3. **Set Required Scopes**:
   - **Spotify**: `user-read-playback-position`, `user-library-read`
   - **YouTube**: `https://www.googleapis.com/auth/youtube.readonly`

4. **Local Development Setup**:
   ```bash
   cd packages/api
   cp .dev.vars.example .dev.vars
   # Edit .dev.vars with your OAuth credentials
   ```

5. **Required Environment Variables**:
   ```
   API_BASE_URL=http://localhost:8787
   SPOTIFY_CLIENT_ID=your_spotify_client_id
   SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
   YOUTUBE_CLIENT_ID=your_youtube_client_id
   YOUTUBE_CLIENT_SECRET=your_youtube_client_secret
   ```

### Important Notes

- **Security**: Never commit actual environment variable values to git
- **Prefixes**: Frontend variables must use `VITE_` prefix, backend variables don't need prefixes
- **GitHub Actions**: Standard `env` section in GitHub Actions doesn't work directly with Vite builds - must use dotenv-cli workaround

## Deployment Guidelines

- **Do not run deploy scripts locally, always go through github ci/cd**

## Current Status

- ✅ Frontend SPA with TanStack Router
- ✅ API with full CRUD endpoints
- ✅ Shared types and business logic
- ✅ Authentication with Clerk
- ✅ OAuth Integration (Spotify & YouTube)
- ✅ Subscription Discovery & Management
- ⚠️ Using mock data (InMemoryBookmarkRepository)
- 🔄 Ready to connect D1 database

## Unified Design System Architecture

### Overview

The Zine design system has been unified across web and mobile platforms using:
- **@zine/design-tokens**: Centralized design tokens (colors, spacing, typography)
- **@zine/ui**: Cross-platform component library supporting both React and React Native
- **NativeWind v4**: Enables Tailwind CSS classes in React Native

### Package Structure

```
packages/
├── design-tokens/           # Design tokens package
│   ├── src/
│   │   ├── colors.ts       # Color palette
│   │   ├── spacing.ts      # Spacing scale
│   │   ├── typography.ts   # Font system
│   │   ├── shadows.ts      # Shadow definitions
│   │   ├── borders.ts      # Border styles
│   │   └── breakpoints.ts  # Responsive breakpoints
│   └── tailwind.config.js  # Unified Tailwind configuration
│
├── ui/                      # Cross-platform component library
│   ├── src/
│   │   ├── components/     # UI components
│   │   │   ├── Alert/      # Alert & AlertDescription
│   │   │   ├── Badge/      # Badge component
│   │   │   ├── Button/     # Button with variants
│   │   │   ├── Card/       # Card & subcomponents
│   │   │   ├── Checkbox/   # Checkbox component
│   │   │   ├── Input/      # Input with validation
│   │   │   └── Text/       # Typography component
│   │   ├── lib/
│   │   │   ├── platform.ts # Platform detection
│   │   │   ├── cn.ts       # className merging
│   │   │   └── variants.ts # CVA variants
│   │   └── providers/
│   │       └── ThemeProvider.tsx # Theme management
│   └── tsup.config.ts      # Build configuration
│
└── design-system/           # Legacy (will be deprecated)
```

### Design Tokens (@zine/design-tokens)

#### Color System
- **Brand Colors**: Zine orange (#ff6b35) as primary
- **Neutral Scale**: 0 (white) to 1000 (black)
- **Semantic Colors**: Success, warning, error, info
- **Platform Colors**: Spotify, YouTube, Apple, Google, RSS, Podcast

#### Typography
- **Font Families**: Inter (sans), JetBrains Mono (mono)
- **Font Sizes**: xs (12px) to 6xl (60px)
- **Font Weights**: 100-900
- **Line Heights**: Optimized for readability

#### Spacing
- **Scale**: 0px to 384px (0-96 in Tailwind units)
- **Consistent increments**: Follows 4px base unit

### Cross-Platform Components (@zine/ui)

All components work on both web and React Native:

```typescript
// Import components
import { 
  Button, 
  Card, 
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge, 
  Input, 
  Text, 
  Alert,
  AlertDescription,
  Checkbox,
  ThemeProvider 
} from '@zine/ui';

// Use with consistent API
<Button variant="primary" size="md" onPress={handlePress}>
  Click me
</Button>

<Card variant="elevated">
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>
    Content here
  </CardContent>
</Card>
```

### Platform Detection

Components automatically adapt to the platform:

```typescript
// In @zine/ui components
import { isReactNative, isWeb, isIOS, isAndroid } from '@zine/ui/lib/platform';

if (isReactNative()) {
  // React Native specific code
  return <TouchableOpacity />;
} else {
  // Web specific code
  return <button />;
}
```

### Theme System

#### ThemeProvider
Supports light/dark/system themes across all platforms:

```typescript
// Web app (main.tsx)
import { ThemeProvider } from '@zine/ui';

<ThemeProvider>
  <App />
</ThemeProvider>

// Mobile app (_layout.tsx)
import { ThemeProvider } from '@zine/ui';

<ThemeProvider>
  <Stack />
</ThemeProvider>
```

#### Using Theme
```typescript
import { useTheme } from '@zine/ui';

const { theme, resolvedTheme, setTheme } = useTheme();
// theme: 'light' | 'dark' | 'system'
// resolvedTheme: 'light' | 'dark' (actual theme being used)
// setTheme: function to change theme
```

### Tailwind Configuration

Both apps extend from the unified token system:

```javascript
// apps/web/tailwind.config.js or apps/mobile/zine/tailwind.config.js
const designTokens = require('@zine/design-tokens/tailwind.config');

module.exports = {
  ...designTokens,
  content: [
    './src/**/*.{ts,tsx}',
    '../../../packages/ui/src/**/*.{ts,tsx}', // Include UI package
  ],
};
```

### Mobile App Setup (NativeWind)

```javascript
// metro.config.js
const { withNativeWind } = require('nativewind/metro');
module.exports = withNativeWind(config, { input: './src/styles/global.css' });

// babel.config.js
plugins: ['nativewind/babel']

// Global CSS import in _layout.tsx
import '../src/styles/global.css';
```

### Development Commands

```bash
# Build all packages
bun run build

# Type check everything
bun run type-check

# Development mode
turbo dev

# Build specific package
cd packages/ui && bun run build

# Add new dependencies
cd packages/ui && bun add [package-name]
```

### Adding New Components

1. Create component in `packages/ui/src/components/[ComponentName]/`
2. Use platform detection for cross-platform support
3. Apply design tokens for styling
4. Export from `packages/ui/src/index.ts`
5. Test on both web and mobile

Example structure:
```typescript
// packages/ui/src/components/MyComponent/index.tsx
import { isReactNative } from '../../lib/platform';

export function MyComponent({ className, ...props }) {
  if (isReactNative()) {
    // React Native implementation
    return <View className={className} {...props} />;
  }
  // Web implementation
  return <div className={className} {...props} />;
}
```

### Migration Notes

- **@zine/design-system**: Legacy package, will be deprecated
- **Local UI components**: Migrated to @zine/ui
- **Tamagui**: Completely removed from mobile app
- **NativeWind v4**: Enables Tailwind classes in React Native
- **Theme consistency**: Both platforms use same ThemeProvider

## Git Worktree Database Sync

When working with git worktrees, you need to sync the database from the main project to avoid "no such table" errors.

### Syncing Database for Worktrees

The main project is located at `/Users/erikjohansson/dev/2025/zine`. When creating or switching to a worktree branch:

1. **Run the sync script**:
   ```bash
   bun run sync-db
   # or
   ./scripts/sync-db-from-main.sh
   ```

2. **What it does**:
   - Copies the `.wrangler/state` directory (contains D1 database)
   - Copies `local.db` and related WAL/SHM files
   - Preserves all database tables and data from the main project

3. **When to use**:
   - After creating a new worktree
   - When encountering "no such table" errors
   - After database schema changes in the main project

The sync script is idempotent and safe to run multiple times.