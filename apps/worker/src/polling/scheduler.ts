/**
 * Subscription Polling Scheduler
 *
 * Main cron job handler for polling subscriptions with distributed locking.
 * Prevents overlapping executions across multiple Cloudflare Worker instances.
 *
 * Key features:
 * - Distributed lock via KV prevents concurrent cron executions
 * - Processes only due subscriptions (based on lastPolledAt and pollIntervalSeconds)
 * - Groups by provider and user for efficient API usage
 * - Handles auth errors by marking connections/subscriptions as disconnected
 * - Updates lastPolledAt after each subscription poll
 *
 * @see /features/subscriptions/backend-spec.md Section 3: Polling Architecture
 */

import { and, eq, or, asc, isNull, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../db/schema';
import { subscriptions, providerConnections } from '../db/schema';
import { tryAcquireLock, releaseLock } from '../lib/locks';
import { pollLogger } from '../lib/logger';
import { isRateLimited } from '../lib/rate-limiter';
import type { Bindings } from '../types';
import type {
  Subscription,
  DrizzleDB,
  BatchResult,
  ProviderBatchConfig,
  ProviderConnectionRow,
} from './types';
import { youtubeProviderConfig } from './youtube-poller';
import { spotifyProviderConfig } from './spotify-poller';

// ============================================================================
// Constants
// ============================================================================

/** Distributed lock key for polling cron */
const POLL_LOCK_KEY = 'cron:poll-subscriptions:lock';

/** Lock TTL in seconds (15 minutes) - should cover worst case polling time */
const POLL_LOCK_TTL = 900;

/** Maximum subscriptions to process per cron run */
const BATCH_SIZE = 50;

// ============================================================================
// Types
// ============================================================================

/**
 * Result of a polling run
 */
export interface PollResult {
  /** Whether polling was skipped (e.g., lock held) */
  skipped: boolean;
  /** Reason for skipping or summary info */
  reason?: string;
  /** Number of subscriptions processed */
  processed?: number;
  /** Number of new items ingested */
  newItems?: number;
}

// ============================================================================
// Main Polling Function
// ============================================================================

/**
 * Poll due subscriptions for new content.
 *
 * This is the main entry point called by the cron scheduled handler.
 * It acquires a distributed lock, finds due subscriptions, and processes them.
 *
 * @param env - Cloudflare Worker environment bindings
 * @param _ctx - Execution context (for waitUntil if needed)
 * @returns PollResult with processing statistics
 */
export async function pollSubscriptions(
  env: Bindings,
  _ctx: ExecutionContext
): Promise<PollResult> {
  // 1. Try to acquire distributed lock
  const lockAcquired = await tryAcquireLock(env.OAUTH_STATE_KV, POLL_LOCK_KEY, POLL_LOCK_TTL);
  if (!lockAcquired) {
    pollLogger.info('Skipped: lock held by another worker');
    return { skipped: true, reason: 'lock_held' };
  }

  try {
    const db = drizzle(env.DB, { schema });
    const now = Date.now();

    // 2. Find due subscriptions
    // A subscription is due when:
    // - status is ACTIVE
    // - AND either:
    //   - lastPolledAt is NULL (never polled)
    //   - OR lastPolledAt < (now - pollIntervalSeconds * 1000)
    const dueSubscriptions = await db.query.subscriptions.findMany({
      where: and(
        eq(subscriptions.status, 'ACTIVE'),
        or(
          isNull(subscriptions.lastPolledAt),
          sql`${subscriptions.lastPolledAt} < ${now} - (${subscriptions.pollIntervalSeconds} * 1000)`
        )
      ),
      orderBy: [asc(subscriptions.lastPolledAt)],
      limit: BATCH_SIZE,
    });

    if (dueSubscriptions.length === 0) {
      pollLogger.info('No subscriptions due for polling');
      return { skipped: false, processed: 0, reason: 'no_due_subscriptions' };
    }

    pollLogger.info('Found due subscriptions', { count: dueSubscriptions.length });

    // 3. Group by provider
    const youtube = dueSubscriptions.filter((s) => s.provider === 'YOUTUBE');
    const spotify = dueSubscriptions.filter((s) => s.provider === 'SPOTIFY');

    pollLogger.info('Subscriptions by provider', {
      youtube: youtube.length,
      spotify: spotify.length,
    });

    // 4. Process each provider's batch in parallel
    const [ytResult, spResult] = await Promise.all([
      processProviderBatch(youtube, youtubeProviderConfig, env, db),
      processProviderBatch(spotify, spotifyProviderConfig, env, db),
    ]);

    const totalProcessed = ytResult.processed + spResult.processed;
    const totalNewItems = ytResult.newItems + spResult.newItems;

    pollLogger.info('Polling complete', { processed: totalProcessed, newItems: totalNewItems });

    return {
      skipped: false,
      processed: totalProcessed,
      newItems: totalNewItems,
    };
  } finally {
    // Always release the lock
    await releaseLock(env.OAUTH_STATE_KV, POLL_LOCK_KEY);
  }
}

// ============================================================================
// Generic Provider Batch Processing
// ============================================================================

/**
 * Process a batch of subscriptions for any provider.
 *
 * This generic function encapsulates the shared batch processing logic:
 * 1. Group subscriptions by user to share API connections
 * 2. Check rate limits per user
 * 3. Get active provider connection from DB
 * 4. Create provider client and process each subscription
 * 5. Handle auth errors by marking connections/subscriptions disconnected
 *
 * @param subs - Subscriptions to process
 * @param config - Provider-specific configuration (client creation, polling logic)
 * @param env - Cloudflare Worker bindings
 * @param db - Database instance
 * @returns BatchResult with processed count and new items count
 */
async function processProviderBatch<TClient>(
  subs: Subscription[],
  config: ProviderBatchConfig<TClient>,
  env: Bindings,
  db: DrizzleDB
): Promise<BatchResult> {
  let processed = 0;
  let newItems = 0;

  if (subs.length === 0) {
    return { processed, newItems };
  }

  const providerLower = config.provider.toLowerCase();

  // Group by user to share connection
  const byUser = groupBy(subs, 'userId');

  for (const [userId, userSubs] of Object.entries(byUser)) {
    // Check rate limit before processing
    const rateCheck = await isRateLimited(config.provider, userId, env.OAUTH_STATE_KV);
    if (rateCheck.limited) {
      pollLogger.child(providerLower).info('Skipping user: rate limited', {
        userId,
        retryInMs: rateCheck.retryInMs,
      });
      continue;
    }

    // Get connection for this user
    const connection = await db.query.providerConnections.findFirst({
      where: and(
        eq(providerConnections.userId, userId),
        eq(providerConnections.provider, config.provider),
        eq(providerConnections.status, 'ACTIVE')
      ),
    });

    if (!connection) {
      pollLogger
        .child(providerLower)
        .info('No active connection for user, marking subscriptions disconnected', {
          userId,
        });
      await markSubscriptionsDisconnected(
        userSubs.map((s) => s.id),
        db
      );
      continue;
    }

    try {
      // Create provider client with valid token
      const client = await config.getClient(connection as ProviderConnectionRow, env);

      // Process each subscription for this user
      for (const sub of userSubs) {
        try {
          const result = await config.pollSingle(sub, client, userId, env, db);
          processed++;
          newItems += result.newItems;
        } catch (subError) {
          pollLogger.child(providerLower).error('Error polling subscription', {
            subscriptionId: sub.id,
            error: subError,
          });
          // Update lastPolledAt even on error to prevent infinite retry
          await updateSubscriptionPolled(sub.id, db);
          processed++;
        }
      }
    } catch (error: unknown) {
      // Handle auth errors at the user level
      if (isAuthError(error)) {
        pollLogger.child(providerLower).info('Auth error for user, marking connection expired', {
          userId,
        });
        await markConnectionExpired(connection.id, db);
        await markSubscriptionsDisconnected(
          userSubs.map((s) => s.id),
          db
        );
      } else {
        pollLogger.child(providerLower).error('Batch error for user', { userId, error });
      }
    }
  }

  return { processed, newItems };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if an error indicates an authentication failure.
 */
function isAuthError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const err = error as Record<string, unknown>;

  // Check HTTP status codes
  if (err.status === 401 || err.status === 403) {
    return true;
  }

  // Check nested response status
  if (err.response && typeof err.response === 'object') {
    const response = err.response as Record<string, unknown>;
    if (response.status === 401 || response.status === 403) {
      return true;
    }
  }

  // Check error messages
  const message = typeof err.message === 'string' ? err.message.toLowerCase() : '';
  return (
    message.includes('unauthorized') ||
    message.includes('invalid_grant') ||
    message.includes('token expired') ||
    message.includes('access denied')
  );
}

/**
 * Mark subscriptions as disconnected.
 */
async function markSubscriptionsDisconnected(ids: string[], db: DrizzleDB): Promise<void> {
  if (ids.length === 0) return;

  await db
    .update(subscriptions)
    .set({ status: 'DISCONNECTED', updatedAt: Date.now() })
    .where(inArray(subscriptions.id, ids));
}

/**
 * Mark a provider connection as expired.
 */
async function markConnectionExpired(connectionId: string, db: DrizzleDB): Promise<void> {
  await db
    .update(providerConnections)
    .set({ status: 'EXPIRED' })
    .where(eq(providerConnections.id, connectionId));
}

/**
 * Update subscription lastPolledAt (used after errors to prevent infinite retry).
 */
async function updateSubscriptionPolled(subscriptionId: string, db: DrizzleDB): Promise<void> {
  await db
    .update(subscriptions)
    .set({ lastPolledAt: Date.now(), updatedAt: Date.now() })
    .where(eq(subscriptions.id, subscriptionId));
}

/**
 * Group an array of items by a key.
 */
function groupBy<T, K extends keyof T>(items: T[], key: K): Record<string, T[]> {
  return items.reduce(
    (acc, item) => {
      const groupKey = String(item[key]);
      if (!acc[groupKey]) {
        acc[groupKey] = [];
      }
      acc[groupKey].push(item);
      return acc;
    },
    {} as Record<string, T[]>
  );
}
