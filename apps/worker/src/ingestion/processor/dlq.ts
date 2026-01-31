import { ulid } from 'ulid';
import type { Provider } from '@zine/shared';

import type { Database } from '../../db';
import { deadLetterQueue } from '../../db/schema';
import { serializeError } from '../../utils/error-utils';
import { classifyError } from './errors';

// ============================================================================
// Dead-letter Queue
// ============================================================================

/**
 * Store a failed item in the dead-letter queue.
 */
export async function storeToDLQ(
  db: Database,
  subscriptionId: string,
  userId: string,
  provider: Provider,
  providerId: string,
  rawItem: unknown,
  error: unknown
): Promise<void> {
  try {
    const serialized = serializeError(error);
    const errorMessage = `[${serialized.type}] ${serialized.message}`;

    await db.insert(deadLetterQueue).values({
      id: ulid(),
      subscriptionId,
      userId,
      provider,
      providerId,
      rawData: JSON.stringify(rawItem),
      errorMessage,
      errorType: classifyError(error),
      errorStack: serialized.stack,
      createdAt: Date.now(),
    });
  } catch (dlqError) {
    // Best-effort - log but don't fail
    console.error('Failed to store item in dead-letter queue:', {
      error: serializeError(dlqError),
      providerId,
    });
  }
}
