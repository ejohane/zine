// apps/worker/src/trpc/router.ts
import { router } from './trpc';
import { itemsRouter } from './routers/items';
import { sourcesRouter } from './routers/sources';
import { subscriptionsRouter } from './routers/subscriptions';
import { connectionsRouter } from './routers/connections';

/**
 * Root tRPC router
 *
 * Combines all sub-routers:
 * - items: User item operations (inbox, library, bookmark, archive, etc.)
 * - sources: User subscription operations (list, add, remove) [legacy]
 * - subscriptions: OAuth-based subscriptions (YouTube, Spotify)
 *   - subscriptions.connections: OAuth provider connection management
 *   - subscriptions.list/add/remove: Subscription CRUD
 *   - subscriptions.discover: Browse available channels/shows
 *
 * Client usage:
 * ```typescript
 * import type { AppRouter } from '@zine/worker/src/trpc/router';
 * const trpc = createTRPCReact<AppRouter>();
 *
 * // Queries
 * trpc.items.inbox.useQuery()
 * trpc.items.library.useQuery()
 * trpc.sources.list.useQuery()
 * trpc.subscriptions.list.useQuery()
 * trpc.subscriptions.connections.list.useQuery()
 *
 * // Mutations
 * trpc.items.bookmark.useMutation()
 * trpc.sources.add.useMutation()
 * trpc.subscriptions.connections.registerState.useMutation()
 * ```
 */
export const appRouter = router({
  items: itemsRouter,
  sources: sourcesRouter,
  subscriptions: router({
    // OAuth connection management
    connections: connectionsRouter,
    // Spread subscription operations at this level
    list: subscriptionsRouter.list,
    add: subscriptionsRouter.add,
    remove: subscriptionsRouter.remove,
    pause: subscriptionsRouter.pause,
    resume: subscriptionsRouter.resume,
    syncNow: subscriptionsRouter.syncNow,
    syncAll: subscriptionsRouter.syncAll,
    discover: subscriptionsRouter.discover,
  }),
});

export type AppRouter = typeof appRouter;
