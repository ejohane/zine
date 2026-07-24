/**
 * Cloudflare Worker type definitions
 */

import type { Context } from 'hono';
import type { ArticleBodyQueueMessage } from './article-body/types';
import type { EnrichmentQueueMessage } from './enrichment/types';
import type { SyncQueueMessage } from './sync/types';

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
  /** KV namespace for creator content cache (10-minute TTL) */
  CREATOR_CONTENT_CACHE: KVNamespace;
  /** R2 bucket for article content storage */
  ARTICLE_CONTENT: R2Bucket;
  /** Workers AI binding for enrichment and embeddings */
  AI?: Ai;
  /** Cloudflare Vectorize index for item embeddings */
  ITEM_VECTORS?: VectorizeIndex;
  /** Current environment (development, staging, production) */
  ENVIRONMENT: string;
  /** Workers AI model used for bookmark enrichment */
  ENRICHMENT_MODEL?: string;
  /** Workers AI model used for item embeddings */
  EMBEDDING_MODEL?: string;
  /** Embedding vector dimensions */
  EMBEDDING_DIMENSIONS?: string;
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
  /** Google OAuth client ID for YouTube/Gmail */
  GOOGLE_CLIENT_ID?: string;
  /** Google OAuth client secret for YouTube/Gmail */
  GOOGLE_CLIENT_SECRET?: string;
  /** Spotify OAuth client ID */
  SPOTIFY_CLIENT_ID?: string;
  /** Spotify OAuth client secret */
  SPOTIFY_CLIENT_SECRET?: string;
  /** X OAuth client ID */
  X_CLIENT_ID?: string;
  /** X OAuth client secret (optional for PKCE public clients) */
  X_CLIENT_SECRET?: string;
  /** X API bearer token for app-level public profile lookup */
  X_BEARER_TOKEN?: string;
  /** Clerk user ID whose active X OAuth connection is used for user-context profile search */
  X_PROFILE_SEARCH_USER_ID?: string;
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
  /** Lock handoff wait for token refresh contention retries in milliseconds (default: 2000) */
  TOKEN_REFRESH_LOCK_WAIT_MS?: string;
  /** Release git SHA for diagnostics correlation */
  RELEASE_GIT_SHA?: string;
  /** Release build identifier for diagnostics correlation */
  RELEASE_BUILD_ID?: string;
  /** ISO deployment timestamp for diagnostics correlation */
  RELEASE_DEPLOYED_AT?: string;
  /** Optional rollout ring or percentage */
  RELEASE_RING?: string;
  /** Secret for privileged enrichment backfill operations */
  ENRICHMENT_BACKFILL_SECRET?: string;
  /** Secret for privileged article-body cohort/backfill operations */
  ARTICLE_BODY_BACKFILL_SECRET?: string;
  /** Opt-in switch for article-body queue production and consumption. */
  ARTICLE_BODY_PIPELINE_ENABLED?: string;
  /** Controlled automatic article-body enrollment: off, reader, saved, or all. */
  ARTICLE_BODY_ENROLLMENT_MODE?: string;
  /** Queue for async pull-to-refresh sync (optional - not available in all envs) */
  SYNC_QUEUE?: Queue<SyncQueueMessage>;
  /** Queue for async bookmark enrichment (optional - not available in all envs) */
  ENRICHMENT_QUEUE?: Queue<EnrichmentQueueMessage>;
  /** Queue for durable article-body acquisition (optional - not available in all envs) */
  ARTICLE_BODY_QUEUE?: Queue<ArticleBodyQueueMessage>;
}

/**
 * Variables available in Hono context
 */
export interface Variables {
  /** Authenticated user ID from Clerk */
  userId: string | null;
  /** Unique request ID for tracing */
  requestId: string;
  /** Trace ID propagated from the client or generated at the edge */
  traceId: string;
  /** Optional client-side request ID for mobile correlation */
  clientRequestId: string | undefined;
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
