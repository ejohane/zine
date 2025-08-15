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

## Design System (@zine/design-system)

### Architecture

The design system uses a **hybrid approach**: shadcn/ui for primitive components with custom Zine-specific patterns.

- **Location**: `packages/design-system/`
- **Build Tool**: tsup for bundling
- **Documentation**: Storybook on port 6006
- **Styling**: Tailwind CSS with CSS variables for theming
- **Components**: Radix UI primitives wrapped with shadcn/ui patterns

### Package Structure

```
packages/design-system/
├── src/
│   ├── tokens/              # Design tokens (colors, typography, spacing, breakpoints)
│   ├── components/
│   │   ├── ui/             # shadcn/ui components (Button, Card, Badge, etc.)
│   │   └── patterns/       # Zine-specific patterns (BookmarkCard, SubscriptionItem)
│   ├── lib/                # Utilities (cn function for className merging)
│   └── styles/             # Global CSS with Tailwind directives
├── .storybook/             # Storybook configuration
├── components.json         # shadcn/ui configuration
├── tailwind.config.ts      # Tailwind configuration with custom tokens
└── tsup.config.ts         # Build configuration
```

### Design Tokens

- **Colors**: Brand colors (primary), neutral scale, semantic colors (success/warning/error), platform colors (Spotify/YouTube/Apple/Google)
- **Typography**: Font families (sans/mono/display), size scale (xs to 6xl), weights, letter spacing
- **Spacing**: Consistent spacing scale from 0 to 32 (0px to 128px)
- **Breakpoints**: Mobile-first responsive breakpoints (sm: 640px, md: 768px, lg: 1024px, xl: 1280px, 2xl: 1536px)

### Component Categories

1. **UI Components** (from shadcn/ui):
   - Primitives: Button, Input, Label
   - Layout: Card, Separator
   - Feedback: Badge, Skeleton
   - Overlay: Dialog, Dropdown Menu
   - Navigation: Tabs
   - Display: Avatar

2. **Zine-Specific Patterns**:
   - `BookmarkCard`: Display bookmarks with platform-specific styling
   - `SubscriptionItem`: Display subscription content (podcasts, videos)

### Usage in Web App

```typescript
// Import components and utilities
import { Button, Card, BookmarkCard, cn, tokens } from '@zine/design-system';

// Use components in your app
<Button variant="primary" size="md">Click me</Button>
<BookmarkCard {...bookmarkProps} />

// Access design tokens
const primaryColor = tokens.colors.primary[500];
const spacing = tokens.spacing[4];
```

### Development Commands

```bash
# Development with watch mode
cd packages/design-system
bun run dev

# Run Storybook for component development
bun run storybook

# Build the package
bun run build

# Add new shadcn component
bun run add-component
# or
npx shadcn@latest add [component-name]

# Type checking
bun run type-check
```

### Adding New Components

1. **For shadcn/ui components**: Use `npx shadcn@latest add [component]`
2. **For custom patterns**: Create in `src/components/patterns/`
3. **Always export from `src/index.ts`**
4. **Create Storybook stories for documentation**

### Styling Approach

- **Tailwind CSS**: Primary styling method
- **CSS Variables**: For theming support (defined in globals.css)
- **class-variance-authority (CVA)**: For component variants
- **tailwind-merge + clsx**: For conditional className handling via `cn()` utility

### Platform Support Strategy

- **Web**: Primary target, full component library
- **Mobile (Future)**: React Native variants in `components/mobile/`
- **Desktop (Future)**: Electron/Tauri enhancements

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