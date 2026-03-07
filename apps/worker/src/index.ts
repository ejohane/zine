/**
 * @zine/worker - Cloudflare Workers backend
 *
 * Hono application entry point with middleware and route configuration.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { trpcServer } from '@hono/trpc-server';
import {
  ZINE_VERSION,
  TELEMETRY_CLIENT_REQUEST_HEADER,
  TELEMETRY_REQUEST_HEADER,
  TELEMETRY_TRACE_HEADER,
} from '@zine/shared';
import type { Bindings, Env } from './types';
import { pollProviderSubscriptions } from './polling/scheduler';
import { pollGmailNewsletters } from './newsletters/gmail';
import { pollRssFeeds } from './rss/service';
import { handleSyncQueue } from './sync/consumer';
import { handleSyncDLQ } from './sync/dlq-consumer';
import type { SyncQueueMessage } from './sync/types';
import { logger } from './lib/logger';
import { createWorkerRequestTelemetry, getWorkerRelease } from './lib/telemetry';
import { authMiddleware } from './middleware/auth';
import authRoutes from './routes/auth';
import { appRouter } from './trpc/router';
import { createContext } from './trpc/context';
import { getDependencyHealth, getQueueHealth } from './diagnostics/health';

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
  const telemetry = createWorkerRequestTelemetry(c);

  c.set('requestId', telemetry.requestId);
  c.set('traceId', telemetry.traceId);
  c.set('clientRequestId', telemetry.clientRequestId);

  c.header(TELEMETRY_REQUEST_HEADER, telemetry.requestId);
  c.header(TELEMETRY_TRACE_HEADER, telemetry.traceId);
  if (telemetry.clientRequestId) {
    c.header(TELEMETRY_CLIENT_REQUEST_HEADER, telemetry.clientRequestId);
  }
  await next();
});

/**
 * Structured request logging middleware.
 */
app.use('*', async (c, next) => {
  const startedAt = Date.now();
  await next();

  logger.info('HTTP request completed', {
    service: 'worker',
    env: c.env.ENVIRONMENT || 'development',
    operation: 'http.request',
    event: 'http.request.completed',
    status: c.res.status >= 500 ? 'error' : 'ok',
    method: c.req.method,
    path: c.req.path,
    httpStatus: c.res.status,
    durationMs: Date.now() - startedAt,
    requestId: c.get('requestId'),
    traceId: c.get('traceId'),
    clientRequestId: c.get('clientRequestId'),
    release: getWorkerRelease(c.env),
  });
});

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
    allowHeaders: [
      'Content-Type',
      'Authorization',
      TELEMETRY_TRACE_HEADER,
      TELEMETRY_CLIENT_REQUEST_HEADER,
    ],
    exposeHeaders: [
      TELEMETRY_REQUEST_HEADER,
      TELEMETRY_TRACE_HEADER,
      TELEMETRY_CLIENT_REQUEST_HEADER,
    ],
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
    service: 'worker',
    version: ZINE_VERSION,
    environment: c.env.ENVIRONMENT || 'development',
    timestamp: new Date().toISOString(),
    requestId: c.get('requestId'),
    traceId: c.get('traceId'),
    release: getWorkerRelease(c.env),
  });
});

app.get('/health/deps', async (c) => {
  const health = await getDependencyHealth(c.env);

  return c.json({
    ...health,
    service: 'worker',
    version: ZINE_VERSION,
    environment: c.env.ENVIRONMENT || 'development',
    timestamp: new Date().toISOString(),
    requestId: c.get('requestId'),
    traceId: c.get('traceId'),
    release: getWorkerRelease(c.env),
  });
});

app.get('/health/queues', async (c) => {
  const health = await getQueueHealth(c.env);

  return c.json({
    ...health,
    service: 'worker',
    version: ZINE_VERSION,
    environment: c.env.ENVIRONMENT || 'development',
    timestamp: new Date().toISOString(),
    requestId: c.get('requestId'),
    traceId: c.get('traceId'),
    release: getWorkerRelease(c.env),
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
      traceId: c.get('traceId'),
    },
    404
  );
});

// ---------------------------------------------------------------------------
// Error Handler
// ---------------------------------------------------------------------------

app.onError((err, c) => {
  logger.error('Unhandled error', {
    error: err,
    service: 'worker',
    env: c.env.ENVIRONMENT || 'development',
    operation: 'http.request',
    event: 'http.request.failed',
    status: 'error',
    path: c.req.path,
    requestId: c.get('requestId'),
    traceId: c.get('traceId'),
    clientRequestId: c.get('clientRequestId'),
    release: getWorkerRelease(c.env),
  });

  return c.json(
    {
      error: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
      message: c.env.ENVIRONMENT === 'development' ? err.message : undefined,
      requestId: c.get('requestId'),
      traceId: c.get('traceId'),
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
   * Three cron jobs run independently:
   * - "0 * * * *"  → YouTube polling at top of hour
   * - "15 * * * *" → Gmail newsletter polling at quarter past
   * - "30 * * * *" → Spotify polling at 30 minutes past
   * - "45 * * * *" → RSS feed polling at 45 minutes past
   *
   * Each provider has its own distributed lock for failure isolation.
   *
   * @see /features/subscriptions/backend-spec.md - Section 3: Polling Architecture
   */
  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext): Promise<void> {
    if (event.cron === '0 * * * *') {
      ctx.waitUntil(pollProviderSubscriptions('YOUTUBE', env, ctx));
      return;
    }

    if (event.cron === '30 * * * *') {
      ctx.waitUntil(pollProviderSubscriptions('SPOTIFY', env, ctx));
      return;
    }

    if (event.cron === '15 * * * *') {
      ctx.waitUntil(pollGmailNewsletters(env, ctx));
      return;
    }

    if (event.cron === '45 * * * *') {
      ctx.waitUntil(pollRssFeeds(env, ctx));
      return;
    }

    logger.warn('Received scheduled event with unknown cron expression', { cron: event.cron });
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

export { app };
