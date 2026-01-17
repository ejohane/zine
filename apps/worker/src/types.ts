/**
 * Cloudflare Worker type definitions
 */

import type { Context } from 'hono';

/**
 * Environment bindings available to the Worker
 */
export interface Bindings {
  /** D1 database for persistent storage */
  DB: D1Database;
  /** KV namespace for webhook idempotency */
  WEBHOOK_IDEMPOTENCY: KVNamespace;
  /** KV namespace for OAuth state storage */
  OAUTH_STATE_KV: KVNamespace;
  /** KV namespace for Spotify show metadata cache */
  SPOTIFY_CACHE: KVNamespace;
  /** R2 bucket for article content storage */
  ARTICLE_CONTENT: R2Bucket;
  /** Current environment (development, staging, production) */
  ENVIRONMENT: string;
  /** Clerk publishable key */
  CLERK_PUBLISHABLE_KEY?: string;
  /** Clerk secret key for backend operations */
  CLERK_SECRET_KEY?: string;
  /** Clerk JWKS URL for token verification */
  CLERK_JWKS_URL?: string;
  /** Clerk webhook signing secret for Svix verification */
  CLERK_WEBHOOK_SECRET?: string;
  /** AES-256 encryption key for OAuth tokens (hex string) */
  ENCRYPTION_KEY?: string;
  /** Google OAuth client ID for YouTube */
  GOOGLE_CLIENT_ID?: string;
  /** Google OAuth client secret for YouTube */
  GOOGLE_CLIENT_SECRET?: string;
  /** Spotify OAuth client ID */
  SPOTIFY_CLIENT_ID?: string;
  /** Spotify OAuth client secret */
  SPOTIFY_CLIENT_SECRET?: string;
  /** OAuth redirect URI */
  OAUTH_REDIRECT_URI?: string;
  /** Spotify episode fetch concurrency limit (default: 5) */
  SPOTIFY_EPISODE_FETCH_CONCURRENCY?: string;
  /** User processing concurrency limit for multi-user parallel polling (default: 10) */
  USER_PROCESSING_CONCURRENCY?: string;
  /** Maximum safe batch size before logging warning (default: 500) */
  SPOTIFY_MAX_SAFE_BATCH_SIZE?: string;
  /** Critical batch size threshold before logging error (default: 1000) */
  SPOTIFY_CRITICAL_BATCH_SIZE?: string;
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
