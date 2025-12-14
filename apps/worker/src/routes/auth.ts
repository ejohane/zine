/**
 * Authentication routes
 *
 * Handles Clerk webhooks and auth-related endpoints.
 * Implements Svix signature verification for webhook security.
 *
 * Uses D1 (Drizzle ORM) for user data persistence.
 *
 * @see https://clerk.com/docs/webhooks/overview
 */

import { Hono } from 'hono';
import { Webhook } from 'svix';
import { eq } from 'drizzle-orm';
import type { Env, Bindings } from '../types';
import { createDb } from '../db';
import { users, userItems, sources, providerItemsSeen } from '../db/schema';

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
 * Creates the user record in D1 when they sign up.
 */
async function handleUserCreated(
  env: Bindings,
  user: ClerkUserData,
  requestId: string
): Promise<void> {
  console.log(`[webhook] user.created: ${user.id}`);

  const db = createDb(env.DB);
  const now = new Date().toISOString();

  // Insert user into D1 database
  await db
    .insert(users)
    .values({
      id: user.id,
      email: user.email_addresses[0]?.email_address ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

  console.log(`[webhook] User created in D1 for ${user.id} [${requestId}]`);
}

/**
 * Handle user.deleted event
 *
 * Cleans up user data when they delete their account (GDPR compliance).
 * Deletes all user-related data from D1 in the correct order to respect foreign keys.
 */
async function handleUserDeleted(
  env: Bindings,
  user: ClerkUserData,
  requestId: string
): Promise<void> {
  console.log(`[webhook] user.deleted: ${user.id}`);

  const db = createDb(env.DB);

  // Delete user data in order respecting foreign key constraints:
  // 1. Delete provider items seen (references user)
  // 2. Delete user items (references user)
  // 3. Delete sources (references user)
  // 4. Delete user record

  await db.delete(providerItemsSeen).where(eq(providerItemsSeen.userId, user.id));
  await db.delete(userItems).where(eq(userItems.userId, user.id));
  await db.delete(sources).where(eq(sources.userId, user.id));
  await db.delete(users).where(eq(users.id, user.id));

  console.log(`[webhook] User data deleted from D1 for ${user.id} [${requestId}]`);
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

  const db = createDb(c.env.DB);

  // Fetch user profile from D1
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    return c.json({ error: 'User not found', code: 'USER_NOT_FOUND', requestId }, 404);
  }

  return c.json({
    id: user.id,
    email: user.email,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    requestId,
  });
});

/**
 * DELETE /api/auth/account
 *
 * Deletes the user's account and all associated data (GDPR compliance).
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

  const db = createDb(c.env.DB);

  // Delete user data in order respecting foreign key constraints:
  // 1. Delete provider items seen (references user)
  // 2. Delete user items (references user)
  // 3. Delete sources (references user)
  // 4. Delete user record

  await db.delete(providerItemsSeen).where(eq(providerItemsSeen.userId, userId));
  await db.delete(userItems).where(eq(userItems.userId, userId));
  await db.delete(sources).where(eq(sources.userId, userId));
  await db.delete(users).where(eq(users.id, userId));

  return c.json({
    message: 'Account data deleted successfully',
    userId,
    requestId,
  });
});

export default auth;
