/**
 * DLQ Consumer
 *
 * Handles messages that have exhausted all retries and landed in the Dead Letter Queue.
 * This consumer:
 * 1. Logs DLQ events at ERROR level for Cloudflare dashboard alerts
 * 2. Stores DLQ entries in KV for investigation and potential replay
 * 3. Maintains a DLQ index for querying recent failures
 *
 * @see zine-m2oq: Task: Add monitoring/alerting for sync queue DLQ
 */

import { ulid } from 'ulid';
import { logger } from '../lib/logger';
import type { Bindings } from '../types';
import {
  type SyncQueueMessage,
  type DLQEntry,
  SyncQueueMessageSchema,
  getDLQEntryKey,
  getDLQIndexKey,
  DLQ_ENTRY_TTL_SECONDS,
} from './types';

const dlqLogger = logger.child('sync-dlq');

/** Maximum number of DLQ entry IDs to keep in the index */
const DLQ_INDEX_MAX_ENTRIES = 100;

function parseDLQIndex(indexData: string | null, operation: string): string[] {
  if (!indexData) {
    return [];
  }

  try {
    const parsed = JSON.parse(indexData) as unknown;
    if (!Array.isArray(parsed) || parsed.some((entryId) => typeof entryId !== 'string')) {
      dlqLogger.warn('DLQ index data has invalid shape; resetting', { operation });
      return [];
    }

    return parsed;
  } catch (error) {
    dlqLogger.warn('Failed to parse DLQ index JSON; resetting', {
      operation,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Process a batch of DLQ messages.
 *
 * Messages arrive here after exhausting all retries (configured as 3 in wrangler.toml).
 * Each message represents a subscription sync that persistently failed.
 *
 * @param batch - Batch of messages from the DLQ
 * @param env - Cloudflare Worker environment bindings
 */
export async function handleSyncDLQ(
  batch: MessageBatch<SyncQueueMessage>,
  env: Bindings
): Promise<void> {
  const kv = env.OAUTH_STATE_KV;
  const environment = env.ENVIRONMENT || 'development';

  // Log at ERROR level for Cloudflare dashboard alerts
  // This is the primary alerting mechanism - Cloudflare logs can be filtered by level
  dlqLogger.error('DLQ messages received - sync failures requiring investigation', {
    messageCount: batch.messages.length,
    environment,
    // Include summary for quick triage
    summary: batch.messages.map((m) => ({
      messageId: m.id,
      attempts: m.attempts,
      jobId: m.body?.jobId,
      userId: m.body?.userId,
      provider: m.body?.provider,
      subscriptionId: m.body?.subscriptionId,
    })),
  });

  const dlqEntries: DLQEntry[] = [];
  const now = Date.now();

  for (const message of batch.messages) {
    // Validate message body (may be malformed if that's why it failed)
    const parseResult = SyncQueueMessageSchema.safeParse(message.body);

    if (!parseResult.success) {
      // Log malformed message separately
      dlqLogger.error('DLQ: Malformed message body', {
        messageId: message.id,
        attempts: message.attempts,
        error: parseResult.error.message,
        rawBody: JSON.stringify(message.body),
      });

      // Create entry with partial data
      const entry: DLQEntry = {
        id: ulid(),
        message: {
          jobId: message.body?.jobId ?? 'unknown',
          userId: message.body?.userId ?? 'unknown',
          subscriptionId: message.body?.subscriptionId ?? 'unknown',
          provider: message.body?.provider ?? 'YOUTUBE',
          providerChannelId: message.body?.providerChannelId ?? 'unknown',
          enqueuedAt: message.body?.enqueuedAt ?? now,
        },
        deadLetteredAt: now,
        attempts: message.attempts,
        environment,
      };
      dlqEntries.push(entry);
    } else {
      // Log each DLQ entry with full context
      const body = parseResult.data;
      dlqLogger.error('DLQ: Subscription sync permanently failed', {
        messageId: message.id,
        attempts: message.attempts,
        jobId: body.jobId,
        userId: body.userId,
        provider: body.provider,
        subscriptionId: body.subscriptionId,
        providerChannelId: body.providerChannelId,
        enqueuedAt: body.enqueuedAt,
        ageMs: now - body.enqueuedAt,
      });

      const entry: DLQEntry = {
        id: ulid(),
        message: body,
        deadLetteredAt: now,
        attempts: message.attempts,
        environment,
      };
      dlqEntries.push(entry);
    }

    // Acknowledge the message to remove it from DLQ
    // We've stored it in KV for investigation
    message.ack();
  }

  // Store DLQ entries in KV for investigation
  await storeDLQEntries(dlqEntries, kv);

  dlqLogger.info('DLQ batch processed and stored', {
    entriesStored: dlqEntries.length,
    entryIds: dlqEntries.map((e) => e.id),
  });
}

/**
 * Store DLQ entries in KV and update the index.
 */
async function storeDLQEntries(entries: DLQEntry[], kv: KVNamespace): Promise<void> {
  if (entries.length === 0) return;

  // Store each entry
  const storePromises = entries.map((entry) =>
    kv.put(getDLQEntryKey(entry.id), JSON.stringify(entry), {
      expirationTtl: DLQ_ENTRY_TTL_SECONDS,
    })
  );

  // Update the index with new entry IDs
  const indexKey = getDLQIndexKey();
  const existingIndex = await kv.get(indexKey);
  let entryIds = parseDLQIndex(existingIndex, 'store');

  // Add new entries at the beginning (most recent first)
  entryIds = [...entries.map((e) => e.id), ...entryIds];

  // Trim to max size
  if (entryIds.length > DLQ_INDEX_MAX_ENTRIES) {
    entryIds = entryIds.slice(0, DLQ_INDEX_MAX_ENTRIES);
  }

  // Store updated index
  await Promise.all([
    ...storePromises,
    kv.put(indexKey, JSON.stringify(entryIds), {
      expirationTtl: DLQ_ENTRY_TTL_SECONDS,
    }),
  ]);
}

/**
 * Get recent DLQ entries for monitoring/debugging.
 *
 * @param kv - KV namespace
 * @param limit - Maximum number of entries to return (default: 20)
 * @returns Array of DLQ entries, most recent first
 */
export async function getDLQEntries(kv: KVNamespace, limit: number = 20): Promise<DLQEntry[]> {
  const indexKey = getDLQIndexKey();
  const indexData = await kv.get(indexKey);

  if (!indexData) {
    return [];
  }

  const entryIds = parseDLQIndex(indexData, 'list');
  const idsToFetch = entryIds.slice(0, limit);

  // Fetch entries in parallel
  const entryPromises = idsToFetch.map(async (id) => {
    const data = await kv.get(getDLQEntryKey(id));
    if (!data) return null;
    try {
      return JSON.parse(data) as DLQEntry;
    } catch {
      return null;
    }
  });

  const entries = await Promise.all(entryPromises);
  return entries.filter((e): e is DLQEntry => e !== null);
}

/**
 * Get DLQ summary for monitoring dashboard.
 *
 * @param kv - KV namespace
 * @returns Summary of DLQ state
 */
export async function getDLQSummary(kv: KVNamespace): Promise<{
  count: number;
  recent: DLQEntry[];
  oldestAt: number | null;
  newestAt: number | null;
}> {
  const indexKey = getDLQIndexKey();
  const indexData = await kv.get(indexKey);

  if (!indexData) {
    return {
      count: 0,
      recent: [],
      oldestAt: null,
      newestAt: null,
    };
  }

  const entryIds = parseDLQIndex(indexData, 'summary');
  const count = entryIds.length;

  // Fetch recent entries (last 10)
  const recentIds = entryIds.slice(0, 10);
  const entryPromises = recentIds.map(async (id) => {
    const data = await kv.get(getDLQEntryKey(id));
    if (!data) return null;
    try {
      return JSON.parse(data) as DLQEntry;
    } catch {
      return null;
    }
  });

  const recent = (await Promise.all(entryPromises)).filter((e): e is DLQEntry => e !== null);

  // Calculate timestamps
  const timestamps = recent.map((e) => e.deadLetteredAt);
  const newestAt = timestamps.length > 0 ? Math.max(...timestamps) : null;
  const oldestAt = timestamps.length > 0 ? Math.min(...timestamps) : null;

  return {
    count,
    recent,
    oldestAt,
    newestAt,
  };
}

/**
 * Delete a DLQ entry (e.g., after manual replay or resolution).
 *
 * @param id - DLQ entry ID
 * @param kv - KV namespace
 * @returns true if deleted, false if not found
 */
export async function deleteDLQEntry(id: string, kv: KVNamespace): Promise<boolean> {
  const entryKey = getDLQEntryKey(id);
  const entry = await kv.get(entryKey);

  if (!entry) {
    return false;
  }

  // Delete the entry
  await kv.delete(entryKey);

  // Update the index
  const indexKey = getDLQIndexKey();
  const indexData = await kv.get(indexKey);

  if (indexData) {
    const entryIds = parseDLQIndex(indexData, 'delete');
    const updatedIds = entryIds.filter((entryId) => entryId !== id);
    await kv.put(indexKey, JSON.stringify(updatedIds), {
      expirationTtl: DLQ_ENTRY_TTL_SECONDS,
    });
  }

  dlqLogger.info('DLQ entry deleted', { id });
  return true;
}
