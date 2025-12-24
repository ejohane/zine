/**
 * OAuth State Management for CSRF Protection
 *
 * The OAuth 'state' parameter prevents CSRF attacks by ensuring that the
 * authorization callback originated from our application.
 *
 * Flow:
 * 1. Client generates a cryptographically random state
 * 2. Client calls registerState to store state → userId mapping in KV
 * 3. Client includes state in OAuth redirect URL
 * 4. Provider callback includes the same state
 * 5. Server validates state matches the expected userId before exchanging tokens
 * 6. State is deleted after successful validation (one-time use)
 */

import { TRPCError } from '@trpc/server';

/** KV key prefix for OAuth state storage */
const OAUTH_STATE_PREFIX = 'oauth:state:';

/** TTL for OAuth state entries (30 minutes) */
export const OAUTH_STATE_TTL_SECONDS = 1800;

/**
 * Store OAuth state → userId mapping in KV
 *
 * @param state - Client-generated cryptographically random state
 * @param userId - The authenticated user's ID
 * @param kv - Cloudflare KV namespace
 * @throws TRPCError if state is already registered (replay attack prevention)
 */
export async function registerOAuthState(
  state: string,
  userId: string,
  kv: KVNamespace
): Promise<void> {
  const key = `${OAUTH_STATE_PREFIX}${state}`;

  // Check for replay attacks - state should never be reused
  const existing = await kv.get(key);
  if (existing) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'State already registered',
    });
  }

  // Store with 30 minute expiry
  await kv.put(key, userId, { expirationTtl: OAUTH_STATE_TTL_SECONDS });
}

/**
 * Validate OAuth state and retrieve the associated userId
 *
 * This function:
 * 1. Checks if the state exists in KV
 * 2. Verifies the stored userId matches the expected userId
 * 3. Deletes the state after validation (one-time use)
 *
 * @param state - The state parameter from the OAuth callback
 * @param expectedUserId - The currently authenticated user's ID
 * @param kv - Cloudflare KV namespace
 * @throws TRPCError if state is invalid, expired, or doesn't match userId
 */
export async function validateOAuthState(
  state: string,
  expectedUserId: string,
  kv: KVNamespace
): Promise<void> {
  const key = `${OAUTH_STATE_PREFIX}${state}`;

  // Retrieve the stored userId for this state
  const storedUserId = await kv.get(key);

  if (!storedUserId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'State expired or invalid',
    });
  }

  if (storedUserId !== expectedUserId) {
    // Don't delete the state here - could be a legitimate user's state
    // that an attacker is trying to use
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'State mismatch',
    });
  }

  // Delete after successful validation (one-time use)
  await kv.delete(key);
}

/**
 * Clean up an OAuth state (e.g., if the OAuth flow is cancelled)
 *
 * @param state - The state to remove
 * @param userId - The user's ID (must match stored value for deletion)
 * @param kv - Cloudflare KV namespace
 * @returns true if state was deleted, false if not found or didn't match
 */
export async function cleanupOAuthState(
  state: string,
  userId: string,
  kv: KVNamespace
): Promise<boolean> {
  const key = `${OAUTH_STATE_PREFIX}${state}`;

  const storedUserId = await kv.get(key);

  // Only delete if the state exists and belongs to this user
  if (storedUserId === userId) {
    await kv.delete(key);
    return true;
  }

  return false;
}
