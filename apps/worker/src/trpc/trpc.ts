/**
 * tRPC Server Configuration
 *
 * Initializes the tRPC instance for the Cloudflare Worker backend.
 * Configures the transformer (superjson) for proper serialization and
 * exports base procedures for building the API router.
 *
 * @module
 */

import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import type { TRPCContext } from './context';

/**
 * tRPC instance configured with the worker's context type.
 * Uses superjson transformer for proper Date and other complex type serialization.
 */
const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

/** Base router factory for creating tRPC routers */
export const router = t.router;

/** Public procedure - no authentication required */
export const publicProcedure = t.procedure;

/**
 * Protected procedure - requires authenticated user.
 *
 * Throws UNAUTHORIZED error if no userId is present in context.
 * Narrows the context type to guarantee userId is defined for handlers.
 */
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});
