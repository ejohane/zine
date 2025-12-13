/**
 * User Durable Object
 *
 * Per-user state management with SQLite storage.
 * Each user gets their own DO instance keyed by their Clerk user ID.
 *
 * Routes:
 * - POST /init     - Run migrations and initialize user profile
 * - POST /push     - Replicache push handler
 * - POST /pull     - Replicache pull handler
 * - POST /ingest   - Provider content ingestion
 * - POST /cleanup  - User data deletion (GDPR compliance)
 * - POST /delete   - Alias for cleanup
 * - GET  /profile  - Get user profile
 */

import { DurableObject } from 'cloudflare:workers';
import type { Bindings } from '../types';
import { PushRequestSchema, PullRequestSchema } from '@zine/shared';
import { handleInit, type InitRequest } from './handlers/init';
import { handlePush } from './handlers/push';
import { handlePull } from './handlers/pull';
import { handleIngest, handleCleanup, type IngestRequest } from './handlers/ingest';

// ============================================================================
// Types
// ============================================================================

interface RouteContext {
  sql: SqlStorage;
  request: Request;
}

type RouteHandler = (ctx: RouteContext) => Promise<Response>;

// ============================================================================
// User Durable Object
// ============================================================================

export class UserDO extends DurableObject<Bindings> {
  private initialized = false;
  private routes: Map<string, RouteHandler>;

  constructor(ctx: DurableObjectState, env: Bindings) {
    super(ctx, env);
    this.routes = this.setupRoutes();
  }

  /**
   * Setup route handlers
   */
  private setupRoutes(): Map<string, RouteHandler> {
    const routes = new Map<string, RouteHandler>();

    routes.set('/init', this.handleInitRoute.bind(this));
    routes.set('/push', this.handlePushRoute.bind(this));
    routes.set('/pull', this.handlePullRoute.bind(this));
    routes.set('/ingest', this.handleIngestRoute.bind(this));
    routes.set('/cleanup', this.handleCleanupRoute.bind(this));
    routes.set('/delete', this.handleCleanupRoute.bind(this)); // Alias
    routes.set('/profile', this.handleProfileRoute.bind(this));

    return routes;
  }

  /**
   * Ensure the DO is initialized before handling requests
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    handleInit(this.ctx.storage.sql);
    this.initialized = true;
  }

  /**
   * Handle incoming requests to the Durable Object
   */
  async fetch(request: Request): Promise<Response> {
    try {
      await this.ensureInitialized();

      const url = new URL(request.url);
      const handler = this.routes.get(url.pathname);

      if (!handler) {
        return this.jsonResponse({ error: 'Not Found', path: url.pathname }, 404);
      }

      // Profile endpoint accepts GET, all others require POST
      if (url.pathname === '/profile') {
        if (request.method !== 'GET') {
          return this.jsonResponse({ error: 'Method Not Allowed', method: request.method }, 405);
        }
      } else if (request.method !== 'POST') {
        return this.jsonResponse({ error: 'Method Not Allowed', method: request.method }, 405);
      }

      const ctx: RouteContext = {
        sql: this.ctx.storage.sql,
        request,
      };

      return handler(ctx);
    } catch (error) {
      console.error('UserDO error:', error);
      return this.jsonResponse(
        {
          error: 'Internal Error',
          message: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  }

  // ==========================================================================
  // Route Handlers
  // ==========================================================================

  /**
   * POST /init - Run migrations and initialize
   */
  private async handleInitRoute(ctx: RouteContext): Promise<Response> {
    // Parse optional user profile data from request body
    let initRequest: Parameters<typeof handleInit>[1] | undefined;
    try {
      const body = await ctx.request.json();
      if (body && typeof body === 'object') {
        initRequest = body as Parameters<typeof handleInit>[1];
      }
    } catch {
      // No body or invalid JSON - that's okay, just run migrations
    }

    const result = handleInit(ctx.sql, initRequest);
    return this.jsonResponse(result);
  }

  /**
   * POST /push - Replicache push handler
   */
  private async handlePushRoute(ctx: RouteContext): Promise<Response> {
    const body = await ctx.request.json();
    const parseResult = PushRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return this.jsonResponse(
        { error: 'Invalid request', details: parseResult.error.issues },
        400
      );
    }

    const result = handlePush(ctx.sql, parseResult.data);
    return this.jsonResponse(result);
  }

  /**
   * POST /pull - Replicache pull handler
   */
  private async handlePullRoute(ctx: RouteContext): Promise<Response> {
    const body = await ctx.request.json();
    const parseResult = PullRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return this.jsonResponse(
        { error: 'Invalid request', details: parseResult.error.issues },
        400
      );
    }

    const result = handlePull(ctx.sql, parseResult.data);
    return this.jsonResponse(result);
  }

  /**
   * POST /ingest - Provider content ingestion
   */
  private async handleIngestRoute(ctx: RouteContext): Promise<Response> {
    const body = (await ctx.request.json()) as IngestRequest;

    // Basic validation
    if (!body.sourceId || !Array.isArray(body.items)) {
      return this.jsonResponse({ error: 'Invalid request: sourceId and items required' }, 400);
    }

    const result = handleIngest(ctx.sql, body);
    return this.jsonResponse(result);
  }

  /**
   * POST /cleanup - User data deletion
   */
  private async handleCleanupRoute(ctx: RouteContext): Promise<Response> {
    const result = handleCleanup(ctx.sql);
    return this.jsonResponse(result);
  }

  /**
   * GET /profile - Get user profile
   */
  private async handleProfileRoute(ctx: RouteContext): Promise<Response> {
    const result = ctx.sql.exec('SELECT * FROM user_profile LIMIT 1').toArray();

    if (result.length === 0) {
      return this.jsonResponse({ profile: null });
    }

    const row = result[0];
    return this.jsonResponse({
      profile: {
        id: row.id,
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
        imageUrl: row.image_url,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  }

  // ==========================================================================
  // Alarm Support
  // ==========================================================================

  /**
   * Handle scheduled alarms
   *
   * Alarms can be used for:
   * - Periodic cleanup of old archived items
   * - Scheduled ingestion triggers
   * - Data integrity checks
   */
  async alarm(): Promise<void> {
    await this.ensureInitialized();

    // TODO: Implement alarm-based tasks
    // Example: Clean up items archived > 30 days ago
    // const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    // this.ctx.storage.sql.exec(
    //   "DELETE FROM user_items WHERE state = 'ARCHIVED' AND archived_at < ?",
    //   thirtyDaysAgo
    // );

    console.log('UserDO alarm triggered');
  }

  /**
   * Schedule an alarm for a future time
   *
   * @param scheduledTime - When the alarm should trigger (Date or milliseconds)
   */
  async scheduleAlarm(scheduledTime: Date | number): Promise<void> {
    await this.ctx.storage.setAlarm(scheduledTime);
  }

  /**
   * Get the currently scheduled alarm time
   *
   * @returns The scheduled alarm time, or null if no alarm is set
   */
  async getAlarm(): Promise<number | null> {
    return this.ctx.storage.getAlarm();
  }

  /**
   * Cancel any scheduled alarm
   */
  async cancelAlarm(): Promise<void> {
    await this.ctx.storage.deleteAlarm();
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Create a JSON response
   */
  private jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}
