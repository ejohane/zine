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
import { handleEnrichmentDLQ, handleEnrichmentQueue } from './enrichment/consumer';
import type { EnrichmentQueueMessage } from './enrichment/types';
import { handleSyncQueue } from './sync/consumer';
import { handleSyncDLQ } from './sync/dlq-consumer';
import type { SyncQueueMessage } from './sync/types';
import { logger } from './lib/logger';
import { resolveCorsOrigin } from './lib/cors';
import { createWorkerRequestTelemetry, getWorkerRelease } from './lib/telemetry';
import { authMiddleware } from './middleware/auth';
import authRoutes from './routes/auth';
import { appRouter } from './trpc/router';
import { createContext } from './trpc/context';
import { getDependencyHealth, getQueueHealth } from './diagnostics/health';
import { backfillBookmarkEnrichment } from './admin/enrichment-backfill';

// Create Hono app with typed environment
const app = new Hono<Env>();

// Middleware

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
    origin: (origin, c) => resolveCorsOrigin(origin, c.env.ENVIRONMENT),
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

// Health Check (unauthenticated)

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

// API Routes

// Mount auth routes first (webhook endpoint handles its own auth via Svix)
app.route('/api/auth', authRoutes);

app.post('/admin/enrichment/backfill', async (c) => {
  const configuredSecret = c.env.ENRICHMENT_BACKFILL_SECRET;
  if (!configuredSecret) {
    return c.json(
      {
        error: 'Enrichment backfill is not configured',
        code: 'BACKFILL_NOT_CONFIGURED',
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      503
    );
  }

  const authHeader = c.req.header('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token || token !== configuredSecret) {
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

  const body = await c.req.json().catch(() => ({}));
  const result = await backfillBookmarkEnrichment(c.env, {
    dryRun: typeof body.dryRun === 'boolean' ? body.dryRun : true,
    limit: typeof body.limit === 'number' ? body.limit : undefined,
    cursor: typeof body.cursor === 'string' && body.cursor.length > 0 ? body.cursor : null,
  });

  return c.json({
    ...result,
    requestId: c.get('requestId'),
    traceId: c.get('traceId'),
  });
});

// tRPC Routes

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

// 404 Handler

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

// Error Handler

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

// Export

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
   * Queue handler for async jobs and DLQ monitoring.
   *
   * Handles four queues:
   * 1. SYNC_QUEUE: Primary sync queue for processing subscriptions
   *    - Non-blocking pull-to-refresh (< 500ms response time)
   *    - Error isolation (one subscription failing doesn't affect others)
   *    - Automatic retries (3 attempts before DLQ)
   *
   * 2. SYNC_DLQ: Dead Letter Queue for failed sync messages
   * 3. ENRICHMENT_QUEUE: Bookmark enrichment and embedding generation
   * 4. ENRICHMENT_DLQ: Dead Letter Queue for failed enrichment messages
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
    batch: MessageBatch<SyncQueueMessage | EnrichmentQueueMessage>,
    env: Bindings,
    _ctx: ExecutionContext
  ): Promise<void> {
    if (batch.queue.includes('enrichment-dlq')) {
      await handleEnrichmentDLQ(batch as MessageBatch<EnrichmentQueueMessage>, env);
      return;
    }

    if (batch.queue.includes('enrichment')) {
      await handleEnrichmentQueue(batch as MessageBatch<EnrichmentQueueMessage>, env);
      return;
    }

    if (batch.queue.includes('-dlq-')) {
      await handleSyncDLQ(batch as MessageBatch<SyncQueueMessage>, env);
    } else {
      await handleSyncQueue(batch as MessageBatch<SyncQueueMessage>, env);
    }
  },
};

export { app };
