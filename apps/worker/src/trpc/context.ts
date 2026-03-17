import type { ReleaseContext } from '@zine/shared';
import { createDb, ensureRecapSchema } from '../db';
import type { Context } from 'hono';
import type { Env } from '../types';
import { getEnvironmentName, getWorkerRelease } from '../lib/telemetry';

/**
 * Create tRPC context from Hono request context
 *
 * Provides:
 * - userId: Authenticated user ID from auth middleware (null if not authenticated)
 * - db: Drizzle database client connected to D1
 * - env: Cloudflare Worker environment bindings
 */
export async function createContext(c: Context<Env>) {
  const userId = c.get('userId');
  const requestId = c.get('requestId');
  const traceId = c.get('traceId');
  const clientRequestId = c.get('clientRequestId');
  await ensureRecapSchema(c.env.DB);
  const db = createDb(c.env.DB);
  return {
    userId,
    db,
    env: c.env,
    requestId,
    traceId,
    clientRequestId,
    environment: getEnvironmentName(c.env),
    release: getWorkerRelease(c.env),
  };
}

export type TRPCContext = Awaited<ReturnType<typeof createContext>>;

export type ContextRelease = ReleaseContext;
