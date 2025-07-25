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
- ⚠️ Using mock data (InMemoryBookmarkRepository)
- 🔄 Ready to connect D1 database