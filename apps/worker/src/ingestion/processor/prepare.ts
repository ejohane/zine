import { ulid } from 'ulid';

import { and, eq } from 'drizzle-orm';
import type { Provider } from '@zine/shared';

import { items, providerItemsSeen } from '../../db/schema';
import type { NewItem } from '../transformers';
import { validateCanonicalItem } from '../validation';
import { serializeError } from '../../utils/error-utils';
import { backfillCreatorIdIfMissing, getOrCreateCreator } from './creators';
import { storeToDLQ } from './dlq';
import type { IngestContext, PreparedItem, PreparedResult } from './types';

// ============================================================================
// Preparation Helpers
// ============================================================================

interface PrepareItemParams<T> {
  context: IngestContext;
  rawItem: T;
  transformFn: (raw: T) => NewItem;
  providerId?: string;
  backfillOnSeen?: boolean;
}

/**
 * Prepare a single item for ingestion.
 */
export async function prepareItem<T>({
  context,
  rawItem,
  transformFn,
  providerId,
  backfillOnSeen = false,
}: PrepareItemParams<T>): Promise<PreparedResult> {
  const { userId, provider, db } = context;

  // 1. Transform raw provider data to our item format
  const newItem = transformFn(rawItem);

  // 2. Validate transformed item before any DB operations
  validateCanonicalItem(newItem, rawItem);

  // 3. Check idempotency (has this user already seen this item?)
  const seen = await db
    .select()
    .from(providerItemsSeen)
    .where(
      and(
        eq(providerItemsSeen.userId, userId),
        eq(providerItemsSeen.provider, provider),
        eq(providerItemsSeen.providerItemId, newItem.providerId)
      )
    )
    .limit(1);

  if (seen.length > 0) {
    if (backfillOnSeen) {
      await backfillCreatorIdIfMissing(db, provider, rawItem, newItem);
    }
    return { status: 'skipped', reason: 'already_seen' };
  }

  // 4. Extract or create creator from raw item metadata
  const creatorId = await getOrCreateCreator(db, provider, rawItem, newItem);

  // 5. Check canonical item existence
  const existingCanonical = await db
    .select({ id: items.id, creatorId: items.creatorId })
    .from(items)
    .where(and(eq(items.provider, provider), eq(items.providerId, newItem.providerId)))
    .limit(1);

  // Backfill creatorId if the existing item doesn't have one but we have one now
  if (existingCanonical.length > 0 && !existingCanonical[0].creatorId && creatorId) {
    await db
      .update(items)
      .set({ creatorId, updatedAt: new Date().toISOString() })
      .where(eq(items.id, existingCanonical[0].id));
  }

  return {
    status: 'prepared',
    item: {
      newItem,
      rawItem,
      providerId: providerId ?? newItem.providerId,
      canonicalItemId: existingCanonical.length > 0 ? existingCanonical[0].id : newItem.id,
      canonicalItemExists: existingCanonical.length > 0,
      userItemId: ulid(),
      creatorId,
    },
  };
}

interface PrepareBatchParams<T> {
  userId: string;
  subscriptionId: string;
  rawItems: T[];
  provider: Provider;
  db: IngestContext['db'];
  transformFn: (raw: T) => NewItem;
  getProviderId: (raw: T) => string;
}

interface PrepareBatchResult {
  preparedItems: PreparedItem[];
  skippedCount: number;
  errors: number;
  errorDetails: Array<{ providerId: string; error: string }>;
}

/**
 * Prepare a batch of items for consolidated ingestion.
 */
export async function prepareBatch<T>({
  userId,
  subscriptionId,
  rawItems,
  provider,
  db,
  transformFn,
  getProviderId,
}: PrepareBatchParams<T>): Promise<PrepareBatchResult> {
  const preparedItems: PrepareBatchResult['preparedItems'] = [];
  let skippedCount = 0;
  let errors = 0;
  const errorDetails: PrepareBatchResult['errorDetails'] = [];

  const context: IngestContext = { userId, provider, db };

  for (const rawItem of rawItems) {
    const providerId = getProviderId(rawItem);

    try {
      const result = await prepareItem({
        context,
        rawItem,
        transformFn,
        providerId,
        backfillOnSeen: false,
      });

      if (result.status === 'skipped') {
        skippedCount++;
        continue;
      }

      preparedItems.push(result.item);
    } catch (error) {
      errors++;
      const serialized = serializeError(error);
      const errorMessage = `[${serialized.type}] ${serialized.message}`;
      errorDetails.push({ providerId, error: errorMessage });

      await storeToDLQ(db, subscriptionId, userId, provider, providerId, rawItem, error);
    }
  }

  return {
    preparedItems,
    skippedCount,
    errors,
    errorDetails,
  };
}
