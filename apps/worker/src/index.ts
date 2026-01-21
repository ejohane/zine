/**
 * @zine/worker - Cloudflare Workers backend
 *
 * Hono application entry point with middleware and route configuration.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { trpcServer } from '@hono/trpc-server';
import { ZINE_VERSION } from '@zine/shared';
import type { Bindings, Env } from './types';
import { pollProviderSubscriptions } from './polling/scheduler';
import { handleSyncQueue } from './sync/consumer';
import { handleSyncDLQ } from './sync/dlq-consumer';
import type { SyncQueueMessage } from './sync/types';
import { logger } from './lib/logger';
import { authMiddleware } from './middleware/auth';
import authRoutes from './routes/auth';
import { appRouter } from './trpc/router';
import { createContext } from './trpc/context';

// Create Hono app with typed environment
const app = new Hono<Env>();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Request ID generator middleware
 * Adds a unique request ID to each request for tracing
 */
app.use('*', async (c, next) => {
  const requestId = crypto.randomUUID();
  c.set('requestId', requestId);
  c.header('X-Request-ID', requestId);
  await next();
});

/**
 * Logger middleware - logs requests to console
 */
app.use('*', honoLogger());

/**
 * CORS middleware - allow cross-origin requests
 *
 * Note: React Native/Expo mobile apps don't require CORS since requests
 * come from native HTTP clients. These origins are primarily for:
 * - Local development with Expo web
 * - Web builds (Expo web output)
 */
app.use(
  '*',
  cors({
    origin: (origin) => {
      // Development: Allow any localhost port (for worktree isolation)
      // This covers Expo dev server, any webpack dev server, etc.
      if (origin?.match(/^http:\/\/localhost:\d+$/)) return origin;

      // Android emulator: 10.0.2.2 is the special alias for host machine
      // This is only needed for Expo web running in Android emulator's Chrome
      if (origin?.match(/^http:\/\/10\.0\.2\.2:\d+$/)) return origin;

      // Production: Explicit allowlist
      if (origin === 'https://myzine.app') return origin;
      if (origin === 'https://www.myzine.app') return origin;

      // Reject all other origins
      return null;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['X-Request-ID'],
    maxAge: 86400,
  })
);

// ---------------------------------------------------------------------------
// Health Check (unauthenticated)
// ---------------------------------------------------------------------------

/**
 * GET /health
 *
 * Health check endpoint for monitoring and deployment verification.
 * Returns version, environment, and timestamp.
 */
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    version: ZINE_VERSION,
    environment: c.env.ENVIRONMENT || 'development',
    timestamp: new Date().toISOString(),
    requestId: c.get('requestId'),
  });
});

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------

// Mount auth routes first (webhook endpoint handles its own auth via Svix)
app.route('/api/auth', authRoutes);

// ---------------------------------------------------------------------------
// tRPC Routes
// ---------------------------------------------------------------------------

// Apply auth middleware to tRPC routes (required for protected procedures)
app.use('/trpc/*', authMiddleware());

// Mount tRPC server
app.use(
  '/trpc/*',
  trpcServer({
    router: appRouter,
    createContext: (_opts, c) => createContext(c),
  })
);

// ---------------------------------------------------------------------------
// 404 Handler
// ---------------------------------------------------------------------------

app.notFound((c) => {
  return c.json(
    {
      error: 'Not Found',
      code: 'NOT_FOUND',
      path: c.req.path,
      requestId: c.get('requestId'),
    },
    404
  );
});

// ---------------------------------------------------------------------------
// Error Handler
// ---------------------------------------------------------------------------

app.onError((err, c) => {
  logger.error('Unhandled error', { error: err, path: c.req.path });

  return c.json(
    {
      error: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
      message: c.env.ENVIRONMENT === 'development' ? err.message : undefined,
      requestId: c.get('requestId'),
    },
    500
  );
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export default {
  /**
   * HTTP request handler (Hono app)
   */
  fetch: app.fetch,

  /**
   * Scheduled handler for cron-triggered content polling.
   *
   * Configured in wrangler.toml with `[triggers]` section.
   * Two cron jobs run independently:
   * - "0 * * * *"  → YouTube polling at top of hour
   * - "30 * * * *" → Spotify polling at 30 minutes past
   *
   * Each provider has its own distributed lock for failure isolation.
   *
   * @see /features/subscriptions/backend-spec.md - Section 3: Polling Architecture
   */
  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext): Promise<void> {
    // Map cron expression to provider
    // "0 * * * *" → YouTube (top of hour)
    // "30 * * * *" → Spotify (mid-hour)
    const provider = event.cron === '0 * * * *' ? 'YOUTUBE' : 'SPOTIFY';

    // Use waitUntil to ensure the polling completes even if the
    // scheduled handler returns early
    ctx.waitUntil(pollProviderSubscriptions(provider, env, ctx));
  },

  /**
   * Queue handler for async pull-to-refresh sync and DLQ monitoring.
   *
   * Handles two queues:
   * 1. SYNC_QUEUE: Primary sync queue for processing subscriptions
   *    - Non-blocking pull-to-refresh (< 500ms response time)
   *    - Error isolation (one subscription failing doesn't affect others)
   *    - Automatic retries (3 attempts before DLQ)
   *
   * 2. SYNC_DLQ: Dead Letter Queue for failed messages
   *    - Captures messages that exhausted all retries
   *    - Logs at ERROR level for Cloudflare dashboard alerts
   *    - Stores entries in KV for investigation and potential replay
   *
   * The queue name is available in batch.queue to differentiate handlers.
   *
   * @see zine-wsjp: Feature: Async Pull-to-Refresh with Cloudflare Queues
   * @see zine-m2oq: Task: Add monitoring/alerting for sync queue DLQ
   */
  async queue(
    batch: MessageBatch<SyncQueueMessage>,
    env: Bindings,
    _ctx: ExecutionContext
  ): Promise<void> {
    // Route to appropriate handler based on queue name
    // DLQ queue names end with '-dlq-{env}'
    if (batch.queue.includes('-dlq-')) {
      await handleSyncDLQ(batch, env);
    } else {
      await handleSyncQueue(batch, env);
    }
  },
};
