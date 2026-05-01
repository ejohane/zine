import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { router, protectedProcedure } from '../trpc';
import {
  getXBookmarkStatus,
  syncXBookmarksForUser,
  updateXBookmarkSettings,
  XBookmarkSyncBlockedError,
} from '../../x-bookmarks/service';
import { XAuthError, XRateLimitError } from '../../providers/x';
import type { TokenRefreshEnv } from '../../lib/token-refresh';

export const xBookmarksRouter = router({
  status: protectedProcedure.query(async ({ ctx }) => {
    return getXBookmarkStatus(ctx.userId, ctx.db);
  }),

  updateSettings: protectedProcedure
    .input(z.object({ dailySyncEnabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await updateXBookmarkSettings({
          userId: ctx.userId,
          db: ctx.db,
          dailySyncEnabled: input.dailySyncEnabled,
        });
      } catch (error) {
        throw toTRPCError(error);
      }
    }),

  syncNow: protectedProcedure
    .input(z.object({ bypassCooldown: z.boolean().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      try {
        return await syncXBookmarksForUser({
          userId: ctx.userId,
          db: ctx.db,
          env: ctx.env as TokenRefreshEnv,
          mode: 'manual',
          bypassCooldown: ctx.env.ENVIRONMENT === 'development' && input?.bypassCooldown === true,
        });
      } catch (error) {
        throw toTRPCError(error);
      }
    }),
});

function toTRPCError(error: unknown): TRPCError {
  if (error instanceof XBookmarkSyncBlockedError) {
    const code =
      error.code === 'COOLDOWN' || error.code === 'RATE_LIMITED'
        ? 'TOO_MANY_REQUESTS'
        : 'PRECONDITION_FAILED';
    return new TRPCError({
      code,
      message: error.message,
      cause: { retryAt: error.retryAt, reason: error.code },
    });
  }

  if (error instanceof XRateLimitError) {
    return new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: error.message,
      cause: { retryAt: error.resetAt },
    });
  }

  if (error instanceof XAuthError) {
    return new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'X connection needs to be reconnected before syncing bookmarks.',
      cause: error,
    });
  }

  return new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: error instanceof Error ? error.message : 'Failed to sync X bookmarks',
    cause: error,
  });
}

export type XBookmarksRouter = typeof xBookmarksRouter;
