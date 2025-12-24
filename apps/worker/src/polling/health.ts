/**
 * Connection Health Monitoring and Recovery
 *
 * Handles authentication errors during polling with automatic status transitions
 * and user notifications. Implements the connection status flow:
 *
 * ACTIVE ──(refresh fails)──→ EXPIRED
 *    ↑                          │
 *    │                          │ (user revoked)
 *    │                          ↓
 *    └───(user reconnects)─── REVOKED
 *
 * Key responsibilities:
 * - Classify polling authentication errors
 * - Update connection/subscription status on auth failures
 * - Create user notifications with deduplication
 * - Auto-resolve notifications on reconnect
 * - Track poll failures with threshold-based notifications
 *
 * @see /features/subscriptions/backend-spec.md - Section 6.4: Connection Health & Recovery
 */

import { ulid } from 'ulid';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import { providerConnections, subscriptions, userNotifications } from '../db/schema';
import { getValidAccessToken, type ProviderConnection } from '../lib/token-refresh';
import type { Database } from '../db';

// ============================================================================
// Types
// ============================================================================

/**
 * Environment bindings required for health monitoring
 */
export interface HealthMonitorEnv {
  /** D1 database for persistent storage */
  DB: D1Database;
  /** KV namespace for poll failure tracking */
  OAUTH_STATE_KV: KVNamespace;
  /** AES-256 encryption key for token operations */
  ENCRYPTION_KEY: string;
  /** Google OAuth client ID (for YouTube) */
  GOOGLE_CLIENT_ID: string;
  /** Google OAuth client secret (for YouTube) - optional for PKCE flows */
  GOOGLE_CLIENT_SECRET?: string;
  /** Spotify OAuth client ID */
  SPOTIFY_CLIENT_ID: string;
  /** Spotify OAuth client secret */
  SPOTIFY_CLIENT_SECRET: string;
}

/**
 * Notification parameters for creating user notifications
 */
interface NotificationParams {
  type: 'connection_expired' | 'connection_revoked' | 'poll_failures';
  provider: string;
  reason?: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Number of consecutive poll failures before notifying user */
const FAILURE_THRESHOLD = 3;

/** Notification messages by type */
const NOTIFICATION_MESSAGES = {
  connection_expired: (provider: string) =>
    `Your ${provider} connection has expired. Please reconnect to continue receiving updates.`,
  connection_revoked: (provider: string) =>
    `Your ${provider} access was revoked. Please reconnect to continue receiving updates.`,
  poll_failures: (provider: string) =>
    `We're having trouble checking for new ${provider} content. This may resolve automatically.`,
};

/** Notification titles by type */
const NOTIFICATION_TITLES = {
  connection_expired: 'Connection Expired',
  connection_revoked: 'Connection Revoked',
  poll_failures: 'Sync Issue',
};

// ============================================================================
// Error Classification
// ============================================================================

/**
 * Check if error indicates token expiration (401 Unauthorized)
 *
 * @param error - The error to classify
 * @returns true if the error suggests token expiration
 */
export function isTokenExpiredError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return msg.includes('401') || msg.includes('unauthorized') || msg.includes('token expired');
}

/**
 * Check if refresh token is invalid (cannot be refreshed)
 *
 * @param error - The error to classify
 * @returns true if the refresh token is permanently invalid
 */
export function isRefreshTokenInvalid(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return msg.includes('invalid_grant') || msg.includes('refresh token') || msg.includes('revoked');
}

/**
 * Check if provider access was revoked (403 Forbidden)
 *
 * @param error - The error to classify
 * @returns true if the error indicates access was revoked
 */
export function isAccessRevokedError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes('403') ||
    msg.includes('access revoked') ||
    msg.includes('insufficient permissions')
  );
}

// ============================================================================
// Main Error Handler
// ============================================================================

/**
 * Handle authentication errors during polling
 *
 * This function implements the core error recovery logic:
 * 1. If token expired, try to refresh it
 * 2. If refresh fails with invalid_grant, mark connection as EXPIRED
 * 3. If access was revoked (403), mark connection as REVOKED
 * 4. Update related subscriptions to DISCONNECTED
 * 5. Create user notification
 *
 * @param connection - The provider connection that encountered an error
 * @param error - The error that occurred during polling
 * @param env - Environment bindings
 * @param db - Database instance
 *
 * @example
 * ```typescript
 * try {
 *   await pollYouTubeChannel(connection, channelId);
 * } catch (error) {
 *   await handlePollingAuthError(connection, error as Error, env, db);
 * }
 * ```
 */
export async function handlePollingAuthError(
  connection: ProviderConnection,
  error: Error,
  env: HealthMonitorEnv,
  db: Database
): Promise<void> {
  if (isTokenExpiredError(error)) {
    // Try to refresh the token first
    try {
      await getValidAccessToken(connection, env);
      // Success! Token was refreshed, no status change needed
      return;
    } catch (refreshError) {
      // Refresh failed - check if it's permanent
      if (refreshError instanceof Error && isRefreshTokenInvalid(refreshError)) {
        await markConnectionExpired(connection.id, 'refresh_token_invalid', db);
      }
      // For transient errors, don't change status yet - will retry next poll
    }
  } else if (isAccessRevokedError(error)) {
    // User revoked access at the provider
    await markConnectionRevoked(connection.id, db);
  }
}

// ============================================================================
// Connection Status Updates
// ============================================================================

/**
 * Mark a connection as expired and update related subscriptions
 *
 * Called when token refresh fails due to invalid refresh token.
 * Creates a user notification prompting reconnection.
 *
 * @param connectionId - ID of the connection to mark as expired
 * @param reason - Reason for expiration (for logging/notifications)
 * @param db - Database instance
 */
export async function markConnectionExpired(
  connectionId: string,
  reason: string,
  db: Database
): Promise<void> {
  // Get connection details for notification
  const conn = await db.query.providerConnections.findFirst({
    where: eq(providerConnections.id, connectionId),
    columns: { userId: true, provider: true },
  });

  if (!conn) return;

  // Update connection status
  await db
    .update(providerConnections)
    .set({ status: 'EXPIRED' })
    .where(eq(providerConnections.id, connectionId));

  // Mark related subscriptions as disconnected
  await db
    .update(subscriptions)
    .set({ status: 'DISCONNECTED', updatedAt: Date.now() })
    .where(
      and(
        eq(subscriptions.userId, conn.userId),
        eq(subscriptions.provider, conn.provider),
        eq(subscriptions.status, 'ACTIVE')
      )
    );

  // Create notification for user
  await createUserNotification(
    conn.userId,
    {
      type: 'connection_expired',
      provider: conn.provider,
      reason,
    },
    db
  );

  console.log(
    `[health] Connection ${connectionId} marked as EXPIRED for user ${conn.userId} (${conn.provider}): ${reason}`
  );
}

/**
 * Mark a connection as revoked and update related subscriptions
 *
 * Called when provider returns 403/access revoked error.
 * Creates a user notification prompting reconnection.
 *
 * @param connectionId - ID of the connection to mark as revoked
 * @param db - Database instance
 */
export async function markConnectionRevoked(connectionId: string, db: Database): Promise<void> {
  // Get connection details for notification
  const conn = await db.query.providerConnections.findFirst({
    where: eq(providerConnections.id, connectionId),
    columns: { userId: true, provider: true },
  });

  if (!conn) return;

  // Update connection status
  await db
    .update(providerConnections)
    .set({ status: 'REVOKED' })
    .where(eq(providerConnections.id, connectionId));

  // Mark related subscriptions as disconnected
  await db
    .update(subscriptions)
    .set({ status: 'DISCONNECTED', updatedAt: Date.now() })
    .where(
      and(
        eq(subscriptions.userId, conn.userId),
        eq(subscriptions.provider, conn.provider),
        eq(subscriptions.status, 'ACTIVE')
      )
    );

  // Create notification for user
  await createUserNotification(
    conn.userId,
    {
      type: 'connection_revoked',
      provider: conn.provider,
    },
    db
  );

  console.log(
    `[health] Connection ${connectionId} marked as REVOKED for user ${conn.userId} (${conn.provider})`
  );
}

// ============================================================================
// User Notifications
// ============================================================================

/**
 * Create a user notification with deduplication
 *
 * Prevents duplicate active notifications of the same type/provider combo.
 * If an active notification exists, it won't create a new one.
 *
 * @param userId - User ID to notify
 * @param params - Notification parameters (type, provider, reason)
 * @param db - Database instance
 */
async function createUserNotification(
  userId: string,
  params: NotificationParams,
  db: Database
): Promise<void> {
  const title = NOTIFICATION_TITLES[params.type];
  const message = NOTIFICATION_MESSAGES[params.type](params.provider);

  try {
    // Check for existing active notification (deduplication)
    // This implements the partial unique constraint described in schema
    const existing = await db.query.userNotifications.findFirst({
      where: and(
        eq(userNotifications.userId, userId),
        eq(userNotifications.type, params.type),
        eq(userNotifications.provider, params.provider),
        isNull(userNotifications.resolvedAt)
      ),
    });

    if (existing) {
      // Already have an active notification, don't create duplicate
      console.log(`[health] Skipping duplicate notification for ${userId}: ${params.type}`);
      return;
    }

    // Create new notification
    await db.insert(userNotifications).values({
      id: ulid(),
      userId,
      type: params.type,
      provider: params.provider,
      title,
      message,
      data: params.reason ? JSON.stringify({ reason: params.reason }) : null,
      createdAt: Date.now(),
    });

    console.log(`[health] Created notification for ${userId}: ${params.type} (${params.provider})`);
  } catch (e) {
    console.error('[health] Failed to create notification:', e);
  }
}

/**
 * Auto-resolve connection notifications on successful reconnect
 *
 * Called when a user successfully reconnects a provider.
 * Resolves any outstanding connection_expired or connection_revoked notifications.
 *
 * @param userId - User ID who reconnected
 * @param provider - Provider that was reconnected
 * @param db - Database instance
 *
 * @example
 * ```typescript
 * // In OAuth callback after successful token exchange:
 * await resolveConnectionNotifications(userId, 'YOUTUBE', db);
 * ```
 */
export async function resolveConnectionNotifications(
  userId: string,
  provider: string,
  db: Database
): Promise<void> {
  await db
    .update(userNotifications)
    .set({ resolvedAt: Date.now() })
    .where(
      and(
        eq(userNotifications.userId, userId),
        eq(userNotifications.provider, provider),
        isNull(userNotifications.resolvedAt),
        inArray(userNotifications.type, ['connection_expired', 'connection_revoked'])
      )
    );

  console.log(`[health] Resolved connection notifications for ${userId} (${provider})`);
}

// ============================================================================
// Poll Failure Tracking
// ============================================================================

/**
 * Track consecutive poll failures for a subscription
 *
 * Increments failure count in KV storage. After reaching FAILURE_THRESHOLD (3),
 * creates a notification to inform the user of sync issues.
 *
 * Failures auto-expire after 24 hours in KV.
 *
 * @param subscriptionId - The subscription that failed to poll
 * @param error - The error that occurred
 * @param env - Environment bindings (needs KV namespace)
 * @param db - Database instance (for notifications)
 *
 * @example
 * ```typescript
 * try {
 *   await pollSubscription(sub);
 *   await clearPollFailures(sub.id, env); // Clear on success
 * } catch (error) {
 *   await trackPollFailure(sub.id, error as Error, env, db);
 * }
 * ```
 */
export async function trackPollFailure(
  subscriptionId: string,
  error: Error,
  env: HealthMonitorEnv,
  db: Database
): Promise<void> {
  const key = `poll:failures:${subscriptionId}`;
  const current = parseInt((await env.OAUTH_STATE_KV.get(key)) || '0', 10);
  const newCount = current + 1;

  // Store with 24-hour expiration (failures auto-reset)
  await env.OAUTH_STATE_KV.put(key, String(newCount), { expirationTtl: 24 * 3600 });

  console.log(
    `[health] Poll failure #${newCount} for subscription ${subscriptionId}: ${error.message}`
  );

  // Notify user after threshold is reached
  if (newCount === FAILURE_THRESHOLD) {
    const sub = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.id, subscriptionId),
      columns: { userId: true, provider: true },
    });

    if (sub) {
      await createUserNotification(
        sub.userId,
        {
          type: 'poll_failures',
          provider: sub.provider,
        },
        db
      );
    }
  }
}

/**
 * Clear poll failures for a subscription on successful poll
 *
 * Resets the failure counter. Should be called after each successful poll.
 *
 * @param subscriptionId - The subscription that polled successfully
 * @param env - Environment bindings (needs KV namespace)
 *
 * @example
 * ```typescript
 * const items = await pollSubscription(sub);
 * await clearPollFailures(sub.id, env);
 * ```
 */
export async function clearPollFailures(
  subscriptionId: string,
  env: HealthMonitorEnv
): Promise<void> {
  await env.OAUTH_STATE_KV.delete(`poll:failures:${subscriptionId}`);
}

/**
 * Resolve poll failure notifications on successful poll
 *
 * Called after a successful poll to auto-resolve any outstanding
 * poll_failures notifications for the subscription.
 *
 * @param userId - User ID who owns the subscription
 * @param provider - Provider of the subscription
 * @param db - Database instance
 */
export async function resolvePollFailureNotifications(
  userId: string,
  provider: string,
  db: Database
): Promise<void> {
  await db
    .update(userNotifications)
    .set({ resolvedAt: Date.now() })
    .where(
      and(
        eq(userNotifications.userId, userId),
        eq(userNotifications.provider, provider),
        eq(userNotifications.type, 'poll_failures'),
        isNull(userNotifications.resolvedAt)
      )
    );
}
