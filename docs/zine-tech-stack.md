# Zine - Tech Stack

## Overview

This document defines the technology choices for the Zine application. It serves as the authoritative reference for all implementation decisions.

---

## Monorepo & Tooling

| Tool          | Version | Purpose                                            |
| ------------- | ------- | -------------------------------------------------- |
| **Turborepo** | latest  | Monorepo build system, task orchestration, caching |
| **Bun**       | latest  | Package manager, runtime                           |

### Turborepo Key Features

- **Remote Caching**: Share build artifacts across CI/team machines (over 4M compute hours saved across users)
- **Task Parallelization**: Maximizes CPU utilization across all available cores
- **Incremental Adoption**: Works with existing `package.json` scripts
- **Package Manager Agnostic**: Works with npm, yarn, pnpm, or bun

### Monorepo Structure

```
zine/
├── apps/
│   ├── mobile/                    # Expo React Native app
│   │   ├── app/                   # Expo Router file-based routes
│   │   │   ├── (tabs)/            # Tab navigator group
│   │   │   │   ├── _layout.tsx    # Tab navigator configuration
│   │   │   │   ├── index.tsx      # Home tab (re-entry & discovery)
│   │   │   │   ├── inbox.tsx      # Inbox tab (decision queue)
│   │   │   │   └── library.tsx    # Library tab (long-term memory)
│   │   │   ├── item/
│   │   │   │   └── [id].tsx       # Item detail screen
│   │   │   ├── _layout.tsx        # Root layout
│   │   │   └── +not-found.tsx     # 404 handler
│   │   ├── components/            # Reusable UI components
│   │   │   ├── ui/                # Base components (Button, Card, etc.)
│   │   │   ├── inbox/             # Inbox-specific components
│   │   │   ├── library/           # Library-specific components
│   │   │   └── home/              # Home-specific components
│   │   ├── hooks/                 # Custom React hooks
│   │   │   ├── use-items.ts       # Item data hooks
│   │   │   ├── use-items-trpc.ts  # tRPC-based item queries
│   │   │   └── use-connections.ts # Provider connection hooks
│   │   ├── lib/                   # Client utilities
│   │   │   ├── trpc.ts            # tRPC client setup
│   │   │   ├── oauth.ts           # OAuth PKCE flow
│   │   │   └── auth.ts            # Clerk auth helpers
│   │   ├── assets/                # Static assets (images, fonts)
│   │   ├── app.json               # Expo configuration
│   │   ├── tailwind.config.js     # Uniwind/Tailwind configuration
│   │   ├── tsconfig.json          # TypeScript configuration
│   │   └── package.json
│   │
│   └── worker/                    # Cloudflare Workers backend
│       ├── src/
│       │   ├── index.ts           # Hono app entry point
│       │   ├── routes/            # API route handlers
│       │   │   ├── auth.ts        # Clerk webhook handlers
│       │   │   └── sources.ts     # Source management endpoints
│       │   ├── trpc/              # tRPC API layer
│       │   │   ├── router.ts      # Root router
│       │   │   ├── context.ts     # Request context
│       │   │   └── routers/       # Domain routers
│       │   │       ├── items.ts
│       │   │       ├── connections.ts
│       │   │       └── subscriptions.ts
│       │   ├── db/                # Database layer
│       │   │   ├── schema.ts      # Drizzle schema definitions
│       │   │   ├── index.ts       # DB client setup
│       │   │   └── migrations/    # D1 migrations
│       │   ├── ingestion/         # Ingestion pipeline
│       │   │   ├── index.ts       # Batch ingestion orchestration
│       │   │   ├── processor.ts   # Item processing
│       │   │   └── transformers.ts # Provider data transformers
│       │   ├── providers/         # Provider API clients
│       │   │   ├── youtube.ts     # YouTube Data API
│       │   │   ├── youtube-quota.ts # Quota tracking
│       │   │   └── spotify.ts     # Spotify Web API
│       │   ├── polling/           # Background sync
│       │   │   ├── scheduler.ts   # Cron-based polling
│       │   │   └── adaptive.ts    # Adaptive poll intervals
│       │   ├── lib/               # Server utilities
│       │   │   ├── auth.ts        # Clerk token validation
│       │   │   ├── crypto.ts      # Token encryption (AES-256-GCM)
│       │   │   └── locks.ts       # Distributed locking
│       │   └── middleware/        # Hono middleware
│       │       └── auth.ts        # Authentication middleware
│       ├── wrangler.toml          # Cloudflare Workers configuration
│       ├── drizzle.config.ts      # Drizzle ORM configuration
│       ├── tsconfig.json
│       └── package.json
│
├── packages/
│   └── shared/                    # Shared code across apps
│       ├── src/
│       │   ├── types/             # TypeScript type definitions
│       │   │   ├── domain.ts      # Domain models (Item, Source, etc.)
│       │   │   └── index.ts       # Type exports
│       │   ├── schemas/           # Zod validation schemas
│       │   │   └── index.ts
│       │   └── constants/         # Shared constants
│       │       └── index.ts
│       ├── tsconfig.json
│       └── package.json
│
├── turbo.json                     # Turborepo pipeline configuration
├── package.json                   # Root package.json (workspaces)
├── bun.lockb                      # Bun lockfile
├── tsconfig.base.json             # Shared TypeScript base config
├── .eslintrc.js                   # ESLint configuration
├── .prettierrc                    # Prettier configuration
└── .github/
    └── workflows/
        └── ci.yml                 # GitHub Actions CI pipeline
```

---

## Language

| Tool           | Configuration | Purpose                         |
| -------------- | ------------- | ------------------------------- |
| **TypeScript** | strict mode   | Type safety across all packages |

### TypeScript Configuration

- `strict: true` in all `tsconfig.json` files
- Shared types in `packages/shared` for API contracts and domain models

---

## Mobile App

| Tool              | Version      | Purpose                                        |
| ----------------- | ------------ | ---------------------------------------------- |
| **Expo**          | SDK 54       | React Native framework (released Sep 2025)     |
| **Expo Router**   | v3+          | File-based navigation with API routes          |
| **HeroUI Native** | 1.0.0-beta.8 | Component library                              |
| **Uniwind**       | 1.0.0+       | Tailwind CSS for React Native (reached 1.0.0!) |
| **Heroicons**     | latest       | Icon library (via react-native-heroicons)      |

### Expo SDK 54 Notes (Current Latest - Sep 2025)

- React Native 0.80 support
- Supports Xcode 26 beta for iOS builds
- EAS Workflows for CI/CD (GitHub build triggers deprecated)
- EAS Hosting available for web deployments
- Consider SDK 53 for stability (April 2025 release)

### HeroUI Native Notes

HeroUI Native is in active beta development with frequent releases. Key features in recent versions:

- **Toast System** (beta.4+): Built-in toast primitives with gestures and animations
- **Tabs Component** (alpha.16+): Animated tab indicators with scrollable support
- **Select Component** (alpha.15+): Popover and dialog presentation variants
- **Animation Settings Context** (beta.5+): Global animation configuration
- **Pressable Feedback** (beta.3+): Ripple and highlight animation effects

### HeroUI Native Dependencies

These are required peer dependencies:

- `react-native-screens`
- `react-native-reanimated`
- `react-native-safe-area-context`
- `react-native-svg`
- `react-native-gesture-handler`
- `@gorhom/bottom-sheet`
- `tailwind-variants` (3.2.2+)
- `tailwind-merge`

### Uniwind Notes

Uniwind reached 1.0.0 stable release. Key features:

- Fastest Tailwind bindings for React Native
- Migration path from NativeWind available
- Monorepo support built-in
- Theming system with CSS variables
- `useUniwind`, `withUniwind`, `useResolveClassNames` hooks

### Navigation Structure

```
app/
├── (tabs)/
│   ├── _layout.tsx      # Tab navigator with Home, Inbox, Library tabs
│   ├── index.tsx        # Home – re-entry & discovery surface
│   ├── inbox.tsx        # Inbox – decision queue for triage
│   └── library.tsx      # Library – long-term bookmark storage
├── item/
│   └── [id].tsx         # Item detail (bookmark or inbox item)
├── _layout.tsx          # Root layout (Clerk provider, tRPC, theme)
└── +not-found.tsx       # 404 fallback
```

---

## Backend

| Tool                   | Purpose                                          |
| ---------------------- | ------------------------------------------------ |
| **Cloudflare Workers** | API endpoints, ingestion pipeline, cron triggers |
| **Cloudflare D1**      | SQLite database (managed)                        |
| **Hono**               | Worker routing and middleware                    |
| **tRPC**               | Type-safe API layer                              |
| **Drizzle ORM**        | TypeScript-first ORM for D1                      |
| **Zod**                | Request/response validation                      |

### Cloudflare D1 Notes

D1 is Cloudflare's managed SQLite database:

- **SQL at the Edge**: SQLite database accessible from Workers
- **Automatic Replication**: Global read replicas for low-latency reads
- **Drizzle Integration**: First-class TypeScript ORM support
- **Migrations**: Schema migrations via Drizzle Kit

### tRPC Notes

tRPC provides end-to-end type safety between client and server:

- **Type Inference**: Client types derived from server router
- **React Query Integration**: Built-in hooks with caching
- **Optimistic Updates**: Easy rollback on mutation failure
- **Batching**: Automatic request batching via `httpBatchLink`

### Hono Framework Notes

Hono is ultrafast and lightweight (~14KB minified with `hono/tiny`):

- **Multi-runtime**: Same code runs on CF Workers, Deno, Bun, Node.js
- **RegExpRouter**: Fastest router in the JS ecosystem
- **Built-in Middleware**: JWT, CORS, Logger, Cache, ETag, etc.
- **TypeScript-first**: Full type inference for routes and handlers
- **RPC Mode**: Type-safe client-server communication with Zod

Used in production by: Cloudflare D1, Cloudflare Workers KV, cdnjs, Clerk, Unkey

### Backend Responsibilities

- tRPC API endpoints (items, subscriptions, connections)
- OAuth callbacks for content providers (YouTube, Spotify)
- Clerk auth webhooks
- Ingestion pipeline (cron-triggered)
- Provider API proxying

---

## Data & State Management

| Tool              | Purpose                       |
| ----------------- | ----------------------------- |
| **Cloudflare D1** | Authoritative SQLite storage  |
| **Drizzle ORM**   | Type-safe database queries    |
| **React Query**   | Client-side caching and state |
| **tRPC React**    | Type-safe API hooks           |

### Data Flow

```
Mobile App (React Query cache)
    ↓ tRPC queries/mutations
Cloudflare Worker (Hono + tRPC)
    ↓ Drizzle ORM
Cloudflare D1 (SQLite)
```

### Client Data Strategy

- **React Query**: Handles caching, refetching, and background updates
- **Optimistic Updates**: Mutations update cache immediately, rollback on error
- **Stale-While-Revalidate**: Show cached data while fetching fresh data
- **Cache Invalidation**: Automatic invalidation after mutations

### Key Patterns

```typescript
// Optimistic update example
const bookmark = trpc.items.bookmark.useMutation({
  onMutate: async ({ id }) => {
    await utils.items.inbox.cancel();
    const previous = utils.items.inbox.getData();
    utils.items.inbox.setData(undefined, (old) => ({
      ...old,
      items: old?.items.filter((item) => item.id !== id) ?? [],
    }));
    return { previous };
  },
  onError: (err, vars, context) => {
    utils.items.inbox.setData(undefined, context?.previous);
  },
  onSettled: () => {
    utils.items.inbox.invalidate();
    utils.items.library.invalidate();
  },
});
```

---

## Authentication

| Tool      | Purpose                                       |
| --------- | --------------------------------------------- |
| **Clerk** | Authentication, user management, social login |

### Clerk Recent Features (Dec 2025)

- **API Keys** (Public Beta): Let users create API keys for programmatic access
  - Usage-based pricing post-beta: $0.001/creation, $0.0001/verification
- **Android Prebuilt Components**: `AuthView`, `UserButton`, `UserProfileView`
- **Vercel SSO Provider**: Sign in with Vercel accounts
- **Organization Roles/Permissions API**: Full RBAC management via Backend API
- **Debug Logs**: Enterprise SSO connection diagnostics

### Auth Flow

- Clerk handles sign-up, sign-in, social providers
- User ID from Clerk used to scope all data in D1
- Session tokens validated on Worker via JWKS
- `authMiddleware()` for route protection

---

## Testing

### Mobile App (`apps/mobile`)

| Tool                             | Purpose                      |
| -------------------------------- | ---------------------------- |
| **Jest**                         | Unit and integration testing |
| **React Native Testing Library** | Component testing            |
| **Detox**                        | End-to-end testing           |

#### Mobile Testing Considerations

- Expo SDK 54 has EAS Workflows integration for CI testing
- Consider `@testing-library/react-native` for component tests
- Detox requires native builds; use EAS Build for CI

### Worker (`apps/worker`)

| Tool                                | Purpose                                                |
| ----------------------------------- | ------------------------------------------------------ |
| **Vitest**                          | Unit and integration testing (recommended for Workers) |
| **@cloudflare/vitest-pool-workers** | Cloudflare Workers test environment                    |
| **Miniflare**                       | Local Workers/DO simulation for integration tests      |

#### tRPC Route Tests

Test tRPC procedures using Vitest with the Workers pool:

```typescript
// apps/worker/src/trpc/routers/items.test.ts
import { env, createExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import app from '../index';

describe('items router', () => {
  it('GET /trpc/items.inbox returns items', async () => {
    const req = new Request('http://localhost/trpc/items.inbox', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mockAuthToken('user-123')}`,
      },
    });
    const ctx = createExecutionContext();
    const res = await app.fetch(req, env, ctx);
    expect(res.status).toBe(200);
  });
});
```

#### D1 Database Integration Tests

Test database operations using Miniflare's D1 bindings:

```typescript
// apps/worker/src/db/schema.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { drizzle } from 'drizzle-orm/d1';
import { users, items, userItems } from './schema';

describe('Database schema', () => {
  it('creates and queries items', async () => {
    const db = drizzle(env.DB);

    // Insert test user
    await db.insert(users).values({
      id: 'user-123',
      email: 'test@example.com',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Insert item
    await db.insert(items).values({
      id: 'item-1',
      contentType: 'VIDEO',
      provider: 'YOUTUBE',
      providerId: 'abc123',
      canonicalUrl: 'https://youtube.com/watch?v=abc123',
      title: 'Test Video',
      creator: 'Test Channel',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Query items
    const result = await db.select().from(items);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Test Video');
  });
});
```

#### tRPC Integration Tests

End-to-end tests validating the full tRPC flow:

```typescript
// apps/worker/src/integration/trpc.test.ts
import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../index';

describe('tRPC integration', () => {
  it('bookmark mutation moves item to library', async () => {
    const userID = 'user-123';

    // Bookmark an item
    const bookmarkReq = new Request('http://localhost/trpc/items.bookmark', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mockAuthToken(userID)}`,
      },
      body: JSON.stringify({ id: 'item-1' }),
    });
    const bookmarkRes = await app.fetch(bookmarkReq, env);
    expect(bookmarkRes.status).toBe(200);

    // Verify item is in library
    const libraryReq = new Request('http://localhost/trpc/items.library', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mockAuthToken(userID)}`,
      },
    });
    const libraryRes = await app.fetch(libraryReq, env);
    const libraryData = await libraryRes.json();

    expect(libraryData.result.data.items).toContainEqual(expect.objectContaining({ id: 'item-1' }));
  });
});
```

#### Vitest Configuration for Workers

```typescript
// apps/worker/vitest.config.ts
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          d1Databases: ['DB'],
          kvNamespaces: ['OAUTH_STATE_KV', 'WEBHOOK_IDEMPOTENCY'],
        },
      },
    },
  },
});
```

#### Worker Testing Considerations

- Use `@cloudflare/vitest-pool-workers` for accurate Workers runtime behavior
- Miniflare provides isolated D1 database per test
- Mock Clerk auth tokens for authenticated route tests
- Test cron-triggered ingestion flows
- Consider snapshot testing for complex tRPC responses

---

## CI/CD

| Tool               | Purpose                                            |
| ------------------ | -------------------------------------------------- |
| **GitHub Actions** | Linting, type-checking, tests, Worker deployments  |
| **Wrangler**       | Cloudflare Workers CLI for deployments             |
| **EAS Build**      | Native iOS/Android builds                          |
| **EAS Workflows**  | Expo-native CI/CD (replaces GitHub build triggers) |

### Pipeline Stages

#### Shared (all packages)

1. Lint (ESLint)
2. Format check (Prettier)
3. Type check (TypeScript)

#### Mobile App (`apps/mobile`)

4. Unit tests (Jest)
5. E2E tests (Detox via EAS)
6. EAS Build (production builds)

#### Worker (`apps/worker`)

4. Unit tests (Vitest recommended for Workers)
5. Deploy to staging (on PR)
6. Deploy to production (on merge to main)

### GitHub Actions Workflow Structure

```yaml
# .github/workflows/ci.yml
jobs:
  lint-and-typecheck:
    # Runs on all PRs and pushes to main
    # Uses Turborepo for caching and parallelization

  worker-deploy-staging:
    # Runs on PRs targeting main
    # Deploys to Cloudflare staging environment
    # Uses wrangler deploy --env staging

  worker-deploy-production:
    # Runs on push to main only
    # Deploys to Cloudflare production
    # Uses wrangler deploy --env production

  mobile-eas-build:
    # Triggered via EAS Workflows or manually
    # Handles iOS/Android native builds
```

### Cloudflare Workers Deployment

#### Environment Strategy

- **Staging**: Auto-deploy on PR, uses `--env staging` in wrangler
- **Production**: Deploy on merge to main, uses `--env production`
- **Preview**: Optional per-PR preview URLs via Cloudflare Pages (if needed)

#### Wrangler Configuration

Configure environments in `apps/worker/wrangler.toml`:

```toml
[env.staging]
name = "zine-worker-staging"
# Staging-specific bindings

[env.production]
name = "zine-worker-production"
# Production-specific bindings
```

#### Required GitHub Secrets

- `CLOUDFLARE_API_TOKEN` - API token with Workers edit permissions
- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID

#### D1 Migration Considerations

- D1 migrations managed via Drizzle Kit
- Test migrations in staging before production
- Migrations stored in `apps/worker/src/db/migrations/`
- Use `wrangler d1 migrations apply` for deployment

### EAS Workflows Notes (Oct 2025+)

GitHub build triggers are deprecated in favor of EAS Workflows:

- Cron scheduling for automated builds
- TestFlight job type for iOS distribution
- GitHub comment integration for PR feedback
- Slack notifications

---

## Code Quality

| Tool         | Purpose         |
| ------------ | --------------- |
| **ESLint**   | Code linting    |
| **Prettier** | Code formatting |

---

## Deferred Decisions

The following decisions are intentionally deferred until complexity demands them:

| Category                    | Current Approach         | Revisit When                                         |
| --------------------------- | ------------------------ | ---------------------------------------------------- |
| State Management            | React Context + useState | UI state becomes complex (consider Zustand or Jotai) |
| Forms & Validation          | useState                 | Form complexity grows (consider React Hook Form)     |
| Monitoring & Error Tracking | None                     | Before production launch (consider Sentry via Expo)  |
| Analytics                   | None                     | Have users to analyze (EAS Insights available)       |

---

## Content Providers (Future)

These providers will be integrated for source subscriptions:

- YouTube (videos, channels)
- Spotify (podcasts)
- RSS feeds
- Substack (newsletters)
- X (posts)

Each provider requires OAuth integration and API access.

---

## Version Pinning

For stability, pin these critical dependencies:

```json
{
  "expo": "~54.0.0",
  "heroui-native": "1.0.0-beta.8",
  "react-native-reanimated": "~4.1.1",
  "react-native-screens": "~4.16.0",
  "react-native-safe-area-context": "~5.6.0",
  "react-native-svg": "15.12.1",
  "uniwind": "^1.0.0",
  "tailwind-variants": "^3.2.2"
}
```

### Version Update Cadence

- **Expo SDK**: Update within 1-2 months of new SDK release after community stabilization
- **HeroUI Native**: Track beta releases closely; expect breaking changes until 1.0.0
- **Clerk**: Follow changelog for security patches; major updates can wait

---

## Security Considerations

- **Clerk**: Keep SDKs updated for security patches
- **Expo**: Recent React Server Components vulnerability patches (Dec 2025) - stay current
- **D1/Drizzle**: Use parameterized queries (Drizzle handles this automatically)
- **OAuth Tokens**: Encrypted with AES-256-GCM before storage
- **API Keys**: If using Clerk API Keys, implement proper scope validation

---

## References

- [Turborepo Docs](https://turbo.build/repo/docs)
- [Expo Docs](https://docs.expo.dev/)
- [Expo Changelog](https://expo.dev/changelog)
- [HeroUI Native](https://github.com/heroui-inc/heroui-native)
- [Uniwind Docs](https://docs.uniwind.dev/)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [Drizzle ORM](https://orm.drizzle.team/)
- [tRPC Docs](https://trpc.io/docs)
- [Hono Docs](https://hono.dev/)
- [Clerk Docs](https://clerk.com/docs)
- [Clerk Changelog](https://clerk.com/changelog)
- [Heroicons](https://heroicons.com/)
