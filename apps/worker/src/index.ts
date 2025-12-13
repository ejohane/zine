/**
 * @zine/worker - Cloudflare Workers backend
 *
 * Hono application entry point with middleware and route configuration.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { DurableObject } from 'cloudflare:workers';
import { ZINE_VERSION } from '@zine/shared';
import type { Env, Bindings } from './types';
import { authMiddleware } from './middleware/auth';
import syncRoutes from './routes/sync';
import authRoutes from './routes/auth';
import sourcesRoutes from './routes/sources';
import { runMigrations } from './lib/db';

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
 */
app.use(
  '*',
  cors({
    origin: ['http://localhost:8081', 'http://localhost:19006'], // Expo dev ports
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
// API Routes (authenticated)
// ---------------------------------------------------------------------------

// Apply auth middleware to all /api/* routes
app.use('/api/*', authMiddleware());

// Mount route groups
app.route('/api/replicache', syncRoutes);
app.route('/api/auth', authRoutes);
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
// User Durable Object
// ---------------------------------------------------------------------------

/**
 * UserDO - Per-user Durable Object with SQLite storage
 *
 * Each user gets their own DO instance keyed by their Clerk user ID.
 * The DO handles:
 * - Replicache push/pull operations
 * - User-specific data storage
 * - Ingestion state management
 *
 * TODO: Full implementation in zine-hcb epic
 */
export class UserDO extends DurableObject<Bindings> {
  private initialized = false;

  /**
   * Initialize the Durable Object
   * Runs migrations on first access
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    await runMigrations(this.ctx.storage.sql);
    this.initialized = true;
  }

  /**
   * Handle incoming requests to the Durable Object
   *
   * @param request - The incoming request
   * @returns Response from the DO
   */
  async fetch(request: Request): Promise<Response> {
    await this.initialize();

    const url = new URL(request.url);

    // TODO: Implement push/pull handlers in zine-hcb
    // Route requests to appropriate handlers based on path

    return new Response(
      JSON.stringify({
        message: 'UserDO stub - implement in zine-hcb',
        path: url.pathname,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export default {
  fetch: app.fetch,
};
