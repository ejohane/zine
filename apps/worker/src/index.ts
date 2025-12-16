/**
 * @zine/worker - Cloudflare Workers backend
 *
 * Hono application entry point with middleware and route configuration.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { trpcServer } from '@hono/trpc-server';
import { ZINE_VERSION } from '@zine/shared';
import type { Bindings, Env } from './types';
import { runIngestionBatch } from './ingestion';
import { authMiddleware } from './middleware/auth';
import authRoutes from './routes/auth';
import sourcesRoutes from './routes/sources';
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
app.use('*', logger());

/**
 * CORS middleware - allow cross-origin requests
 *
 * Note: React Native/Expo mobile apps don't require CORS since requests
 * come from native HTTP clients. These origins are primarily for:
 * - Local development (Expo dev server)
 * - Web builds (Expo web output)
 */
app.use(
  '*',
  cors({
    origin: [
      // Local development
      'http://localhost:8081',
      'http://localhost:19006',
      'http://localhost:3000',
      // Production web (if you add web support later)
      'https://myzine.app',
      'https://www.myzine.app',
    ],
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
// Legacy REST Routes (sources)
// ---------------------------------------------------------------------------

// Apply auth middleware to protected routes
app.use('/api/sources/*', authMiddleware());

// Mount protected route groups
app.route('/api/sources', sourcesRoutes);

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
  console.error('Unhandled error:', err);

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
   * Scheduled handler for cron-triggered content ingestion.
   *
   * Configured in wrangler.toml with `[triggers]` section.
   * Runs hourly to fetch new content from all active user sources.
   *
   * @see /features/rearch/analysis.md - Gap: Ingestion Pipeline
   */
  async scheduled(_event: ScheduledEvent, env: Bindings, ctx: ExecutionContext): Promise<void> {
    // Use waitUntil to ensure the ingestion batch completes even if the
    // scheduled handler returns early
    ctx.waitUntil(runIngestionBatch(env));
  },
};
