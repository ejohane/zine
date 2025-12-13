/**
 * Authentication routes
 *
 * Handles Clerk webhooks and auth-related endpoints.
 * Implements Svix signature verification for webhook security.
 *
 * @see https://clerk.com/docs/webhooks/overview
 */

import { Hono } from 'hono';
import { Webhook } from 'svix';
import type { Env, Bindings } from '../types';

const auth = new Hono<Env>();

// ============================================================================
// Types
// ============================================================================

/**
 * Clerk user data from webhook events
 */
interface ClerkUserData {
  id: string;
  email_addresses: Array<{
    id: string;
    email_address: string;
  }>;
  first_name: string | null;
  last_name: string | null;
  image_url: string | null;
  created_at: number;
  updated_at: number;
}

/**
 * Clerk webhook event structure
 */
interface ClerkWebhookEvent {
  type: string;
  data: ClerkUserData;
  object: 'event';
}

/**
 * Webhook idempotency TTL (7 days in seconds)
 * Clerk recommends storing svix-id for at least 5 days
 */
const IDEMPOTENCY_TTL_SECONDS = 7 * 24 * 60 * 60;

// ============================================================================
// Webhook Route (unauthenticated - uses Svix verification)
// ============================================================================

/**
 * POST /api/auth/webhook
 *
 * Handles Clerk webhook events (user.created, user.deleted).
 * Uses Svix signature verification for security.
 *
 * Required headers:
 * - svix-id: Unique message identifier
 * - svix-timestamp: Message timestamp
 * - svix-signature: HMAC signature
 *
 * @see https://clerk.com/docs/webhooks/sync-data
 */
auth.post('/webhook', async (c) => {
  const requestId = c.get('requestId');
  const webhookSecret = c.env.CLERK_WEBHOOK_SECRET;

  // Validate webhook secret is configured
  if (!webhookSecret) {
    console.error('[webhook] CLERK_WEBHOOK_SECRET not configured');
    return c.json(
      {
        error: 'Webhook not configured',
        code: 'WEBHOOK_NOT_CONFIGURED',
        requestId,
      },
      500
    );
  }

  // Extract Svix headers
  const svixId = c.req.header('svix-id');
  const svixTimestamp = c.req.header('svix-timestamp');
  const svixSignature = c.req.header('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return c.json(
      {
        error: 'Missing Svix headers',
        code: 'MISSING_SVIX_HEADERS',
        requestId,
      },
      400
    );
  }

  // Check idempotency - prevent double processing
  const idempotencyKey = `svix:${svixId}`;
  const existingEvent = await c.env.WEBHOOK_IDEMPOTENCY.get(idempotencyKey);

  if (existingEvent) {
    console.log(`[webhook] Duplicate event detected: ${svixId}`);
    return c.json({
      message: 'Event already processed',
      svixId,
      requestId,
    });
  }

  // Get raw body for signature verification
  const body = await c.req.text();

  // Verify Svix signature
  const wh = new Webhook(webhookSecret);
  let event: ClerkWebhookEvent;

  try {
    event = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ClerkWebhookEvent;
  } catch (err) {
    console.error('[webhook] Signature verification failed:', err);
    return c.json(
      {
        error: 'Invalid signature',
        code: 'INVALID_SIGNATURE',
        requestId,
      },
      401
    );
  }

  // Store svix-id for idempotency before processing
  // This prevents race conditions with concurrent webhook deliveries
  await c.env.WEBHOOK_IDEMPOTENCY.put(
    idempotencyKey,
    JSON.stringify({
      eventType: event.type,
      processedAt: new Date().toISOString(),
    }),
    {
      expirationTtl: IDEMPOTENCY_TTL_SECONDS,
    }
  );

  // Handle event types
  try {
    switch (event.type) {
      case 'user.created':
        await handleUserCreated(c.env, event.data, requestId);
        break;

      case 'user.deleted':
        await handleUserDeleted(c.env, event.data, requestId);
        break;

      case 'user.updated':
        // Log but don't process - we sync on-demand
        console.log(`[webhook] user.updated for ${event.data.id} - no action needed`);
        break;

      default:
        console.log(`[webhook] Unhandled event type: ${event.type}`);
    }

    return c.json({
      message: 'Webhook processed successfully',
      eventType: event.type,
      userId: event.data.id,
      requestId,
    });
  } catch (err) {
    // If processing fails, remove idempotency key to allow retry
    await c.env.WEBHOOK_IDEMPOTENCY.delete(idempotencyKey);

    console.error(`[webhook] Error processing ${event.type}:`, err);
    return c.json(
      {
        error: 'Webhook processing failed',
        code: 'PROCESSING_ERROR',
        requestId,
      },
      500
    );
  }
});

// ============================================================================
// Event Handlers
// ============================================================================

/**
 * Handle user.created event
 *
 * Initializes the user's Durable Object when they sign up.
 */
async function handleUserCreated(
  env: Bindings,
  user: ClerkUserData,
  requestId: string
): Promise<void> {
  console.log(`[webhook] user.created: ${user.id}`);

  // Get or create user's Durable Object
  const doId = env.USER_DO.idFromName(user.id);
  const stub = env.USER_DO.get(doId);

  // Initialize the DO with user data
  const response = await stub.fetch(
    new Request('http://do/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.id,
        email: user.email_addresses[0]?.email_address,
        firstName: user.first_name,
        lastName: user.last_name,
        imageUrl: user.image_url,
        createdAt: new Date(user.created_at).toISOString(),
      }),
    })
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`DO init failed: ${error}`);
  }

  console.log(`[webhook] User DO initialized for ${user.id} [${requestId}]`);
}

/**
 * Handle user.deleted event
 *
 * Cleans up user data when they delete their account.
 * Note: Durable Objects can't be deleted, but we can clear their data.
 */
async function handleUserDeleted(
  env: Bindings,
  user: ClerkUserData,
  requestId: string
): Promise<void> {
  console.log(`[webhook] user.deleted: ${user.id}`);

  // Get user's Durable Object
  const doId = env.USER_DO.idFromName(user.id);
  const stub = env.USER_DO.get(doId);

  // Request the DO to clear all user data
  const response = await stub.fetch(
    new Request('http://do/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id }),
    })
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`DO delete failed: ${error}`);
  }

  console.log(`[webhook] User data cleared for ${user.id} [${requestId}]`);
}

// ============================================================================
// Authenticated Routes
// ============================================================================

/**
 * GET /api/auth/me
 *
 * Returns the current user's profile information.
 * Requires authentication.
 */
auth.get('/me', async (c) => {
  const userId = c.get('userId');
  const requestId = c.get('requestId');

  if (!userId) {
    return c.json({ error: 'Authentication required', code: 'UNAUTHORIZED', requestId }, 401);
  }

  // Get user's Durable Object
  const doId = c.env.USER_DO.idFromName(userId);
  const stub = c.env.USER_DO.get(doId);

  // Fetch user profile from DO
  const response = await stub.fetch(
    new Request('http://do/profile', {
      method: 'GET',
    })
  );

  if (!response.ok) {
    return c.json(
      { error: 'Failed to fetch profile', code: 'PROFILE_FETCH_ERROR', requestId },
      500
    );
  }

  const profile = (await response.json()) as Record<string, unknown>;

  return c.json({
    ...profile,
    userId,
    requestId,
  });
});

/**
 * DELETE /api/auth/account
 *
 * Deletes the user's account and all associated data.
 * Requires authentication.
 *
 * Note: This endpoint clears data in our system. The user should also
 * delete their account in Clerk, which will trigger the user.deleted webhook.
 */
auth.delete('/account', async (c) => {
  const userId = c.get('userId');
  const requestId = c.get('requestId');

  if (!userId) {
    return c.json({ error: 'Authentication required', code: 'UNAUTHORIZED', requestId }, 401);
  }

  // Get user's Durable Object
  const doId = c.env.USER_DO.idFromName(userId);
  const stub = c.env.USER_DO.get(doId);

  // Request the DO to clear all user data
  const response = await stub.fetch(
    new Request('http://do/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
  );

  if (!response.ok) {
    return c.json({ error: 'Failed to delete account', code: 'DELETE_ERROR', requestId }, 500);
  }

  return c.json({
    message: 'Account data deleted successfully',
    userId,
    requestId,
  });
});

export default auth;
