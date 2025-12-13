/**
 * Authentication routes
 *
 * Handles Clerk webhooks and auth-related endpoints.
 * TODO: Implement in zine-phq epic
 */

import { Hono } from 'hono';
import type { Env } from '../types';

const auth = new Hono<Env>();

/**
 * POST /api/auth/webhook
 *
 * Handles Clerk webhook events (user.created, user.updated, user.deleted).
 * Used to sync user data to the backend.
 *
 * @see https://clerk.com/docs/webhooks/overview
 */
auth.post('/webhook', async (c) => {
  const requestId = c.get('requestId');

  // TODO: Implement webhook handler in zine-phq
  // 1. Verify Svix signature
  // 2. Parse webhook event type
  // 3. Handle user.created - initialize Durable Object
  // 4. Handle user.updated - sync profile data
  // 5. Handle user.deleted - clean up user data

  return c.json({
    message: 'Webhook endpoint stub - implement in zine-phq',
    requestId,
  });
});

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
    return c.json(
      { error: 'Authentication required', code: 'UNAUTHORIZED', requestId },
      401
    );
  }

  // TODO: Implement in zine-phq
  // 1. Get user's Durable Object
  // 2. Return user profile data

  return c.json({
    message: 'Me endpoint stub - implement in zine-phq',
    userId,
    requestId,
  });
});

/**
 * DELETE /api/auth/account
 *
 * Deletes the user's account and all associated data.
 * Requires authentication.
 */
auth.delete('/account', async (c) => {
  const userId = c.get('userId');
  const requestId = c.get('requestId');

  if (!userId) {
    return c.json(
      { error: 'Authentication required', code: 'UNAUTHORIZED', requestId },
      401
    );
  }

  // TODO: Implement in zine-phq
  // 1. Delete user's Durable Object data
  // 2. Notify Clerk to delete user (or verify Clerk initiated this)
  // 3. Return success

  return c.json({
    message: 'Delete account endpoint stub - implement in zine-phq',
    requestId,
  });
});

export default auth;
