import { TRPCError } from '@trpc/server';
import type { Context } from 'hono';
import type { Env } from '../../types';

export function trpcErrorResponse(c: Context<Env>, error: unknown) {
  if (error instanceof TRPCError) {
    if (error.code === 'NOT_FOUND') {
      return c.json(
        {
          error: error.message,
          code: 'NOT_FOUND',
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        404
      );
    }

    if (error.code === 'BAD_REQUEST') {
      return c.json(
        {
          error: error.message,
          code: 'BAD_REQUEST',
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        400
      );
    }

    if (error.code === 'UNAUTHORIZED') {
      return c.json(
        {
          error: 'Unauthorized',
          code: 'UNAUTHORIZED',
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        401
      );
    }

    if (error.code === 'PRECONDITION_FAILED') {
      return c.json(
        {
          error: error.message,
          code: 'PRECONDITION_FAILED',
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        412
      );
    }

    if (error.code === 'TOO_MANY_REQUESTS') {
      return c.json(
        {
          error: error.message,
          code: 'RATE_LIMITED',
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        429
      );
    }
  }

  throw error;
}
