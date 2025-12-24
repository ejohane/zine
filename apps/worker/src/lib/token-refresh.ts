/**
 * OAuth Token Refresh with Distributed Locking
 *
 * Provides proactive token refresh for YouTube and Spotify OAuth connections.
 * Tokens are refreshed 5 minutes before expiry to prevent mid-operation failures.
 *
 * Key features:
 * - Proactive refresh (5 min buffer before expiry)
 * - Distributed locking to prevent concurrent refresh attempts
 * - Support for rotated refresh tokens (Spotify may rotate)
 * - Custom error types for proper error handling
 *
 * See: features/subscriptions/backend-spec.md Section 3.4
 */

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { decrypt, encrypt } from './crypto';
import { tryAcquireLock, releaseLock } from './locks';
import { providerConnections } from '../db/schema';

// ============================================================================
// Constants
// ============================================================================

/** Buffer time before expiry to trigger refresh (5 minutes in ms) */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

/** TTL for the distributed refresh lock (60 seconds - KV minimum) */
const REFRESH_LOCK_TTL = 60;

/** Time to wait before checking for updated token when lock is held by another worker */
const LOCK_WAIT_MS = 2000;

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error codes for token refresh operations
 */
export type TokenRefreshErrorCode =
  | 'REFRESH_IN_PROGRESS' // Another worker is refreshing
  | 'REFRESH_FAILED' // Provider rejected refresh request
  | 'CONNECTION_NOT_FOUND' // Connection doesn't exist
  | 'INVALID_PROVIDER' // Unknown provider
  | 'DECRYPTION_FAILED'; // Failed to decrypt refresh token

/**
 * Custom error class for token refresh operations
 */
export class TokenRefreshError extends Error {
  readonly code: TokenRefreshErrorCode;
  readonly details?: string;

  constructor(code: TokenRefreshErrorCode, message: string, details?: string) {
    super(message);
    this.name = 'TokenRefreshError';
    this.code = code;
    this.details = details;
  }
}

// ============================================================================
// Types
// ============================================================================

/**
 * Provider connection data from database
 */
export interface ProviderConnection {
  id: string;
  userId: string;
  provider: string;
  providerUserId: string | null;
  accessToken: string; // Encrypted
  refreshToken: string; // Encrypted
  tokenExpiresAt: number; // Unix ms
  scopes: string | null;
  connectedAt: number;
  lastRefreshedAt: number | null;
  status: string;
}

/**
 * Environment bindings required for token refresh
 */
export interface TokenRefreshEnv {
  DB: D1Database;
  OAUTH_STATE_KV: KVNamespace;
  ENCRYPTION_KEY: string;
  /** Google OAuth client ID (for YouTube) */
  GOOGLE_CLIENT_ID: string;
  /** Google OAuth client secret (for YouTube) - optional for PKCE flows */
  GOOGLE_CLIENT_SECRET?: string;
  SPOTIFY_CLIENT_ID: string;
  SPOTIFY_CLIENT_SECRET: string;
}

/**
 * Result from provider token refresh
 */
interface RefreshedTokens {
  accessToken: string;
  expiresIn: number; // seconds
  refreshToken?: string; // May be rotated by provider
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Get a valid access token for a provider connection
 *
 * Returns the cached token if still valid (with 5 min buffer).
 * Otherwise, refreshes the token using distributed locking to prevent races.
 *
 * @param connection - The provider connection from database
 * @param env - Environment bindings with required secrets and KV
 * @returns Decrypted access token
 * @throws TokenRefreshError on refresh failure
 *
 * @example
 * ```typescript
 * const connection = await db.query.providerConnections.findFirst({
 *   where: and(eq(providerConnections.userId, userId), eq(providerConnections.provider, 'YOUTUBE'))
 * });
 *
 * const accessToken = await getValidAccessToken(connection, env);
 * // Use accessToken for API calls
 * ```
 */
export async function getValidAccessToken(
  connection: ProviderConnection,
  env: TokenRefreshEnv
): Promise<string> {
  const now = Date.now();

  // Check if token is still valid (with buffer)
  if (connection.tokenExpiresAt - REFRESH_BUFFER_MS > now) {
    // Token is still valid, return decrypted token
    return decrypt(connection.accessToken, env.ENCRYPTION_KEY);
  }

  // Need to refresh - acquire distributed lock
  return refreshWithLock(connection, env);
}

// ============================================================================
// Internal Functions
// ============================================================================

/**
 * Refresh token with distributed locking to prevent concurrent refreshes
 */
async function refreshWithLock(
  connection: ProviderConnection,
  env: TokenRefreshEnv
): Promise<string> {
  const lockKey = `token:refresh:${connection.id}`;

  // Try to acquire lock
  const lockAcquired = await tryAcquireLock(env.OAUTH_STATE_KV, lockKey, REFRESH_LOCK_TTL);

  if (!lockAcquired) {
    // Another worker is refreshing - wait and read updated token
    await sleep(LOCK_WAIT_MS);

    const updated = await getConnectionById(connection.id, env);
    if (updated && updated.tokenExpiresAt > Date.now()) {
      // Token was refreshed by other worker
      return decrypt(updated.accessToken, env.ENCRYPTION_KEY);
    }

    throw new TokenRefreshError(
      'REFRESH_IN_PROGRESS',
      'Token refresh in progress by another worker'
    );
  }

  try {
    // Perform the actual refresh
    const refreshed = await refreshProviderToken(connection, env);

    // Persist the new tokens
    await persistRefreshedTokens(connection.id, refreshed, env);

    return refreshed.accessToken;
  } finally {
    // Always release the lock
    await releaseLock(env.OAUTH_STATE_KV, lockKey);
  }
}

/**
 * Refresh token with the OAuth provider
 */
async function refreshProviderToken(
  connection: ProviderConnection,
  env: TokenRefreshEnv
): Promise<RefreshedTokens> {
  // Get provider-specific configuration
  const { tokenUrl, clientId, clientSecret } = getProviderConfig(connection.provider, env);

  // Decrypt the refresh token
  let refreshToken: string;
  try {
    refreshToken = await decrypt(connection.refreshToken, env.ENCRYPTION_KEY);
  } catch (error) {
    throw new TokenRefreshError(
      'DECRYPTION_FAILED',
      'Failed to decrypt refresh token',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }

  // Build the token refresh request body
  // For Google OAuth with PKCE (mobile apps), client_secret is optional
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  });

  // Only add client_secret if available (required for Spotify, optional for Google with PKCE)
  if (clientSecret) {
    body.set('client_secret', clientSecret);
  }

  // Make the token refresh request
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new TokenRefreshError(
      'REFRESH_FAILED',
      `Token refresh failed: ${response.status}`,
      errorText
    );
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
    refreshToken: data.refresh_token, // May be rotated (especially Spotify)
  };
}

/**
 * Get provider-specific OAuth configuration
 */
function getProviderConfig(
  provider: string,
  env: TokenRefreshEnv
): { tokenUrl: string; clientId: string; clientSecret?: string } {
  switch (provider) {
    case 'YOUTUBE':
      return {
        tokenUrl: 'https://oauth2.googleapis.com/token',
        clientId: env.GOOGLE_CLIENT_ID,
        // Client secret is optional for Google OAuth with PKCE (mobile apps)
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      };
    case 'SPOTIFY':
      return {
        tokenUrl: 'https://accounts.spotify.com/api/token',
        clientId: env.SPOTIFY_CLIENT_ID,
        clientSecret: env.SPOTIFY_CLIENT_SECRET,
      };
    default:
      throw new TokenRefreshError('INVALID_PROVIDER', `Unknown provider: ${provider}`);
  }
}

/**
 * Persist refreshed tokens to the database
 */
async function persistRefreshedTokens(
  connectionId: string,
  refreshed: RefreshedTokens,
  env: TokenRefreshEnv
): Promise<void> {
  const db = drizzle(env.DB);
  const now = Date.now();

  // Encrypt the new access token
  const encryptedAccessToken = await encrypt(refreshed.accessToken, env.ENCRYPTION_KEY);

  // Build update object
  const updateData: {
    accessToken: string;
    tokenExpiresAt: number;
    lastRefreshedAt: number;
    status: string;
    refreshToken?: string;
  } = {
    accessToken: encryptedAccessToken,
    tokenExpiresAt: now + refreshed.expiresIn * 1000,
    lastRefreshedAt: now,
    status: 'ACTIVE', // Mark as active on successful refresh
  };

  // If provider rotated the refresh token, update it too
  if (refreshed.refreshToken) {
    updateData.refreshToken = await encrypt(refreshed.refreshToken, env.ENCRYPTION_KEY);
  }

  await db
    .update(providerConnections)
    .set(updateData)
    .where(eq(providerConnections.id, connectionId));
}

/**
 * Fetch a connection by ID from the database
 */
async function getConnectionById(
  connectionId: string,
  env: TokenRefreshEnv
): Promise<ProviderConnection | null> {
  const db = drizzle(env.DB);

  const result = await db
    .select()
    .from(providerConnections)
    .where(eq(providerConnections.id, connectionId))
    .limit(1);

  return (result[0] as ProviderConnection | undefined) ?? null;
}

/**
 * Simple sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
