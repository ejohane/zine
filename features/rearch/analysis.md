# Backend Rearchitecture Analysis

## Executive Summary

This document analyzes the code that needs to be removed as part of migrating from the current **Replicache + Durable Objects + SQLite** architecture to a simpler **Cloudflare + Hono + tRPC + D1 + Drizzle** stack.

### Current Architecture (To Be Removed)

- **Replicache**: Client-side sync library with optimistic mutations
- **Durable Objects**: Per-user backend storage with embedded SQLite
- **Custom Sync Protocol**: Push/pull handlers for Replicache sync

### Target Architecture

- **Hono**: Lightweight web framework (already in use)
- **tRPC**: Type-safe API layer via `@hono/trpc-server`
- **D1**: Cloudflare's managed SQL database
- **Drizzle ORM**: TypeScript-first ORM with D1 support

---

## Architecture Review & Known Gaps

This section documents architectural decisions, tradeoffs, and gaps that need to be addressed during implementation.

### Critical: Enum Value Casing Mismatch

**Impact: HIGH - Will cause runtime type errors**

The current codebase uses UPPERCASE enum values:

```typescript
// packages/shared/src/types/domain.ts (current)
export enum ContentType {
  VIDEO = 'VIDEO',
  PODCAST = 'PODCAST',
  ARTICLE = 'ARTICLE',
  POST = 'POST',
}

export enum Provider {
  YOUTUBE = 'YOUTUBE',
  SPOTIFY = 'SPOTIFY',
  RSS = 'RSS',
  SUBSTACK = 'SUBSTACK',
}

export enum UserItemState {
  INBOX = 'INBOX',
  BOOKMARKED = 'BOOKMARKED',
  ARCHIVED = 'ARCHIVED',
}
```

**Decision Required**: Choose one casing strategy:

1. **Keep UPPERCASE (recommended)**: Maintain backward compatibility, requires no data migration
2. **Migrate to lowercase**: More idiomatic for database storage, requires data migration

**This document assumes UPPERCASE is preserved.** All type definitions and queries should use the existing enum values.

### Critical: Loss of Offline-First Capability

**Impact: HIGH**

The current architecture provides offline-first UX via Replicache's local cache. The new architecture is **online-only by default**. This contradicts core principles in the Experience Architecture:

- "Local-first, instant interactions" (core principle)
- "Offline supported" (Search MVP requirement)
- "Offline-capable" (Library requirement)

**Mitigation Options:**

1. **Accept online-only MVP**: Defer offline support, document as known limitation
2. **React Query persistence**: Use `@tanstack/query-sync-storage-persister` for basic offline cache
3. **Service Worker caching**: Cache GET requests for offline read access
4. **Hybrid approach**: Use React Query + IndexedDB for optimistic local writes

**Recommendation**: Accept online-only for MVP, add React Query persistence as Phase 2.

### Gap: Optimistic Update Strategy

Replicache provided built-in optimistic mutations. The new architecture needs explicit optimistic updates via React Query:

```typescript
// Example: items.bookmark mutation with optimistic update
const bookmark = trpc.items.bookmark.useMutation({
  onMutate: async ({ id }) => {
    await queryClient.cancelQueries({ queryKey: ['items', 'inbox'] });
    const previousItems = queryClient.getQueryData(['items', 'inbox']);

    queryClient.setQueryData(['items', 'inbox'], (old) =>
      old?.items.filter((item) => item.id !== id)
    );

    return { previousItems };
  },
  onError: (err, { id }, context) => {
    queryClient.setQueryData(['items', 'inbox'], context?.previousItems);
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['items'] });
  },
});
```

**Action Required**: Document optimistic update patterns for all mutations.

### Gap: Ingestion Pipeline

The current ingestion pipeline runs inside Durable Objects (`handlers/ingest.ts`). The analysis doesn't address how content ingestion will work post-migration.

**Current Flow:**

1. Cron trigger or webhook calls Worker
2. Worker routes to user's Durable Object
3. DO fetches from provider APIs
4. DO writes to its SQLite storage
5. Replicache pull syncs to client

**New Architecture Options:**

1. **Scheduled Workers + D1**: Cron-triggered Workers query sources table, fetch content, write to D1
2. **Queues**: Use Cloudflare Queues for reliable ingestion job processing
3. **Deferred**: Keep ingestion as manual add-source-item flow initially

**Recommended Approach: Scheduled Workers + D1**

```toml
# apps/worker/wrangler.toml - add cron triggers
[triggers]
crons = ["0 * * * *"]  # Run every hour
```

```typescript
// apps/worker/src/index.ts - add scheduled handler
export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(runIngestionBatch(env));
  },
};

async function runIngestionBatch(env: Bindings) {
  const db = drizzle(env.DB);

  // Get all active sources
  const activeSources = await db.select().from(sources).where(isNull(sources.deletedAt));

  // Process each source (could use Promise.allSettled for parallelism)
  for (const source of activeSources) {
    try {
      await ingestSource(db, source);
    } catch (error) {
      console.error(`Ingestion failed for source ${source.id}:`, error);
      // Individual failures don't block other sources
    }
  }
}
```

**Action Required**: Implement ingestion scheduler and provider-specific fetchers.

### Gap: Idempotency Table Missing from Schema

The ingestion pipeline document references a `provider_items_seen` table for idempotency, but this is **missing from the proposed D1 schema**. Without it, duplicate items will be created on each ingestion run.

**Required Addition to Schema:**

```typescript
// apps/worker/src/db/schema.ts - add to schema
export const providerItemsSeen = sqliteTable(
  'provider_items_seen',
  {
    id: text('id').primaryKey(), // ULID
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    provider: text('provider').notNull(),
    providerItemId: text('provider_item_id').notNull(),
    sourceId: text('source_id').references(() => sources.id),
    firstSeenAt: text('first_seen_at').notNull(), // ISO8601
  },
  (table) => [
    // Idempotency key
    uniqueIndex('provider_items_seen_user_provider_item_idx').on(
      table.userId,
      table.provider,
      table.providerItemId
    ),
  ]
);
```

### Gap: Data Migration Strategy

**Impact: HIGH - Existing users will lose data without migration**

There is no plan for migrating existing user data from DO SQLite to D1. This must be addressed before production deployment.

**Migration Options:**

1. **Zero-state migration**: All existing users start fresh (acceptable for pre-launch)
2. **Export/Import migration**: Script to export from each DO and import to D1
3. **Dual-write period**: Run both architectures temporarily during transition

**For MVP/pre-launch, Option 1 is acceptable.** Document this as a known limitation.

**If users have data to preserve**, implement a migration script:

```typescript
// scripts/migrate-do-to-d1.ts (conceptual)
async function migrateUser(userId: string, env: Bindings) {
  // 1. Fetch all data from user's DO
  const doId = env.USER_DO.idFromName(userId);
  const stub = env.USER_DO.get(doId);
  const exportRes = await stub.fetch('http://do/export');
  const userData = await exportRes.json();

  // 2. Insert into D1
  const db = drizzle(env.DB);
  await db.transaction(async (tx) => {
    for (const item of userData.items) {
      await tx.insert(items).values(item).onConflictDoNothing();
    }
    for (const userItem of userData.userItems) {
      await tx.insert(userItems).values(userItem).onConflictDoNothing();
    }
    // ... etc
  });
}
```

### Gap: D1 Constraints

D1 has important limitations not addressed in this document:

| Constraint        | Limit               | Impact                               |
| ----------------- | ------------------- | ------------------------------------ |
| Database size     | 10GB per database   | May need sharding strategy for scale |
| CPU time          | 25ms per query      | Complex joins need optimization      |
| Row size          | 1MB                 | Large summaries need truncation      |
| Concurrent writes | Single-region write | Write latency for global users       |

**Mitigation**: The proposed schema is simple enough that these limits are unlikely to be hit for MVP scale.

### Gap: Webhook User Initialization

The current `handleUserCreated` webhook initializes a Durable Object with user data. The new architecture needs:

```typescript
// apps/worker/src/routes/auth.ts - handleUserCreated (refactored)
async function handleUserCreated(c: Context, data: UserCreatedEvent) {
  const db = drizzle(c.env.DB);

  await db
    .insert(users)
    .values({
      id: data.id,
      email: data.email_addresses[0]?.email_address ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoNothing();

  return c.json({ success: true });
}
```

### Gap: Auth Middleware Update

`apps/worker/src/middleware/auth.ts` isn't listed in files to modify but needs updates. Currently it likely validates JWT and may set user context. The tRPC context should receive the validated user:

```typescript
// apps/worker/src/trpc/context.ts
export async function createContext(c: Context): Promise<TRPCContext> {
  const userId = c.get('userId'); // Set by auth middleware
  const db = drizzle(c.env.DB);

  return { userId, db };
}
```

**Action Required**: Add `middleware/auth.ts` to files to modify.

### Inconsistency: Provider Enum

The proposed schema includes `'x'` (Twitter/X) as a provider, but:

- Current `Provider` enum only has: `YOUTUBE | SPOTIFY | RSS | SUBSTACK` (UPPERCASE)
- No X/Twitter integration exists in the codebase
- The tech stack doc lists X as a future provider

**Resolution**: Remove `'x'` from proposed schema until X integration is implemented. The schema comments should note this as a planned extension. **All provider values must use UPPERCASE to match existing enum.**

### Inconsistency: Item Sharing Model

The proposed schema implies `Item` records are globally unique (shared across users via `provider + providerId` unique constraint). However:

- Current DO architecture has items isolated per-user in `canonical_items`
- This is actually a **good change** for storage efficiency
- But requires careful handling: user A's bookmark of a video shouldn't affect user B's copy

**Clarification**: The unique constraint on `(provider, providerId)` is correct. `UserItem` provides per-user state. Items are canonical content, UserItems are user relationships.

### Gap: tRPC Type Export Path

The document mentions types will be exported from worker but doesn't show the monorepo integration:

```typescript
// apps/mobile/lib/trpc.ts
import type { AppRouter } from '@zine/worker/src/trpc/router';
```

This requires:

1. `packages/shared` to NOT contain tRPC types (they're worker-specific)
2. Mobile app needs path alias or direct import from worker
3. `apps/worker/package.json` needs `exports` field

**Recommended Approach: Direct Import with Exports Field**

Do NOT re-export from shared package (creates circular dependency risk). Instead:

```json
// apps/worker/package.json
{
  "name": "@zine/worker",
  "exports": {
    "./trpc": {
      "types": "./src/trpc/router.ts"
    }
  }
}
```

```json
// apps/mobile/tsconfig.json - add path alias
{
  "compilerOptions": {
    "paths": {
      "@zine/worker/*": ["../worker/src/*"]
    }
  }
}
```

```typescript
// apps/worker/src/trpc/trpc.ts
import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import type { TRPCContext } from './context';

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson, // Required for Date serialization - must match client
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});
```

**Note**: This only works for type imports. The tRPC router code stays in worker.

### Gap: Test Strategy

Test files are listed for deletion but no replacement strategy is proposed:

**Recommended Test Structure:**

```
apps/worker/src/
├── trpc/
│   └── routers/
│       ├── items.test.ts       # Unit tests for items router
│       └── sources.test.ts     # Unit tests for sources router
├── db/
│   └── queries.test.ts         # Database query tests
└── integration/
    └── api.test.ts             # End-to-end API tests
```

Use Vitest with `@cloudflare/vitest-pool-workers` as documented in tech stack.

### Gap: Error Handling

The mock implementation throws generic `Error('Item not found')`. Production needs proper tRPC error handling:

```typescript
import { TRPCError } from '@trpc/server';

get: protectedProcedure
  .input(z.object({ id: z.string() }))
  .query(async ({ input, ctx }) => {
    const item = await ctx.db.query.userItems.findFirst({
      where: eq(userItems.id, input.id),
    });

    if (!item) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Item ${input.id} not found`,
      });
    }

    return item;
  }),
```

**Standard Error Codes for Zine API:**

| Code                    | HTTP Status | Usage                                            |
| ----------------------- | ----------- | ------------------------------------------------ |
| `NOT_FOUND`             | 404         | Item, source, or user not found                  |
| `UNAUTHORIZED`          | 401         | Missing or invalid auth token                    |
| `FORBIDDEN`             | 403         | Valid auth but no access to resource             |
| `BAD_REQUEST`           | 400         | Invalid input (Zod validation should catch most) |
| `CONFLICT`              | 409         | Duplicate source subscription                    |
| `INTERNAL_SERVER_ERROR` | 500         | Unexpected server error                          |

**Client-side error handling pattern:**

```typescript
const bookmark = trpc.items.bookmark.useMutation({
  onError: (error) => {
    if (error.data?.code === 'NOT_FOUND') {
      // Item was deleted by another client
      queryClient.invalidateQueries({ queryKey: ['items'] });
    } else {
      // Show generic error toast
      showToast({ type: 'error', message: 'Failed to bookmark item' });
    }
  },
});
```

````

### Missing File: Auth Middleware

Add to files to modify:

**Path**: `apps/worker/src/middleware/auth.ts`

Update to work with tRPC context instead of just setting headers/variables.

### Missing File: Constants Index

`packages/shared/src/constants/index.ts` exports `ZINE_VERSION` and should be retained. Only `keys.ts` in the same directory should be deleted.

### Gap: Domain Type Mismatches

The current `Item` interface in `packages/shared/src/types/domain.ts` differs from the proposed schema in several ways:

| Field         | Current (`domain.ts`) | Proposed Schema | Resolution |
| ------------- | --------------------- | --------------- | ---------- |
| `provider`    | Missing               | Required        | **Add field** |
| `author`      | `author`              | `creator`       | Rename to `creator` |
| `providerId`  | Optional              | Required        | Make required |
| `canonicalUrl`| Optional              | Required        | Make required |
| `title`       | Optional              | Required        | Make required |

The current `UserItem` interface is also missing:

| Field              | Current | Proposed | Resolution |
| ------------------ | ------- | -------- | ---------- |
| `userId`           | Missing | Required | **Add field** (critical for D1) |
| `progressPosition` | Missing | Optional | Add field |
| `progressDuration` | Missing | Optional | Add field |
| `progressUpdatedAt`| Missing | Optional | Add field |
| `createdAt`        | Missing | Required | Add field |
| `updatedAt`        | Missing | Required | Add field |

The current `Source` interface is also missing:

| Field       | Current    | Proposed  | Resolution |
| ----------- | ---------- | --------- | ---------- |
| `userId`    | Missing    | Required  | **Add field** |
| `feedUrl`   | Missing    | Required  | Add field (different from `providerId`) |
| `updatedAt` | Missing    | Required  | Add field |
| `deletedAt` | Missing    | Optional  | Add field for soft delete |

**Action Required**: Update `packages/shared/src/types/domain.ts` to match the D1 schema requirements.

### Gap: Cursor-Based Pagination Details

The API shows cursor-based pagination but doesn't explain implementation:

**Cursor Encoding Strategy:**

```typescript
// Cursor is a base64-encoded JSON object
interface PaginationCursor {
  // The sort field value of the last item (for consistent ordering)
  sortValue: string; // ISO8601 timestamp
  // The ID of the last item (for tie-breaking)
  id: string;
}

function encodeCursor(cursor: PaginationCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeCursor(encoded: string): PaginationCursor {
  return JSON.parse(Buffer.from(encoded, 'base64url').toString());
}
```

**Query Pattern:**

```typescript
// Inbox query with cursor
const inboxQuery = async (userId: string, cursor?: string, limit = 20) => {
  let query = db
    .select()
    .from(userItems)
    .innerJoin(items, eq(userItems.itemId, items.id))
    .where(and(eq(userItems.userId, userId), eq(userItems.state, 'INBOX')))
    .orderBy(desc(userItems.ingestedAt), desc(userItems.id))
    .limit(limit + 1); // Fetch one extra to check if there's a next page

  if (cursor) {
    const { sortValue, id } = decodeCursor(cursor);
    query = query.where(
      or(
        lt(userItems.ingestedAt, sortValue),
        and(eq(userItems.ingestedAt, sortValue), lt(userItems.id, id))
      )
    );
  }

  const results = await query;
  const hasMore = results.length > limit;
  const items = hasMore ? results.slice(0, limit) : results;

  return {
    items,
    nextCursor: hasMore
      ? encodeCursor({
          sortValue: items[items.length - 1].ingestedAt,
          id: items[items.length - 1].id,
        })
      : undefined,
  };
};
```

### Gap: Rate Limiting

No rate limiting strategy is defined. For MVP, Cloudflare's built-in protections may suffice, but consider:

**Basic Rate Limiting with Hono:**

```typescript
import { rateLimiter } from 'hono-rate-limiter';

// Apply to tRPC routes
app.use(
  '/trpc/*',
  rateLimiter({
    windowMs: 60 * 1000, // 1 minute
    limit: 100, // 100 requests per minute per IP
    keyGenerator: (c) => c.get('userId') ?? c.req.header('CF-Connecting-IP') ?? 'unknown',
  })
);
```

**For production**, consider Cloudflare Rate Limiting rules in the dashboard.

---

## Files to DELETE

### 1. Worker Backend (`apps/worker/`)

#### 1.1 Durable Objects Directory (DELETE ENTIRE DIRECTORY)

**Path**: `apps/worker/src/durable-objects/`

| File                 | Description                                                                                                                                                                                              | Why Remove                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `user-do.ts`         | Main `UserDO` class extending `DurableObject<Bindings>`. Routes for `/init`, `/push`, `/pull`, `/ingest`, `/cleanup`, `/profile`. Uses `ctx.storage.sql` for embedded SQLite.                            | Core of old architecture - Durable Objects with embedded SQLite |
| `user-do.test.ts`    | Unit tests for `UserDO`                                                                                                                                                                                  | Tests for removed code                                          |
| `schema.ts`          | SQLite migration system with tables: `user_profile`, `canonical_items`, `user_items`, `sources`, `provider_items_seen`, `replicache_clients`, `replicache_meta`                                          | SQLite schema for DO - will be replaced by Drizzle schema       |
| `handlers/init.ts`   | `handleInit()` - runs SQLite migrations, initializes user profile                                                                                                                                        | Migration runner for DO SQLite                                  |
| `handlers/push.ts`   | `handlePush()` - Replicache push protocol. Processes mutations (`bookmarkItem`, `archiveItem`, `addSource`, `removeSource`, `updateUserItemState`), tracks `last_mutation_id`, increments global version | Replicache-specific sync protocol                               |
| `handlers/pull.ts`   | `handlePull()` - Replicache pull protocol. Returns `PatchOperation[]` with `put`/`del`/`clear` operations, handles `PullCookie` versioning                                                               | Replicache-specific sync protocol                               |
| `handlers/ingest.ts` | `handleIngest()` and `handleCleanup()` - content ingestion with idempotency tracking, GDPR data deletion                                                                                                 | SQLite-specific implementation                                  |

#### 1.2 Sync Routes (DELETE)

**Path**: `apps/worker/src/routes/sync.ts`

| Contents                                                    | Why Remove                       |
| ----------------------------------------------------------- | -------------------------------- |
| `/api/replicache/push` endpoint                             | Replicache push protocol handler |
| `/api/replicache/pull` endpoint                             | Replicache pull protocol handler |
| Uses `c.env.USER_DO.idFromName()` and `c.env.USER_DO.get()` | Direct Durable Object usage      |
| Validates `PushRequestSchema`/`PullRequestSchema`           | Replicache-specific schemas      |

**Also delete**: `apps/worker/src/routes/sync.test.ts`

#### 1.3 Database Utilities (DELETE)

**Path**: `apps/worker/src/lib/db.ts`

| Function                 | Why Remove                         |
| ------------------------ | ---------------------------------- |
| `isMigrationApplied()`   | SQLite migration helper            |
| `markMigrationApplied()` | SQLite migration helper            |
| `getVersion()`           | Reads from `replicache_meta` table |
| `incrementVersion()`     | Updates `replicache_meta` table    |

All functions operate on `SqlStorage` type (Durable Objects SQLite).

---

### 2. Mobile Client (`apps/mobile/`)

#### 2.1 Replicache Library (DELETE)

**Path**: `apps/mobile/lib/replicache.ts`

| Contents                                                  | Why Remove                                     |
| --------------------------------------------------------- | ---------------------------------------------- |
| `createReplicache()` function                             | Creates `Replicache<Mutators>` instance        |
| Configures `pushURL`, `pullURL`, `mutators`, `licenseKey` | Replicache-specific sync configuration         |
| `API_URL` export                                          | Can be moved if needed, but tied to Replicache |

#### 2.2 Replicache Provider (DELETE)

**Path**: `apps/mobile/providers/replicache-provider.tsx`

| Contents                                           | Why Remove                                        |
| -------------------------------------------------- | ------------------------------------------------- |
| `ReplicacheProvider` React component               | Creates and manages Replicache instance lifecycle |
| `useReplicache()` hook                             | Provides Replicache instance via React Context    |
| Imports from `replicache`, `@zine/shared` mutators | Direct Replicache usage                           |

**Used by**: `apps/mobile/app/_layout.tsx` (line 22)

#### 2.3 Items Hook (DELETE)

**Path**: `apps/mobile/hooks/use-items.ts`

| Contents                                                           | Why Remove                                  |
| ------------------------------------------------------------------ | ------------------------------------------- |
| `useItemsWithState()`                                              | Uses `useSubscribe` from `replicache-react` |
| `useInboxItems()`                                                  | Uses `useSubscribe` from `replicache-react` |
| `useBookmarkedItems()`                                             | Uses `useSubscribe` from `replicache-react` |
| `useArchivedItems()`                                               | Uses `useSubscribe` from `replicache-react` |
| Uses `ReadTransaction`, `itemScanPrefix()`, `userItemScanPrefix()` | Replicache transaction and key conventions  |

**Note**: The `ItemWithUserState` type definition can be preserved and moved.

#### 2.4 Mock Data (DELETE)

**Path**: `apps/mobile/lib/mock-data.ts`

| Contents                               | Why Remove                              |
| -------------------------------------- | --------------------------------------- |
| `MOCK_ITEMS`, `MOCK_USER_ITEMS` arrays | Use Replicache key functions            |
| `_seedMockData()` mutator              | Uses `WriteTransaction` from Replicache |
| `mockDataMutators`, `seedMockData()`   | Replicache mutator extensions           |
| `toJSONValue()` helper                 | Replicache-specific type casting        |

---

### 3. Shared Package (`packages/shared/`)

#### 3.1 Sync Types (DELETE)

**Path**: `packages/shared/src/types/sync.ts`

| Export                                                                                                                                    | Why Remove                   |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `SCHEMA_VERSION`                                                                                                                          | Replicache schema versioning |
| `BaseMutation`, `BookmarkItemMutation`, `ArchiveItemMutation`, `AddSourceMutation`, `RemoveSourceMutation`, `UpdateUserItemStateMutation` | Replicache mutation types    |
| `Mutation` union type                                                                                                                     | Replicache mutations         |
| `PushRequest`, `PushResponse`                                                                                                             | Replicache push protocol     |
| `PullCookie`, `PullRequest`, `PatchOperation`, `PullResponse`                                                                             | Replicache pull protocol     |
| `ClientMetadata`                                                                                                                          | Replicache client tracking   |

#### 3.2 Mutators (DELETE)

**Path**: `packages/shared/src/mutators/index.ts`

| Export                                      | Why Remove                                 |
| ------------------------------------------- | ------------------------------------------ |
| `mutators` object                           | All use `WriteTransaction` from Replicache |
| `Mutators` type                             | Replicache mutator types                   |
| `BookmarkItemArgs`, `ArchiveItemArgs`, etc. | Could be repurposed for tRPC inputs        |
| `toJSONValue()` helper                      | Replicache-specific casting                |

#### 3.3 Key Conventions (DELETE)

**Path**: `packages/shared/src/constants/keys.ts`

| Export                                                           | Why Remove                          |
| ---------------------------------------------------------------- | ----------------------------------- |
| `KEY_PREFIX`                                                     | Replicache key-value store prefixes |
| `itemKey()`, `userItemKey()`, `sourceKey()`                      | Replicache key generators           |
| `parseKeyType()`, `parseKeyId()`                                 | Replicache key parsers              |
| `isItemKey()`, `isUserItemKey()`, `isSourceKey()`                | Replicache key type guards          |
| `itemScanPrefix()`, `userItemScanPrefix()`, `sourceScanPrefix()` | Replicache scan prefixes            |

---

## Files to MODIFY

### 1. Worker Backend (`apps/worker/`)

#### 1.1 Entry Point

**Path**: `apps/worker/src/index.ts`

**Remove**:

```typescript
// Remove DO export (line ~18)
export { UserDO } from './durable-objects/user-do';

// Remove sync routes import (line ~13)
import syncRoutes from './routes/sync';

// Remove replicache routes (lines ~85-89)
app.use('/api/replicache/*', authMiddleware());
app.route('/api/replicache', syncRoutes);
````

#### 1.2 Types

**Path**: `apps/worker/src/types.ts`

**Remove** from `Bindings` interface:

```typescript
USER_DO: DurableObjectNamespace;
```

**Keep**: `WEBHOOK_IDEMPOTENCY`, `ENVIRONMENT`, `CLERK_*` variables, `Variables`, `Env`, `AppContext` types.

#### 1.3 Auth Routes

**Path**: `apps/worker/src/routes/auth.ts`

**Refactor** to use D1 instead of Durable Objects:

- `handleUserCreated()` - currently calls `env.USER_DO.idFromName()` and `stub.fetch('/init')`
- `handleUserDeleted()` - currently calls DO for cleanup
- `/me` endpoint - currently fetches from DO
- `/account` DELETE - currently calls DO for deletion

**Keep**: Webhook verification logic, Svix handling.

#### 1.4 Sources Routes

**Path**: `apps/worker/src/routes/sources.ts`

Most methods are stubs with `// TODO: Implement` comments. Route structure can be kept but implementations need D1.

#### 1.5 Wrangler Config

**Path**: `apps/worker/wrangler.toml`

**Remove** (lines 11-19):

```toml
# Durable Object bindings
[[durable_objects.bindings]]
name = "USER_DO"
class_name = "UserDO"

# SQLite storage for Durable Objects
[[migrations]]
tag = "v1"
new_sqlite_classes = ["UserDO"]
```

**Add**: D1 database bindings:

```toml
# D1 database binding
[[d1_databases]]
binding = "DB"
database_name = "zine-db"
database_id = "<YOUR_D1_DATABASE_ID>"

# For local development
[env.development]
[[env.development.d1_databases]]
binding = "DB"
database_name = "zine-db-local"
database_id = "local"  # Uses local SQLite via wrangler

# Staging
[env.staging]
[[env.staging.d1_databases]]
binding = "DB"
database_name = "zine-db-staging"
database_id = "<STAGING_D1_DATABASE_ID>"

# Production
[env.production]
[[env.production.d1_databases]]
binding = "DB"
database_name = "zine-db-production"
database_id = "<PRODUCTION_D1_DATABASE_ID>"
```

**D1 Database Setup:**

```bash
# Create D1 databases (run once per environment)
wrangler d1 create zine-db-staging
wrangler d1 create zine-db-production

# Apply migrations to staging
wrangler d1 migrations apply zine-db-staging --env staging

# Apply migrations to production
wrangler d1 migrations apply zine-db-production --env production
```

---

### 2. Mobile Client (`apps/mobile/`)

#### 2.1 Root Layout

**Path**: `apps/mobile/app/_layout.tsx`

**Remove**:

```typescript
import { ReplicacheProvider } from '@/providers/replicache-provider';

// And in JSX:
<ReplicacheProvider>
  ...
</ReplicacheProvider>
```

**Add**: New data provider (React Query, tRPC client, etc.)

#### 2.2 Package.json

**Path**: `apps/mobile/package.json`

**Remove** (lines 45-46):

```json
"replicache": "^15.0.0",
"replicache-react": "^5.0.0",
```

**Add**:

```json
"@tanstack/react-query": "^5.x.x",
"@trpc/client": "^11.x.x",
"@trpc/react-query": "^11.x.x"
```

---

### 3. Shared Package (`packages/shared/`)

#### 3.1 Index Exports

**Path**: `packages/shared/src/index.ts`

**Remove**:

```typescript
// Sync types exports
export { SCHEMA_VERSION, ... } from './types/sync';

// Key conventions exports
export { KEY_PREFIX, itemKey, ... } from './constants/keys';

// Sync schemas exports
export { BookmarkItemMutationSchema, ... } from './schemas';

// Mutators exports
export { mutators, type Mutators, ... } from './mutators';
```

**Keep**: Domain types, `ZINE_VERSION`, enum schemas, domain schemas.

#### 3.2 Schemas

**Path**: `packages/shared/src/schemas/index.ts`

**Remove**:

- Mutation schemas (lines ~74-142): `BookmarkItemMutationSchema`, `ArchiveItemMutationSchema`, `AddSourceMutationSchema`, `RemoveSourceMutationSchema`, `UpdateUserItemStateMutationSchema`, `MutationSchema`
- Sync schemas (lines ~151-181): `PullCookieSchema`, `PushRequestSchema`, `PushResponseSchema`, `PullRequestSchema`
- Patch/Pull response schemas (lines ~186-208): `PatchOperationSchema`, `PullResponseSchema`
- Client metadata schema (lines ~212-218): `ClientMetadataSchema`

**Keep**:

- Enum schemas: `ContentTypeSchema`, `ProviderSchema`, `UserItemStateSchema`
- Domain schemas: `ItemSchema`, `UserItemSchema`, `SourceSchema`

#### 3.3 Package.json

**Path**: `packages/shared/package.json`

**Remove** (lines 42-51):

```json
"peerDependencies": {
  "replicache": "^15.0.0"
},
"peerDependenciesMeta": {
  "replicache": {
    "optional": true
  }
},
"devDependencies": {
  "replicache": "^15.0.0",
  ...
}
```

**Remove** exports for deleted modules:

```json
"./mutators": { ... },
"./constants": { ... }
```

---

## Summary

### Files to DELETE (17 total)

| Category      | Files                                                                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Worker DO     | `src/durable-objects/user-do.ts`, `user-do.test.ts`, `schema.ts`, `handlers/init.ts`, `handlers/push.ts`, `handlers/pull.ts`, `handlers/ingest.ts` |
| Worker Routes | `src/routes/sync.ts`, `src/routes/sync.test.ts`                                                                                                    |
| Worker Lib    | `src/lib/db.ts`                                                                                                                                    |
| Mobile        | `lib/replicache.ts`, `providers/replicache-provider.tsx`, `hooks/use-items.ts`, `lib/mock-data.ts`                                                 |
| Shared        | `src/types/sync.ts`, `src/mutators/index.ts`, `src/constants/keys.ts`                                                                              |

### Directories to DELETE (1)

- `apps/worker/src/durable-objects/` (entire directory)

### Files to MODIFY (12 total)

| File                                   | Changes                                      |
| -------------------------------------- | -------------------------------------------- |
| `apps/worker/src/index.ts`             | Remove DO export, sync routes, add tRPC      |
| `apps/worker/src/types.ts`             | Remove `USER_DO` binding, add `DB` binding   |
| `apps/worker/src/routes/auth.ts`       | Refactor to use D1 for user management       |
| `apps/worker/src/routes/sources.ts`    | Implement with D1 (or replace with tRPC)     |
| `apps/worker/src/middleware/auth.ts`   | Update for tRPC context integration          |
| `apps/worker/wrangler.toml`            | Remove DO config, add D1                     |
| `apps/worker/package.json`             | Add drizzle, @hono/trpc-server, @trpc/server |
| `apps/mobile/app/_layout.tsx`          | Remove ReplicacheProvider, add TRPCProvider  |
| `apps/mobile/package.json`             | Remove replicache, add react-query + trpc    |
| `packages/shared/src/index.ts`         | Remove sync/mutator exports                  |
| `packages/shared/src/schemas/index.ts` | Remove mutation/sync schemas                 |
| `packages/shared/package.json`         | Remove replicache peer dep                   |

---

## Dependency Graph

```
apps/mobile/app/_layout.tsx
    └── providers/replicache-provider.tsx (DELETE)
        ├── lib/replicache.ts (DELETE)
        └── lib/mock-data.ts (DELETE)

    └── hooks/use-items.ts (DELETE)
        └── @zine/shared (mutators, keys)

packages/shared
    └── src/mutators/index.ts (DELETE)
        └── src/types/sync.ts (DELETE)
    └── src/constants/keys.ts (DELETE)
    └── src/schemas/index.ts (MODIFY)

apps/worker
    └── src/index.ts (MODIFY)
        └── src/durable-objects/user-do.ts (DELETE)
            └── src/durable-objects/schema.ts (DELETE)
            └── src/durable-objects/handlers/*.ts (DELETE)
        └── src/routes/sync.ts (DELETE)
    └── src/routes/auth.ts (MODIFY)
    └── src/routes/sources.ts (MODIFY)
    └── src/middleware/auth.ts (MODIFY) ← Missing from original analysis
    └── src/lib/db.ts (DELETE)
    └── src/trpc/ (NEW DIRECTORY)
        └── router.ts, context.ts, trpc.ts, routers/*.ts
```

---

## New Architecture: API Design

This section defines the complete API design for the new Hono + tRPC + D1 + Drizzle backend.

### Design Principles

Based on the [Experience Architecture](../../docs/zine-experience-architecture.md):

- **Inbox**: Decision queue - triage new content (bookmark or archive)
- **Library**: Long-term memory - browse saved/bookmarked content
- **Home**: Curated launchpad - shortcuts to recent bookmarks, content types

---

## Data Models

### Entity Relationship

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   Source    │       │    Item     │       │  UserItem   │
├─────────────┤       ├─────────────┤       ├─────────────┤
│ id          │       │ id          │◄──────│ itemId      │
│ userId      │───┐   │ contentType │       │ userId      │
│ provider    │   │   │ provider    │       │ state       │
│ feedUrl     │   │   │ providerId  │       │ ingestedAt  │
│ name        │   │   │ title       │       │ bookmarkedAt│
│ deletedAt   │   │   │ creator     │       │ archivedAt  │
└─────────────┘   │   │ ...         │       │ progress... │
                  │   └─────────────┘       └─────────────┘
                  │                                │
                  │         ┌─────────────┐        │
                  └────────►│    User     │◄───────┘
                            ├─────────────┤
                            │ id          │
                            │ email       │
                            └─────────────┘
```

### Core Entities

#### Item (Canonical Content)

Immutable content metadata, potentially shared across users.

| Field          | Type                                            | Required | Description                             |
| -------------- | ----------------------------------------------- | -------- | --------------------------------------- |
| `id`           | `string`                                        | Yes      | ULID - globally unique                  |
| `contentType`  | `'VIDEO' \| 'PODCAST' \| 'ARTICLE' \| 'POST'`   | Yes      | Content classification (UPPERCASE)      |
| `provider`     | `'YOUTUBE' \| 'SPOTIFY' \| 'SUBSTACK' \| 'RSS'` | Yes      | Source platform (UPPERCASE, X deferred) |
| `providerId`   | `string`                                        | Yes      | Provider-specific ID                    |
| `canonicalUrl` | `string`                                        | Yes      | URL to content                          |
| `title`        | `string`                                        | Yes      | Display title                           |
| `thumbnailUrl` | `string \| null`                                | No       | Preview image                           |
| `creator`      | `string`                                        | Yes      | Channel/author/podcast name             |
| `publisher`    | `string \| null`                                | No       | Network (e.g., "NPR")                   |
| `summary`      | `string \| null`                                | No       | Description/excerpt                     |
| `duration`     | `number \| null`                                | No       | Seconds (video/podcast only)            |
| `publishedAt`  | `string \| null`                                | No       | ISO8601 datetime                        |
| `createdAt`    | `string`                                        | Yes      | ISO8601 datetime                        |
| `updatedAt`    | `string`                                        | Yes      | ISO8601 datetime                        |

**Note**: This differs from current `Item` interface in `domain.ts`. The current interface uses `author` instead of `creator` and marks many fields as optional. See "Gap: Domain Type Mismatches" for migration details.

#### UserItem (User's Relationship to Content)

Per-user state for each item.

| Field               | Type                                    | Required | Description                            |
| ------------------- | --------------------------------------- | -------- | -------------------------------------- |
| `id`                | `string`                                | Yes      | ULID                                   |
| `userId`            | `string`                                | Yes      | FK to User **(NEW - required for D1)** |
| `itemId`            | `string`                                | Yes      | FK to Item                             |
| `state`             | `'INBOX' \| 'BOOKMARKED' \| 'ARCHIVED'` | Yes      | Current state (UPPERCASE)              |
| `ingestedAt`        | `string`                                | Yes      | When added to inbox (ISO8601)          |
| `bookmarkedAt`      | `string \| null`                        | No       | When bookmarked                        |
| `archivedAt`        | `string \| null`                        | No       | When archived                          |
| `progressPosition`  | `number \| null`                        | No       | Current position in seconds **(NEW)**  |
| `progressDuration`  | `number \| null`                        | No       | Total duration in seconds **(NEW)**    |
| `progressUpdatedAt` | `string \| null`                        | No       | Last progress update **(NEW)**         |
| `createdAt`         | `string`                                | Yes      | ISO8601 datetime **(NEW)**             |
| `updatedAt`         | `string`                                | Yes      | ISO8601 datetime **(NEW)**             |

**Breaking Change**: The current `UserItem` interface has no `userId` field because items were isolated per-user in DO SQLite. With D1, `userId` is mandatory for multi-tenant queries.

#### Source (User Subscriptions)

Content sources the user subscribes to.

| Field        | Type                                            | Required | Description                             |
| ------------ | ----------------------------------------------- | -------- | --------------------------------------- |
| `id`         | `string`                                        | Yes      | ULID                                    |
| `userId`     | `string`                                        | Yes      | FK to User **(NEW)**                    |
| `provider`   | `'YOUTUBE' \| 'SPOTIFY' \| 'SUBSTACK' \| 'RSS'` | Yes      | Source platform (UPPERCASE)             |
| `providerId` | `string`                                        | Yes      | Provider-specific ID (channel ID, etc.) |
| `feedUrl`    | `string`                                        | Yes      | Feed/channel URL **(NEW)**              |
| `name`       | `string`                                        | Yes      | Display name                            |
| `createdAt`  | `string`                                        | Yes      | ISO8601 datetime                        |
| `updatedAt`  | `string`                                        | Yes      | ISO8601 datetime **(NEW)**              |
| `deletedAt`  | `string \| null`                                | No       | Soft delete timestamp **(NEW)**         |

**Note**: Current `Source` interface has `providerId` but not `feedUrl`. Both are needed - `providerId` for API calls, `feedUrl` for the actual subscription URL. The current interface also lacks `userId`, `updatedAt`, and `deletedAt`.

#### User

Basic user profile.

| Field       | Type             | Required | Description      |
| ----------- | ---------------- | -------- | ---------------- |
| `id`        | `string`         | Yes      | Clerk user ID    |
| `email`     | `string \| null` | No       | User email       |
| `createdAt` | `string`         | Yes      | ISO8601 datetime |
| `updatedAt` | `string`         | Yes      | ISO8601 datetime |

### State Machine

```
                 ┌─────────────────────────────────────┐
                 │                                     │
    [Ingestion]──► INBOX ──┬──[Bookmark]──► BOOKMARKED │
                          │                           │
                          └──[Archive]───► ARCHIVED ──┘
```

| State        | Meaning              | UI Location | Sorted By      |
| ------------ | -------------------- | ----------- | -------------- |
| `INBOX`      | New, awaiting triage | Inbox tab   | `ingestedAt`   |
| `BOOKMARKED` | Saved for later      | Library tab | `bookmarkedAt` |
| `ARCHIVED`   | Dismissed/consumed   | Hidden      | `archivedAt`   |

**Note**: State values use UPPERCASE to match the existing `UserItemState` enum.

---

## API Procedures (tRPC)

### ItemView (Response Type)

The combined view returned to the UI:

```typescript
import { ContentType, Provider, UserItemState } from '@zine/shared';

type ItemView = {
  // Identifiers
  id: string; // UserItem ID (for mutations)
  itemId: string; // Canonical Item ID

  // Display
  title: string;
  thumbnailUrl: string | null;
  canonicalUrl: string;

  // Classification - use enum values for type safety
  contentType: ContentType; // 'VIDEO' | 'PODCAST' | 'ARTICLE' | 'POST'
  provider: Provider; // 'YOUTUBE' | 'SPOTIFY' | 'SUBSTACK' | 'RSS' (X deferred)

  // Attribution
  creator: string;
  publisher: string | null;

  // Metadata
  summary: string | null;
  duration: number | null; // seconds
  publishedAt: string | null;

  // User state - use enum value
  state: UserItemState; // 'INBOX' | 'BOOKMARKED' | 'ARCHIVED'
  ingestedAt: string;
  bookmarkedAt: string | null;

  // Progress (for "Jump Back In")
  progress: {
    position: number;
    duration: number;
    percent: number;
  } | null;
};
```

**UI Mapping**: The mobile app's `use-items.ts` already has helper functions (`mapContentType`, `mapProvider`) to convert enum values to lowercase display strings. This pattern should be preserved.

### Queries

#### `items.inbox`

Get items in the triage queue.

**Input:**

```typescript
{
  filter?: {
    provider?: Provider;      // 'YOUTUBE' | 'SPOTIFY' | 'SUBSTACK' | 'RSS'
    contentType?: ContentType; // 'VIDEO' | 'PODCAST' | 'ARTICLE' | 'POST'
  };
  cursor?: string;
  limit?: number;  // default 20
}
```

**Output:**

```typescript
{
  items: ItemView[];
  nextCursor?: string;
}
```

#### `items.library`

Get bookmarked items.

**Input:**

```typescript
{
  filter?: {
    provider?: Provider;      // 'YOUTUBE' | 'SPOTIFY' | 'SUBSTACK' | 'RSS'
    contentType?: ContentType; // 'VIDEO' | 'PODCAST' | 'ARTICLE' | 'POST'
  };
  cursor?: string;
  limit?: number;  // default 20
}
```

**Output:**

```typescript
{
  items: ItemView[];
  nextCursor?: string;
}
```

#### `items.home`

Get curated home sections.

**Input:** None

**Output:**

```typescript
{
  recentBookmarks: ItemView[];      // limit 5, sorted by bookmarkedAt DESC
  jumpBackIn: ItemView[];           // items with progress > 0, limit 5
  byContentType: {
    videos: ItemView[];             // limit 5
    podcasts: ItemView[];           // limit 5
    articles: ItemView[];           // limit 5
  };
}
```

#### `items.get`

Get a single item detail.

**Input:**

```typescript
{
  id: string;
} // UserItem ID
```

**Output:**

```typescript
ItemView;
```

#### `sources.list`

Get user's subscribed sources.

**Input:** None

**Output:**

```typescript
Source[]  // excludes soft-deleted
```

### Mutations

#### `items.bookmark`

Move an item from inbox to bookmarked.

**Input:**

```typescript
{
  id: string;
} // UserItem ID
```

**Output:**

```typescript
{
  success: true;
}
```

**Side Effects:**

- Sets `state = 'bookmarked'`
- Sets `bookmarkedAt = now()`

#### `items.archive`

Move an item to archived.

**Input:**

```typescript
{
  id: string;
} // UserItem ID
```

**Output:**

```typescript
{
  success: true;
}
```

**Side Effects:**

- Sets `state = 'archived'`
- Sets `archivedAt = now()`

#### `items.updateProgress`

Update consumption progress for an item.

**Input:**

```typescript
{
  id: string; // UserItem ID
  position: number; // current position in seconds
  duration: number; // total duration in seconds
}
```

**Output:**

```typescript
{
  success: true;
}
```

**Side Effects:**

- Sets `progressPosition`, `progressDuration`, `progressUpdatedAt`

#### `sources.add`

Subscribe to a new content source.

**Input:**

```typescript
{
  provider: Provider;  // 'YOUTUBE' | 'SPOTIFY' | 'SUBSTACK' | 'RSS' (X deferred)
  feedUrl: string;
  name?: string;  // auto-derived if not provided
}
```

**Output:**

```typescript
Source;
```

#### `sources.remove`

Unsubscribe from a source (soft delete).

**Input:**

```typescript
{
  id: string;
} // Source ID
```

**Output:**

```typescript
{
  success: true;
}
```

**Side Effects:**

- Sets `deletedAt = now()`

---

## Database Schema (Drizzle + D1)

**Path:** `apps/worker/src/db/schema.ts`

```typescript
import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

// ============================================================================
// Users
// ============================================================================
export const users = sqliteTable('users', {
  id: text('id').primaryKey(), // Clerk user ID
  email: text('email'),
  createdAt: text('created_at').notNull(), // ISO8601
  updatedAt: text('updated_at').notNull(),
});

// ============================================================================
// Items (Canonical Content)
// ============================================================================
export const items = sqliteTable(
  'items',
  {
    id: text('id').primaryKey(), // ULID

    // Classification - values stored as UPPERCASE to match existing enums
    contentType: text('content_type').notNull(), // VIDEO | PODCAST | ARTICLE | POST
    provider: text('provider').notNull(), // YOUTUBE | SPOTIFY | SUBSTACK | RSS
    providerId: text('provider_id').notNull(), // External ID
    canonicalUrl: text('canonical_url').notNull(),

    // Display
    title: text('title').notNull(),
    thumbnailUrl: text('thumbnail_url'),

    // Attribution
    creator: text('creator').notNull(), // Channel/author/podcast name
    publisher: text('publisher'), // Optional: network

    // Metadata
    summary: text('summary'),
    duration: integer('duration'), // Seconds
    publishedAt: text('published_at'), // ISO8601

    // System
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    // Prevent duplicate content from same provider
    uniqueIndex('items_provider_provider_id_idx').on(table.provider, table.providerId),
  ]
);

// ============================================================================
// User Items (User's relationship to content)
// ============================================================================
export const userItems = sqliteTable(
  'user_items',
  {
    id: text('id').primaryKey(), // ULID
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    itemId: text('item_id')
      .notNull()
      .references(() => items.id),

    // State - stored as UPPERCASE to match UserItemState enum
    state: text('state').notNull(), // INBOX | BOOKMARKED | ARCHIVED

    // Timestamps
    ingestedAt: text('ingested_at').notNull(), // ISO8601
    bookmarkedAt: text('bookmarked_at'),
    archivedAt: text('archived_at'),

    // Progress tracking
    progressPosition: integer('progress_position'), // Seconds
    progressDuration: integer('progress_duration'), // Seconds
    progressUpdatedAt: text('progress_updated_at'),

    // System
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    // Prevent duplicate user-item relationships
    uniqueIndex('user_items_user_id_item_id_idx').on(table.userId, table.itemId),

    // Fast inbox queries: WHERE userId = ? AND state = 'INBOX' ORDER BY ingestedAt DESC
    index('user_items_inbox_idx').on(table.userId, table.state, table.ingestedAt),

    // Fast library queries: WHERE userId = ? AND state = 'BOOKMARKED' ORDER BY bookmarkedAt DESC
    index('user_items_library_idx').on(table.userId, table.state, table.bookmarkedAt),
  ]
);

// ============================================================================
// Sources (User subscriptions)
// ============================================================================
export const sources = sqliteTable(
  'sources',
  {
    id: text('id').primaryKey(), // ULID
    userId: text('user_id')
      .notNull()
      .references(() => users.id),

    // Provider info - stored as UPPERCASE
    provider: text('provider').notNull(), // YOUTUBE | SPOTIFY | SUBSTACK | RSS
    providerId: text('provider_id').notNull(), // Provider-specific ID (channel ID, etc.)
    feedUrl: text('feed_url').notNull(), // Actual subscription URL
    name: text('name').notNull(),

    // System
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'), // Soft delete
  },
  (table) => [
    // Prevent duplicate subscriptions (same user, same provider, same feed)
    uniqueIndex('sources_user_provider_feed_idx').on(table.userId, table.provider, table.feedUrl),

    // Fast list queries for user's sources
    index('sources_user_id_idx').on(table.userId),
  ]
);

// ============================================================================
// Provider Items Seen (Ingestion Idempotency)
// ============================================================================
// This table is CRITICAL for preventing duplicate inbox items during ingestion.
// See: docs/zine-ingestion-pipeline.md
export const providerItemsSeen = sqliteTable(
  'provider_items_seen',
  {
    id: text('id').primaryKey(), // ULID
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    provider: text('provider').notNull(), // YOUTUBE | SPOTIFY | SUBSTACK | RSS
    providerItemId: text('provider_item_id').notNull(), // External item ID
    sourceId: text('source_id').references(() => sources.id), // Which source ingested this
    firstSeenAt: text('first_seen_at').notNull(), // ISO8601
  },
  (table) => [
    // Idempotency key - prevents re-ingesting the same item for a user
    uniqueIndex('provider_items_seen_user_provider_item_idx').on(
      table.userId,
      table.provider,
      table.providerItemId
    ),
  ]
);
```

### Schema Notes

1. **Enum values stored as UPPERCASE strings** to match existing TypeScript enums
2. **`providerItemsSeen` table** is essential for ingestion idempotency
3. **Foreign keys use `references()`** for Drizzle's relational query support
4. **Indexes optimized for the two main queries**: inbox list and library list
5. **Soft delete on sources** preserves referential integrity while allowing "unsubscribe"

---

## File Structure (New)

```
apps/worker/src/
├── db/
│   ├── schema.ts           # Drizzle schema (above)
│   ├── index.ts            # DB client initialization
│   └── migrations/         # Drizzle migrations
├── trpc/
│   ├── router.ts           # Root router
│   ├── context.ts          # tRPC context (auth, db)
│   ├── trpc.ts             # tRPC instance
│   └── routers/
│       ├── items.ts        # items.* procedures
│       └── sources.ts      # sources.* procedures
├── lib/
│   └── auth.ts             # Clerk JWT verification (keep)
├── middleware/
│   └── auth.ts             # Auth middleware (keep)
├── routes/
│   └── auth.ts             # Webhook routes (refactor)
├── index.ts                # Hono app entry
└── types.ts                # Bindings, env types
```

---

## Client Integration (Mobile)

### Dependencies

```json
{
  "@tanstack/react-query": "^5.60.0",
  "@trpc/client": "^11.0.0",
  "@trpc/react-query": "^11.0.0",
  "superjson": "^2.2.0"
}
```

### tRPC Client Setup

**Path:** `apps/mobile/lib/trpc.ts`

```typescript
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@zine/worker/src/trpc/router';

export const trpc = createTRPCReact<AppRouter>();
```

### Provider Setup

**Path:** `apps/mobile/providers/trpc-provider.tsx`

```typescript
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { useAuth } from '@clerk/clerk-expo';
import superjson from 'superjson';
import { trpc } from '@/lib/trpc';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8787';

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();

  // Create clients in useState to avoid SSR/hydration issues
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5, // 5 minutes
            retry: 2,
          },
        },
      })
  );

  const [trpcClient] = useState(() =>
    trpc.createClient({
      transformer: superjson, // Required for Date serialization
      links: [
        httpBatchLink({
          url: `${API_URL}/trpc`,
          headers: async () => {
            const token = await getToken();
            return token ? { Authorization: `Bearer ${token}` } : {};
          },
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
```

### Example Hooks Usage

```typescript
// Inbox screen
function InboxScreen() {
  const { data, fetchNextPage, hasNextPage } = trpc.items.inbox.useInfiniteQuery(
    { limit: 20 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor }
  );

  const bookmark = trpc.items.bookmark.useMutation();
  const archive = trpc.items.archive.useMutation();

  // ...
}

// Library screen
function LibraryScreen() {
  const { data } = trpc.items.library.useInfiniteQuery(
    { filter: { contentType: 'video' } },
    { getNextPageParam: (lastPage) => lastPage.nextCursor }
  );

  // ...
}

// Home screen
function HomeScreen() {
  const { data } = trpc.items.home.useQuery();

  // data.recentBookmarks
  // data.jumpBackIn
  // data.byContentType.videos
  // ...
}
```

---

## Implementation Strategy: Mock Data First

The API will be implemented with **hardcoded mock data** initially, allowing us to:

1. Build out the complete tRPC router structure
2. Wire up the mobile client to the API
3. Test UI flows end-to-end
4. Defer D1/Drizzle database setup until the API contract is stable

### Mock Data Approach

- Each query procedure returns static, hardcoded `ItemView[]` data
- Mutations are no-ops that return `{ success: true }` without persisting
- No database connection required during initial development
- Mock data represents realistic content for UI development

### Mock Data Location

**Path:** `apps/worker/src/trpc/mock-data.ts`

```typescript
import type { ItemView } from './types';
import { ContentType, Provider, UserItemState } from '@zine/shared';

export const MOCK_ITEMS: ItemView[] = [
  {
    id: 'ui-001',
    itemId: 'item-001',
    title: 'How to Build a Second Brain',
    thumbnailUrl: 'https://picsum.photos/seed/item1/400/225',
    canonicalUrl: 'https://youtube.com/watch?v=abc123',
    contentType: ContentType.VIDEO, // Use enum for type safety
    provider: Provider.YOUTUBE,
    creator: 'Tiago Forte',
    publisher: null,
    summary: 'A comprehensive guide to building a personal knowledge management system.',
    duration: 3720, // 1h 2m
    publishedAt: '2024-01-15T10:00:00Z',
    state: UserItemState.INBOX,
    ingestedAt: '2024-12-10T08:30:00Z',
    bookmarkedAt: null,
    progress: null,
  },
  {
    id: 'ui-002',
    itemId: 'item-002',
    title: 'The Tim Ferriss Show: Naval Ravikant',
    thumbnailUrl: 'https://picsum.photos/seed/item2/400/225',
    canonicalUrl: 'https://open.spotify.com/episode/xyz789',
    contentType: ContentType.PODCAST,
    provider: Provider.SPOTIFY,
    creator: 'Tim Ferriss',
    publisher: 'The Tim Ferriss Show',
    summary: 'Naval shares his mental models for wealth and happiness.',
    duration: 7200, // 2h
    publishedAt: '2024-01-10T06:00:00Z',
    state: UserItemState.BOOKMARKED,
    ingestedAt: '2024-12-08T14:00:00Z',
    bookmarkedAt: '2024-12-09T09:15:00Z',
    progress: {
      position: 2400,
      duration: 7200,
      percent: 33,
    },
  },
  // ... more mock items for each content type and state
];

// Helper to filter mock data
export function getMockInboxItems(): ItemView[] {
  return MOCK_ITEMS.filter((item) => item.state === UserItemState.INBOX).sort((a, b) =>
    b.ingestedAt.localeCompare(a.ingestedAt)
  );
}

export function getMockLibraryItems(): ItemView[] {
  return MOCK_ITEMS.filter((item) => item.state === UserItemState.BOOKMARKED).sort((a, b) =>
    (b.bookmarkedAt ?? '').localeCompare(a.bookmarkedAt ?? '')
  );
}

export function getMockHomeData() {
  const bookmarked = getMockLibraryItems();
  return {
    recentBookmarks: bookmarked.slice(0, 5),
    jumpBackIn: bookmarked.filter((item) => item.progress !== null).slice(0, 5),
    byContentType: {
      videos: bookmarked.filter((item) => item.contentType === ContentType.VIDEO).slice(0, 5),
      podcasts: bookmarked.filter((item) => item.contentType === ContentType.PODCAST).slice(0, 5),
      articles: bookmarked.filter((item) => item.contentType === ContentType.ARTICLE).slice(0, 5),
    },
  };
}
```

### Mock Router Implementation

**Path:** `apps/worker/src/trpc/routers/items.ts`

```typescript
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { getMockInboxItems, getMockLibraryItems, getMockHomeData, MOCK_ITEMS } from '../mock-data';
import { ContentType, Provider } from '@zine/shared';

// Zod schemas using actual enum values (UPPERCASE)
const ProviderSchema = z.enum(['YOUTUBE', 'SPOTIFY', 'SUBSTACK', 'RSS']);
const ContentTypeSchema = z.enum(['VIDEO', 'PODCAST', 'ARTICLE', 'POST']);

export const itemsRouter = router({
  inbox: protectedProcedure
    .input(
      z
        .object({
          filter: z
            .object({
              provider: ProviderSchema.optional(),
              contentType: ContentTypeSchema.optional(),
            })
            .optional(),
          cursor: z.string().optional(),
          limit: z.number().min(1).max(50).default(20),
        })
        .optional()
    )
    .query(({ input }) => {
      // TODO: Replace with D1 query
      let items = getMockInboxItems();

      if (input?.filter?.provider) {
        items = items.filter((item) => item.provider === input.filter!.provider);
      }
      if (input?.filter?.contentType) {
        items = items.filter((item) => item.contentType === input.filter!.contentType);
      }

      return { items, nextCursor: undefined };
    }),

  library: protectedProcedure
    .input(
      z
        .object({
          filter: z
            .object({
              provider: ProviderSchema.optional(),
              contentType: ContentTypeSchema.optional(),
            })
            .optional(),
          cursor: z.string().optional(),
          limit: z.number().min(1).max(50).default(20),
        })
        .optional()
    )
    .query(({ input }) => {
      // TODO: Replace with D1 query
      let items = getMockLibraryItems();

      if (input?.filter?.provider) {
        items = items.filter((item) => item.provider === input.filter!.provider);
      }
      if (input?.filter?.contentType) {
        items = items.filter((item) => item.contentType === input.filter!.contentType);
      }

      return { items, nextCursor: undefined };
    }),

  home: protectedProcedure.query(() => {
    // TODO: Replace with D1 query
    return getMockHomeData();
  }),

  get: protectedProcedure.input(z.object({ id: z.string() })).query(({ input }) => {
    // TODO: Replace with D1 query
    const item = MOCK_ITEMS.find((item) => item.id === input.id);
    if (!item) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Item ${input.id} not found`,
      });
    }
    return item;
  }),

  bookmark: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => {
    // TODO: Implement with D1
    console.log(`[MOCK] Bookmarking item ${input.id}`);
    return { success: true as const };
  }),

  archive: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => {
    // TODO: Implement with D1
    console.log(`[MOCK] Archiving item ${input.id}`);
    return { success: true as const };
  }),

  updateProgress: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        position: z.number().min(0),
        duration: z.number().min(0),
      })
    )
    .mutation(({ input }) => {
      // TODO: Implement with D1
      console.log(`[MOCK] Updating progress for ${input.id}: ${input.position}/${input.duration}`);
      return { success: true as const };
    }),
});
```

### Transition to Real Database

When ready to implement D1:

1. Create D1 database and run Drizzle migrations
2. Update `wrangler.toml` with D1 binding
3. Replace mock data helpers with Drizzle queries
4. Remove `mock-data.ts` file
5. Each procedure has a `// TODO: Replace with D1 query` comment marking the transition point

### Drizzle Migration Setup

**Required packages:**

```json
// apps/worker/package.json
{
  "dependencies": {
    "drizzle-orm": "^0.34.0",
    "@hono/trpc-server": "^0.3.0",
    "@trpc/server": "^11.0.0",
    "superjson": "^2.2.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "drizzle-kit": "^0.28.0"
  }
}
```

**Drizzle config:**

```typescript
// apps/worker/drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'sqlite',
  driver: 'd1-http',
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    databaseId: process.env.D1_DATABASE_ID!,
    token: process.env.CLOUDFLARE_API_TOKEN!,
  },
});
```

**Migration commands:**

```bash
# Generate migration from schema changes
bun drizzle-kit generate

# Apply migrations to D1 (remote)
bun drizzle-kit migrate

# For local development with wrangler d1
wrangler d1 migrations apply zine-db --local
```

**D1 initialization in worker:**

```typescript
// apps/worker/src/db/index.ts
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Database = ReturnType<typeof createDb>;
```

**Update tRPC context:**

```typescript
// apps/worker/src/trpc/context.ts
import { createDb } from '../db';
import type { Context } from 'hono';
import type { Env } from '../types';

export async function createContext(c: Context<Env>) {
  const userId = c.get('userId');
  const db = createDb(c.env.DB);

  return { userId, db, env: c.env };
}

export type TRPCContext = Awaited<ReturnType<typeof createContext>>;
```

---

## Migration Notes

1. **Domain types are preserved**: `Item`, `UserItem`, `Source`, `ContentType`, `Provider`, `UserItemState` remain conceptually the same but are now backed by D1/Drizzle.

2. **Auth is preserved**: Clerk JWT verification in `apps/worker/src/lib/auth.ts` is architecture-agnostic.

3. **Webhook handling is preserved**: Svix webhook verification logic remains the same, but handler implementations need refactoring (see Architecture Review section).

4. **No offline support by default**: Replicache provided offline-first capabilities. The new architecture will be online-only unless you add service worker caching or similar. **This is a significant UX regression from the original vision** - see Architecture Review for mitigation options.

5. **Type sharing**: The tRPC router types will be exported from the worker package and consumed by the mobile app, providing end-to-end type safety. See Architecture Review for monorepo integration details.

6. **Optimistic updates require explicit implementation**: Unlike Replicache's built-in optimistic mutations, React Query requires manual optimistic update code for each mutation. See Architecture Review for patterns.

---

## Parallelization & Dependency Guide

This section defines which tasks can run in parallel and the critical dependencies.

### Dependency Graph (Execution Order)

```
PHASE 0: INFRASTRUCTURE (3 parallel tracks possible)
├── Track A: Add dependencies to worker
├── Track B: Create D1 databases in Cloudflare
│   └── Then: Configure wrangler.toml (needs DB IDs)
└── Track C: Create drizzle.config.ts (after deps installed)

PHASE 1: SCHEMA & FOUNDATION
├── Track A (Sequential):
│   └── Drizzle schema → DB init module → Generate migration
├── Track B (Parallel with A after deps):
│   └── tRPC instance → tRPC context (needs DB init)
├── Track C (Independent):
│   └── Auth middleware update
└── Track D (After wrangler.toml):
    └── Update types.ts with DB binding

PHASE 2: IMPLEMENT tRPC ROUTERS (before deleting old code!)
├── Create mock data (parallel start)
├── Items router ──┐
├── Sources router ┼── (can be parallel) → Root router → Export types
└── Integrate with Hono (needs root router + auth middleware)

PHASE 3: DELETE OLD CODE (only after Phase 2 complete!)
├── Delete DO directory → Delete sync routes → Delete lib/db.ts
└── Refactor auth routes for D1

PHASE 4: MOBILE MIGRATION
├── Track A: Add deps → tRPC client → TRPCProvider → Update _layout.tsx
├── Track B: Create new hooks → Add optimistic updates
└── Track C: Delete Replicache files (after A and B complete)

PHASE 5: SHARED PACKAGE CLEANUP (after mobile stops importing)
├── Delete sync types, mutators, keys.ts
├── Update schemas, index.ts exports
└── Update package.json

PHASE 6: TESTING (can start incrementally during earlier phases)
├── Router unit tests (after routers complete)
├── DB query tests (after schema complete)
└── Integration tests + CI verification
```

### Critical Ordering Rules

1. **Never delete old code until new code is wired up**: Phase 3 (Delete) must wait for Phase 2 (Implement tRPC) to complete.

2. **Mobile can't delete Replicache until TRPCProvider is in \_layout.tsx**: The app would crash with no data layer.

3. **Shared package cleanup is last**: Both worker and mobile must stop importing before deletion.

4. **Domain types update is foundational**: `zine-tn7` should be done early in Phase 1, not Phase 4.

### Parallelization Opportunities

| Phase | Parallel Tracks | Notes                                                 |
| ----- | --------------- | ----------------------------------------------------- |
| 0     | 3 tracks        | Deps, D1 creation, and drizzle.config are independent |
| 1     | 4 tracks        | Schema, tRPC setup, auth middleware, types.ts         |
| 2     | 2 tracks        | Items router and sources router can be parallel       |
| 4     | 3 tracks        | Deps/client, new hooks, domain types update           |

### Worker Allocation Suggestion

For optimal parallelization with multiple workers:

**Worker 1 (Backend/Infrastructure)**:

- Phase 0 → Phase 1 Schema track → Phase 2 Items router → Phase 3

**Worker 2 (Backend/tRPC)**:

- Phase 1 tRPC track → Phase 2 Sources router → Testing

**Worker 3 (Mobile)**:

- Phase 1 Domain types → Phase 4 → Phase 5

---

## Implementation Checklist

Use this checklist to track migration progress:

### Phase 0: Preparation

- [ ] Create D1 databases in Cloudflare dashboard (staging + production)
- [ ] Set up Drizzle ORM with D1 adapter
- [ ] Configure `drizzle.config.ts`
- [ ] Run initial schema migration
- [ ] Update `wrangler.toml` with D1 binding
- [ ] **Update domain types in `packages/shared/src/types/domain.ts`** (add missing fields)
- [ ] Verify existing enum values remain UPPERCASE

### Phase 1: Backend Migration

- [ ] Delete Durable Objects directory (`src/durable-objects/`)
- [ ] Delete sync routes (`src/routes/sync.ts`, `sync.test.ts`)
- [ ] Delete database utilities (`src/lib/db.ts`)
- [ ] Create tRPC router structure (`src/trpc/`)
- [ ] Create `src/db/schema.ts` with Drizzle schema (including `providerItemsSeen`)
- [ ] Create `src/db/index.ts` for DB initialization
- [ ] Create `src/trpc/context.ts` for tRPC context
- [ ] Create `src/trpc/trpc.ts` for tRPC initialization with auth
- [ ] Implement items router with mock data
- [ ] Implement sources router with mock data
- [ ] Refactor auth routes to use D1 (handleUserCreated, handleUserDeleted, /me, /account)
- [ ] Update auth middleware for tRPC context
- [ ] Update `src/index.ts` to mount tRPC at `/trpc`
- [ ] Remove `USER_DO` from types and wrangler.toml
- [ ] Add `DB: D1Database` to Bindings interface

### Phase 2: Shared Package Cleanup

- [ ] Delete `src/types/sync.ts`
- [ ] Delete `src/mutators/index.ts`
- [ ] Delete `src/constants/keys.ts`
- [ ] Update `src/schemas/index.ts` (remove sync schemas)
- [ ] Update `src/index.ts` exports
- [ ] Remove Replicache peer dependency from `package.json`
- [ ] **Keep domain types with UPPERCASE enum values**

### Phase 3: Mobile Client Migration

- [ ] Install React Query and tRPC client (`@tanstack/react-query`, `@trpc/client`, `@trpc/react-query`)
- [ ] Remove Replicache dependencies (`replicache`, `replicache-react`)
- [ ] Delete `lib/replicache.ts`
- [ ] Delete `providers/replicache-provider.tsx`
- [ ] Delete `hooks/use-items.ts`
- [ ] Delete `lib/mock-data.ts`
- [ ] Create `lib/trpc.ts` (tRPC client with type import from worker)
- [ ] Create `providers/trpc-provider.tsx`
- [ ] Create new data hooks using tRPC (`useInboxItems`, `useLibraryItems`, `useHomeData`)
- [ ] Update `_layout.tsx` to use TRPCProvider
- [ ] Update tab screens to use new hooks
- [ ] Implement optimistic updates for mutations (bookmark, archive)
- [ ] Configure React Query for error handling

### Phase 4: Replace Mock Data with D1

- [ ] Implement items.inbox query with Drizzle (with cursor pagination)
- [ ] Implement items.library query with Drizzle (with cursor pagination)
- [ ] Implement items.home query with Drizzle
- [ ] Implement items.get query with Drizzle (with proper TRPCError handling)
- [ ] Implement items.bookmark mutation
- [ ] Implement items.archive mutation
- [ ] Implement items.updateProgress mutation
- [ ] Implement sources.list query
- [ ] Implement sources.add mutation
- [ ] Implement sources.remove mutation (soft delete)
- [ ] Delete mock data file

### Phase 5: Ingestion Pipeline

- [ ] Add cron trigger to `wrangler.toml`
- [ ] Implement `scheduled` handler in `src/index.ts`
- [ ] Create ingestion orchestrator (`src/ingestion/pipeline.ts`)
- [ ] Implement idempotency check using `providerItemsSeen` table
- [ ] Create provider-specific fetchers (YouTube, RSS, etc.)
- [ ] Handle ingestion failures gracefully (per-item isolation)
- [ ] Test cron execution in staging

### Phase 6: Testing & Verification

- [ ] Write unit tests for tRPC routers using `@cloudflare/vitest-pool-workers`
- [ ] Write integration tests for API
- [ ] Test auth webhook flows (user.created, user.deleted)
- [ ] Verify type safety end-to-end (TypeScript compilation)
- [ ] Test error handling (NOT_FOUND, UNAUTHORIZED, etc.)
- [ ] Test cursor pagination with realistic data volume
- [ ] Performance testing with 1000+ items per user

### Phase 7: Future Enhancements (Post-MVP)

- [ ] Add React Query persistence for offline cache (`@tanstack/query-sync-storage-persister`)
- [ ] Add X/Twitter provider support
- [ ] Consider service worker for offline reads
- [ ] Add rate limiting to tRPC routes
- [ ] Consider Cloudflare Queues for reliable ingestion

---

## Key Decisions Summary

This section summarizes the critical architectural decisions made in this document.

### Decided

| Decision           | Choice                                  | Rationale                                                     |
| ------------------ | --------------------------------------- | ------------------------------------------------------------- |
| Enum casing        | **UPPERCASE** (preserve existing)       | Avoids data migration, maintains type compatibility           |
| Offline support    | **Deferred to post-MVP**                | Reduces scope, React Query persistence is incremental         |
| Item sharing model | **Canonical items shared across users** | Storage efficiency, UserItem provides per-user state          |
| Pagination         | **Cursor-based**                        | Handles insertions/deletions gracefully                       |
| Ingestion trigger  | **Cron-scheduled Workers**              | Simple, D1-compatible, no Queues complexity                   |
| Data migration     | **Accept data loss for pre-launch**     | No production users yet; add migration script later if needed |

### Risks to Monitor

| Risk                              | Likelihood | Impact | Mitigation                                                     |
| --------------------------------- | ---------- | ------ | -------------------------------------------------------------- |
| D1 10GB limit                     | Low (MVP)  | High   | Monitor database size; consider sharding if needed             |
| D1 single-region writes           | Medium     | Medium | Accept higher latency for global users initially               |
| Loss of offline-first             | High       | High   | Communicate limitation; add React Query persistence in Phase 7 |
| Ingestion failures blocking users | Low        | Medium | Per-item isolation; failures logged but don't block            |
| Type mismatches during migration  | Medium     | Medium | Comprehensive TypeScript checking; update domain types first   |

### Open Questions

1. **Should we add database connection pooling?** D1 has automatic connection management, but high-concurrency scenarios may need optimization.

2. **How should we handle very long podcasts/videos in progress tracking?** Current design uses integer seconds; consider if this is sufficient for 10+ hour content.

3. **Should `items.home` be a single query or multiple parallel queries?** Single query is simpler but may have higher latency; multiple queries can fail independently.

---

## Document Changelog

| Date    | Change                                                     |
| ------- | ---------------------------------------------------------- |
| Initial | Original analysis document                                 |
| Review  | Added enum casing consistency (UPPERCASE)                  |
| Review  | Added `providerItemsSeen` table for ingestion idempotency  |
| Review  | Added domain type mismatch analysis                        |
| Review  | Added cursor pagination implementation details             |
| Review  | Added data migration strategy section                      |
| Review  | Added ingestion pipeline recommendation                    |
| Review  | Added Drizzle migration setup                              |
| Review  | Added error code standardization                           |
| Review  | Added rate limiting consideration                          |
| Review  | Expanded implementation checklist with Phase 5 (Ingestion) |
| Review  | Added Key Decisions Summary and Risks                      |
| Review  | Added parallelization guide and dependency graph           |
| Review  | Fixed TRPCProvider useState pattern                        |
| Review  | Added superjson transformer requirement                    |
| Review  | Clarified Clerk token integration                          |
