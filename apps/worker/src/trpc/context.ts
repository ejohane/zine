import { createDb } from '../db';
import type { Context } from 'hono';
import type { Env } from '../types';

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
  const db = createDb(c.env.DB);
  return { userId, db, env: c.env };
}

export type TRPCContext = Awaited<ReturnType<typeof createContext>>;
