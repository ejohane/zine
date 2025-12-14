// apps/worker/src/trpc/router.ts
import { router } from './trpc';
import { itemsRouter } from './routers/items';
import { sourcesRouter } from './routers/sources';

/**
 * Root tRPC router
 *
 * Combines all sub-routers:
 * - items: User item operations (inbox, library, bookmark, archive, etc.)
 * - sources: User subscription operations (list, add, remove)
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
 *
 * // Mutations
 * trpc.items.bookmark.useMutation()
 * trpc.sources.add.useMutation()
 * ```
 */
export const appRouter = router({
  items: itemsRouter,
  sources: sourcesRouter,
});

export type AppRouter = typeof appRouter;
