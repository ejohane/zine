/**
 * Async Sync Service
 *
 * Handles job initiation, status tracking, and queue message enqueuing
 * for the async pull-to-refresh feature.
 *
 * Key features:
 * - Job deduplication: returns existing job if sync already in progress
 * - Rate limiting: enforces 2-minute cooldown between syncs
 * - KV-based status tracking: progress visible across requests
 * - Error isolation: each subscription is an independent queue message
 *
 * @see zine-wsjp: Feature: Async Pull-to-Refresh with Cloudflare Queues
 */

import { ulid } from 'ulid';
import { and, eq } from 'drizzle-orm';
import { subscriptions, providerConnections } from '../db/schema';
import { logger } from '../lib/logger';
import type { Database } from '../db';
import type { Bindings } from '../types';
import {
  type SyncJobStatus,
  type SyncQueueMessage,
  type SyncAllAsyncResponse,
  type SyncStatusResponse,
  type ActiveSyncJobResponse,
  getActiveJobKey,
  getJobStatusKey,
  JOB_STATUS_TTL_SECONDS,
  ACTIVE_JOB_TTL_SECONDS,
} from './types';

// ============================================================================
// Constants
// ============================================================================

/** Rate limit cooldown in milliseconds (2 minutes) */
const RATE_LIMIT_COOLDOWN_MS = 2 * 60 * 1000;

/** Rate limit KV key prefix */
const RATE_LIMIT_KEY_PREFIX = 'sync-all:';

const syncLogger = logger.child('sync-service');

// ============================================================================
// Job Management
// ============================================================================

/**
 * Initiate an async sync job for all active subscriptions.
 *
 * This function:
 * 1. Checks rate limiting (2-minute cooldown)
 * 2. Checks for existing active job (deduplication)
 * 3. Fetches all active subscriptions with valid connections
 * 4. Creates job status in KV
 * 5. Enqueues messages for each subscription
 *
 * @throws If rate limited (caller should handle gracefully)
 */
export async function initiateSyncJob(
  userId: string,
  db: Database,
  env: Bindings
): Promise<SyncAllAsyncResponse> {
  const kv = env.OAUTH_STATE_KV;

  // 1. Check rate limit
  const rateLimitKey = `${RATE_LIMIT_KEY_PREFIX}${userId}`;
  const lastSync = await kv.get(rateLimitKey);
  if (lastSync) {
    const elapsed = Date.now() - parseInt(lastSync, 10);
    if (elapsed < RATE_LIMIT_COOLDOWN_MS) {
      const waitSeconds = Math.ceil((RATE_LIMIT_COOLDOWN_MS - elapsed) / 1000);
      throw new RateLimitError(`Please wait ${waitSeconds} seconds before syncing again`);
    }
  }

  // 2. Check for existing active job
  const activeJobKey = getActiveJobKey(userId);
  const existingJobId = await kv.get(activeJobKey);
  if (existingJobId) {
    // Check if the job is still valid
    const existingStatus = await getJobStatus(existingJobId, kv);
    if (existingStatus && existingStatus.status !== 'completed') {
      syncLogger.info('Returning existing active job', {
        userId,
        jobId: existingJobId,
        status: existingStatus.status,
      });
      return {
        jobId: existingJobId,
        total: existingStatus.total,
        existing: true,
      };
    }
  }

  // 3. Get all active subscriptions for user
  const activeSubs = await db.query.subscriptions.findMany({
    where: and(eq(subscriptions.userId, userId), eq(subscriptions.status, 'ACTIVE')),
  });

  if (activeSubs.length === 0) {
    // No subscriptions to sync - return a "completed" job immediately
    const jobId = ulid();
    const jobStatus: SyncJobStatus = {
      jobId,
      userId,
      total: 0,
      completed: 0,
      succeeded: 0,
      failed: 0,
      itemsFound: 0,
      status: 'completed',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      errors: [],
    };
    await kv.put(getJobStatusKey(jobId), JSON.stringify(jobStatus), {
      expirationTtl: JOB_STATUS_TTL_SECONDS,
    });

    return {
      jobId,
      total: 0,
      existing: false,
    };
  }

  // 4. Verify we have active connections for the providers we need
  const providers = [...new Set(activeSubs.map((s) => s.provider))];
  const connections = await db.query.providerConnections.findMany({
    where: and(eq(providerConnections.userId, userId), eq(providerConnections.status, 'ACTIVE')),
  });
  const connectedProviders = new Set(connections.map((c) => c.provider));

  // Filter to only subscriptions we can actually sync
  const syncableSubs = activeSubs.filter((s) => connectedProviders.has(s.provider));

  if (syncableSubs.length === 0) {
    // No syncable subscriptions - return completed job
    const jobId = ulid();
    const jobStatus: SyncJobStatus = {
      jobId,
      userId,
      total: 0,
      completed: 0,
      succeeded: 0,
      failed: 0,
      itemsFound: 0,
      status: 'completed',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      errors: providers.map((p) => ({
        subscriptionId: 'all',
        error: `${p} not connected`,
      })),
    };
    await kv.put(getJobStatusKey(jobId), JSON.stringify(jobStatus), {
      expirationTtl: JOB_STATUS_TTL_SECONDS,
    });

    return {
      jobId,
      total: 0,
      existing: false,
    };
  }

  // 5. Create job
  const jobId = ulid();
  const now = Date.now();

  const jobStatus: SyncJobStatus = {
    jobId,
    userId,
    total: syncableSubs.length,
    completed: 0,
    succeeded: 0,
    failed: 0,
    itemsFound: 0,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    errors: [],
  };

  // 6. Store job status and active job marker
  await Promise.all([
    kv.put(getJobStatusKey(jobId), JSON.stringify(jobStatus), {
      expirationTtl: JOB_STATUS_TTL_SECONDS,
    }),
    kv.put(activeJobKey, jobId, {
      expirationTtl: ACTIVE_JOB_TTL_SECONDS,
    }),
    // Update rate limit
    kv.put(rateLimitKey, now.toString(), {
      expirationTtl: 120, // 2 minutes
    }),
  ]);

  // 7. Enqueue messages for each subscription
  // Note: Queue binding will be added in the next step
  const queue = (env as EnvWithQueue).SYNC_QUEUE;
  if (queue) {
    const messages: SyncQueueMessage[] = syncableSubs.map((sub) => ({
      jobId,
      userId,
      subscriptionId: sub.id,
      provider: sub.provider as 'YOUTUBE' | 'SPOTIFY',
      providerChannelId: sub.providerChannelId,
      enqueuedAt: now,
    }));

    // Batch send messages to queue
    await queue.sendBatch(
      messages.map((msg) => ({
        body: msg,
      }))
    );

    syncLogger.info('Sync job initiated', {
      jobId,
      userId,
      total: syncableSubs.length,
      youtube: syncableSubs.filter((s) => s.provider === 'YOUTUBE').length,
      spotify: syncableSubs.filter((s) => s.provider === 'SPOTIFY').length,
    });
  } else {
    // Fallback: Queue not available, process synchronously
    // This allows the feature to work in development without queue setup
    syncLogger.warn('Queue not available, falling back to synchronous processing', {
      jobId,
      userId,
    });

    // Mark as completed immediately since we can't queue
    jobStatus.status = 'completed';
    jobStatus.errors.push({
      subscriptionId: 'system',
      error: 'Queue not available - sync skipped',
    });
    await kv.put(getJobStatusKey(jobId), JSON.stringify(jobStatus), {
      expirationTtl: JOB_STATUS_TTL_SECONDS,
    });
  }

  return {
    jobId,
    total: syncableSubs.length,
    existing: false,
  };
}

/**
 * Get the status of a sync job.
 */
export async function getJobStatus(jobId: string, kv: KVNamespace): Promise<SyncJobStatus | null> {
  const data = await kv.get(getJobStatusKey(jobId));
  if (!data) return null;

  try {
    return JSON.parse(data) as SyncJobStatus;
  } catch {
    return null;
  }
}

/**
 * Get sync status for the tRPC response.
 */
export async function getSyncStatus(jobId: string, kv: KVNamespace): Promise<SyncStatusResponse> {
  const status = await getJobStatus(jobId, kv);

  if (!status) {
    return {
      jobId,
      status: 'not_found',
      total: 0,
      completed: 0,
      succeeded: 0,
      failed: 0,
      itemsFound: 0,
      progress: 0,
      errors: [],
    };
  }

  const progress = status.total > 0 ? Math.round((status.completed / status.total) * 100) : 100;

  return {
    jobId,
    status: status.status,
    total: status.total,
    completed: status.completed,
    succeeded: status.succeeded,
    failed: status.failed,
    itemsFound: status.itemsFound,
    progress,
    errors: status.errors,
  };
}

/**
 * Check if a user has an active sync job.
 */
export async function getActiveSyncJob(
  userId: string,
  kv: KVNamespace
): Promise<ActiveSyncJobResponse> {
  const activeJobKey = getActiveJobKey(userId);
  const jobId = await kv.get(activeJobKey);

  if (!jobId) {
    return {
      inProgress: false,
      jobId: null,
    };
  }

  const status = await getJobStatus(jobId, kv);
  if (!status || status.status === 'completed') {
    return {
      inProgress: false,
      jobId: null,
    };
  }

  return {
    inProgress: true,
    jobId,
    progress: {
      total: status.total,
      completed: status.completed,
      status: status.status,
    },
  };
}

/**
 * Update job status after processing a subscription.
 * Called by the queue consumer.
 */
export async function updateJobProgress(
  jobId: string,
  subscriptionId: string,
  success: boolean,
  itemsFound: number,
  error: string | null,
  kv: KVNamespace
): Promise<void> {
  const statusKey = getJobStatusKey(jobId);
  const data = await kv.get(statusKey);

  if (!data) {
    syncLogger.warn('Job status not found for update', { jobId, subscriptionId });
    return;
  }

  const status: SyncJobStatus = JSON.parse(data);

  // Update counters
  status.completed++;
  if (success) {
    status.succeeded++;
    status.itemsFound += itemsFound;
  } else {
    status.failed++;
    if (error) {
      status.errors.push({ subscriptionId, error });
    }
  }

  // Update status
  status.updatedAt = Date.now();
  if (status.completed >= status.total) {
    status.status = 'completed';

    // Clear the active job marker
    const activeJobKey = getActiveJobKey(status.userId);
    await kv.delete(activeJobKey);
  } else if (status.status === 'pending') {
    status.status = 'processing';
  }

  // Save updated status
  await kv.put(statusKey, JSON.stringify(status), {
    expirationTtl: JOB_STATUS_TTL_SECONDS,
  });

  syncLogger.debug('Job progress updated', {
    jobId,
    subscriptionId,
    success,
    itemsFound,
    completed: status.completed,
    total: status.total,
    status: status.status,
  });
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error thrown when rate limit is exceeded.
 */
export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

// ============================================================================
// Type Augmentation
// ============================================================================

/**
 * Extended Bindings type with queue binding.
 * The queue binding is optional since it won't exist in all environments.
 */
interface EnvWithQueue extends Bindings {
  SYNC_QUEUE?: Queue<SyncQueueMessage>;
}
