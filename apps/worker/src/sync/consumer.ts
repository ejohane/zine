/**
 * Sync Queue Consumer
 *
 * Handles queue messages for async subscription syncing.
 * Each message represents a single subscription to sync.
 *
 * Key features:
 * - Error isolation: each subscription is independent
 * - Automatic retries: Cloudflare Queues retry failed messages
 * - Progress tracking: updates job status after each subscription
 *
 * @see zine-wsjp: Feature: Async Pull-to-Refresh with Cloudflare Queues
 */

import { drizzle } from 'drizzle-orm/d1';
import { and, eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import { providerConnections } from '../db/schema';
import { logger } from '../lib/logger';
import { getYouTubeClientForConnection } from '../providers/youtube';
import { getSpotifyClientForConnection } from '../providers/spotify';
import {
  pollSingleYouTubeSubscription,
  pollYouTubeSubscriptionsBatched,
} from '../polling/youtube-poller';
import {
  pollSingleSpotifySubscription,
  pollSpotifySubscriptionsBatched,
} from '../polling/spotify-poller';
import type { ProviderConnection } from '../lib/token-refresh';
import type { Bindings } from '../types';
import type { Subscription as PollingSubscription, DrizzleDB } from '../polling/types';
import { SyncQueueMessageSchema, type SyncQueueMessage } from './types';
import { updateJobProgress } from './service';

const consumerLogger = logger.child('sync-consumer');

function getMessageLogContext(message: Message<SyncQueueMessage>) {
  return {
    messageId: message.id,
    attempts: message.attempts,
    jobId: message.body.jobId,
    userId: message.body.userId,
    subscriptionId: message.body.subscriptionId,
    provider: message.body.provider,
    traceId: message.body.meta?.traceId,
    requestId: message.body.meta?.requestId,
    clientRequestId: message.body.meta?.clientRequestId,
    source: message.body.meta?.source,
    release: message.body.meta?.release,
  };
}

function retryMessage(message: Message<SyncQueueMessage>, reason: string, error?: string): void {
  consumerLogger.warn('Retrying sync message', {
    operation: 'subscriptions.sync.process',
    event: 'subscriptions.sync.retry',
    status: 'error',
    reason,
    error,
    ...getMessageLogContext(message),
  });
  message.retry();
}

// ============================================================================
// Queue Handler
// ============================================================================

/**
 * Process a batch of sync queue messages.
 *
 * Cloudflare Queues deliver messages in batches. We process each message
 * independently to maintain error isolation.
 *
 * @param batch - Batch of messages from the queue
 * @param env - Cloudflare Worker environment bindings
 */
export async function handleSyncQueue(
  batch: MessageBatch<SyncQueueMessage>,
  env: Bindings
): Promise<void> {
  consumerLogger.info('Processing sync queue batch', {
    operation: 'subscriptions.sync.process',
    event: 'subscriptions.sync.batch.started',
    messageCount: batch.messages.length,
  });

  const db = drizzle(env.DB, { schema });

  // Group messages by job and user for more efficient processing
  const messagesByJob = new Map<string, Map<string, Message<SyncQueueMessage>[]>>();

  for (const message of batch.messages) {
    // Validate message body
    const parseResult = SyncQueueMessageSchema.safeParse(message.body);
    if (!parseResult.success) {
      consumerLogger.error('Invalid message body', {
        operation: 'subscriptions.sync.process',
        event: 'subscriptions.sync.batch.invalid_message',
        status: 'error',
        messageId: message.id,
        error: parseResult.error.message,
      });
      message.ack(); // Don't retry invalid messages
      continue;
    }

    const body = parseResult.data;

    if (!messagesByJob.has(body.jobId)) {
      messagesByJob.set(body.jobId, new Map());
    }
    const jobMessages = messagesByJob.get(body.jobId)!;

    if (!jobMessages.has(body.userId)) {
      jobMessages.set(body.userId, []);
    }
    jobMessages.get(body.userId)!.push(message);
  }

  // Process each job's messages
  for (const [jobId, userMessages] of messagesByJob) {
    for (const [userId, messages] of userMessages) {
      await processUserMessages(jobId, userId, messages, db, env);
    }
  }
}

/**
 * Process messages for a single user within a job.
 *
 * Groups subscriptions by provider and uses batched polling when possible.
 */
async function processUserMessages(
  jobId: string,
  userId: string,
  messages: Message<SyncQueueMessage>[],
  db: ReturnType<typeof drizzle<typeof schema>>,
  env: Bindings
): Promise<void> {
  consumerLogger.info('Processing user messages', {
    operation: 'subscriptions.sync.process',
    event: 'subscriptions.sync.user_batch.started',
    jobId,
    userId,
    messageCount: messages.length,
    traceIds: [...new Set(messages.map((message) => message.body.meta?.traceId).filter(Boolean))],
  });

  // Group by provider
  const byProvider: Record<string, Message<SyncQueueMessage>[]> = {
    YOUTUBE: [],
    SPOTIFY: [],
  };

  for (const message of messages) {
    byProvider[message.body.provider].push(message);
  }

  // Process YouTube subscriptions
  if (byProvider.YOUTUBE.length > 0) {
    await processProviderMessages(jobId, userId, 'YOUTUBE', byProvider.YOUTUBE, db, env);
  }

  // Process Spotify subscriptions
  if (byProvider.SPOTIFY.length > 0) {
    await processProviderMessages(jobId, userId, 'SPOTIFY', byProvider.SPOTIFY, db, env);
  }
}

/**
 * Process messages for a single provider.
 */
async function processProviderMessages(
  jobId: string,
  userId: string,
  provider: 'YOUTUBE' | 'SPOTIFY',
  messages: Message<SyncQueueMessage>[],
  db: ReturnType<typeof drizzle<typeof schema>>,
  env: Bindings
): Promise<void> {
  // Get provider connection
  const connection = await db.query.providerConnections.findFirst({
    where: and(
      eq(providerConnections.userId, userId),
      eq(providerConnections.provider, provider),
      eq(providerConnections.status, 'ACTIVE')
    ),
  });

  if (!connection) {
    consumerLogger.warn('No active connection for provider', {
      operation: 'subscriptions.sync.process',
      event: 'subscriptions.sync.provider.unavailable',
      jobId,
      userId,
      provider,
      traceIds: [...new Set(messages.map((message) => message.body.meta?.traceId).filter(Boolean))],
    });

    // Mark all messages as failed
    for (const message of messages) {
      await updateJobProgress(
        jobId,
        message.body.subscriptionId,
        false,
        0,
        `${provider} not connected`,
        env.OAUTH_STATE_KV
      );
      message.ack(); // Don't retry - connection won't magically appear
    }
    return;
  }

  // Get subscriptions from database for full subscription data
  const subscriptionIds = messages.map((m) => m.body.subscriptionId);
  const subs = await db.query.subscriptions.findMany({
    where: and(eq(schema.subscriptions.userId, userId), eq(schema.subscriptions.status, 'ACTIVE')),
  });

  // Filter to only requested subscriptions
  const subsToSync = subs.filter((s) => subscriptionIds.includes(s.id));

  if (subsToSync.length === 0) {
    consumerLogger.warn('No valid subscriptions found', {
      operation: 'subscriptions.sync.process',
      event: 'subscriptions.sync.subscription_missing',
      jobId,
      userId,
      provider,
      requestedIds: subscriptionIds,
      traceIds: [...new Set(messages.map((message) => message.body.meta?.traceId).filter(Boolean))],
    });

    // Mark all messages as completed (subscription may have been removed)
    for (const message of messages) {
      await updateJobProgress(
        jobId,
        message.body.subscriptionId,
        true,
        0,
        null,
        env.OAUTH_STATE_KV
      );
      message.ack();
    }
    return;
  }

  try {
    // Create provider client and process
    if (provider === 'YOUTUBE') {
      const client = await getYouTubeClientForConnection(
        connection as ProviderConnection,
        env as Parameters<typeof getYouTubeClientForConnection>[1]
      );

      if (subsToSync.length > 1) {
        // Use batched polling for multiple subscriptions
        const result = await pollYouTubeSubscriptionsBatched(
          subsToSync as PollingSubscription[],
          client,
          userId,
          env,
          db as unknown as DrizzleDB
        );

        // Update progress for each subscription
        const successCount = result.processed - (result.errors?.length ?? 0);
        const itemsPerSub = result.newItems / (successCount || 1);

        for (const message of messages) {
          const subId = message.body.subscriptionId;
          const errorEntry = result.errors?.find((e) => e.subscriptionId === subId);

          if (errorEntry) {
            retryMessage(message, 'batched_provider_error', errorEntry.error);
            continue;
          }

          await updateJobProgress(
            jobId,
            subId,
            true,
            Math.round(itemsPerSub),
            null,
            env.OAUTH_STATE_KV
          );
          message.ack();
        }
      } else {
        // Single subscription - use direct polling
        const sub = subsToSync[0];
        const message = messages[0];

        try {
          const result = await pollSingleYouTubeSubscription(
            sub as PollingSubscription,
            client,
            userId,
            env,
            db as unknown as DrizzleDB
          );

          await updateJobProgress(jobId, sub.id, true, result.newItems, null, env.OAUTH_STATE_KV);
          message.ack();
        } catch (error) {
          retryMessage(
            message,
            'single_subscription_error',
            error instanceof Error ? error.message : String(error)
          );
        }
      }
    } else {
      // Spotify
      const client = await getSpotifyClientForConnection(
        connection as ProviderConnection,
        env as Parameters<typeof getSpotifyClientForConnection>[1]
      );

      if (subsToSync.length > 1) {
        // Use batched polling for multiple subscriptions
        const result = await pollSpotifySubscriptionsBatched(
          subsToSync as PollingSubscription[],
          client,
          userId,
          env,
          db as unknown as DrizzleDB
        );

        // Update progress for each subscription
        const successCount = result.processed - (result.errors?.length ?? 0);
        const itemsPerSub = result.newItems / (successCount || 1);

        for (const message of messages) {
          const subId = message.body.subscriptionId;
          const errorEntry = result.errors?.find((e) => e.subscriptionId === subId);

          if (errorEntry) {
            retryMessage(message, 'batched_provider_error', errorEntry.error);
            continue;
          }

          await updateJobProgress(
            jobId,
            subId,
            true,
            Math.round(itemsPerSub),
            null,
            env.OAUTH_STATE_KV
          );
          message.ack();
        }
      } else {
        // Single subscription - use direct polling
        const sub = subsToSync[0];
        const message = messages[0];

        try {
          const result = await pollSingleSpotifySubscription(
            sub as PollingSubscription,
            client,
            userId,
            env,
            db as unknown as DrizzleDB
          );

          await updateJobProgress(jobId, sub.id, true, result.newItems, null, env.OAUTH_STATE_KV);
          message.ack();
        } catch (error) {
          retryMessage(
            message,
            'single_subscription_error',
            error instanceof Error ? error.message : String(error)
          );
        }
      }
    }
  } catch (error) {
    consumerLogger.error('Provider processing failed', {
      operation: 'subscriptions.sync.process',
      event: 'subscriptions.sync.provider.failed',
      status: 'error',
      jobId,
      userId,
      provider,
      error,
      traceIds: [...new Set(messages.map((message) => message.body.meta?.traceId).filter(Boolean))],
    });

    // Retry the whole provider batch so Cloudflare Queues can DLQ persistent failures.
    for (const message of messages) {
      retryMessage(
        message,
        'provider_batch_failure',
        error instanceof Error ? error.message : String(error)
      );
    }
  }
}
