// apps/worker/src/trpc/router.ts
import { router } from './trpc';
import { itemsRouter } from './routers/items';
import { subscriptionsRouter } from './routers/subscriptions';
import { connectionsRouter } from './routers/connections';
import { bookmarksRouter } from './routers/bookmarks';
import { creatorsRouter } from './routers/creators';
import { adminRouter } from './routers/admin';

/**
 * Root tRPC router
 *
 * Combines all sub-routers:
 * - items: User item operations (inbox, library, bookmark, archive, etc.)
 * - bookmarks: Manual link saving (preview, save)
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
 * trpc.bookmarks.preview.useQuery({ url })
 * trpc.subscriptions.list.useQuery()
 * trpc.subscriptions.connections.list.useQuery()
 *
 * // Mutations
 * trpc.items.bookmark.useMutation()
 * trpc.bookmarks.save.useMutation()
 * trpc.subscriptions.connections.registerState.useMutation()
 * ```
 */
export const appRouter = router({
  items: itemsRouter,
  bookmarks: bookmarksRouter,
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
    syncAllAsync: subscriptionsRouter.syncAllAsync,
    syncStatus: subscriptionsRouter.syncStatus,
    activeSyncJob: subscriptionsRouter.activeSyncJob,
    discover: subscriptionsRouter.discover,
  }),
  // Admin operations (data repair, diagnostics)
  admin: adminRouter,
  // Creator view operations
  creators: creatorsRouter,
});

export type AppRouter = typeof appRouter;
