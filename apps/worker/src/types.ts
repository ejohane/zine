/**
 * Cloudflare Worker type definitions
 */

import type { Context } from 'hono';

/**
 * Environment bindings available to the Worker
 */
export interface Bindings {
  /** User Durable Object namespace for per-user state */
  USER_DO: DurableObjectNamespace;
  /** Current environment (development, staging, production) */
  ENVIRONMENT: string;
  /** Clerk publishable key */
  CLERK_PUBLISHABLE_KEY?: string;
  /** Clerk secret key for backend operations */
  CLERK_SECRET_KEY?: string;
  /** Clerk JWKS URL for token verification */
  CLERK_JWKS_URL?: string;
}

/**
 * Variables available in Hono context
 */
export interface Variables {
  /** Authenticated user ID from Clerk */
  userId: string | null;
  /** Unique request ID for tracing */
  requestId: string;
}

/**
 * Combined environment type for Hono app
 */
export type Env = {
  Bindings: Bindings;
  Variables: Variables;
};

/**
 * Hono Context type with our environment
 */
export type AppContext = Context<Env>;
