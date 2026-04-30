import { and, eq } from 'drizzle-orm';

import { creators, items, userItems } from '../db/schema';
import { logger } from '../lib/logger';
import type { TRPCContext } from '../trpc/context';
import {
  ENRICHMENT_SCHEMA_VERSION,
  type EnrichmentQueueMessage,
  type EnrichmentTrigger,
} from './types';

const enrichmentLogger = logger.child('enrichment-service');

type EnrichmentQueue = Queue<EnrichmentQueueMessage>;

function stableHash(value: string): string {
  let hash = 0x811c9dc5;

  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function computeItemContentHash(input: {
  title: string;
  canonicalUrl: string;
  contentType: string;
  provider: string;
  publisher: string | null;
  summary: string | null;
  creatorName: string | null;
  articleContentKey: string | null;
}): string {
  return stableHash(
    JSON.stringify({
      title: input.title,
      canonicalUrl: input.canonicalUrl,
      contentType: input.contentType,
      provider: input.provider,
      publisher: input.publisher,
      summary: input.summary,
      creatorName: input.creatorName,
      articleContentKey: input.articleContentKey,
    })
  );
}

export async function getItemContentHash(
  db: TRPCContext['db'],
  itemId: string
): Promise<string | null> {
  const rows = await db
    .select({
      title: items.title,
      canonicalUrl: items.canonicalUrl,
      contentType: items.contentType,
      provider: items.provider,
      publisher: items.publisher,
      summary: items.summary,
      articleContentKey: items.articleContentKey,
      creatorName: creators.name,
    })
    .from(items)
    .leftJoin(creators, eq(items.creatorId, creators.id))
    .where(eq(items.id, itemId))
    .limit(1);

  if (rows.length === 0) {
    return null;
  }

  return computeItemContentHash(rows[0]);
}

export async function enqueueBookmarkEnrichment(
  ctx: Omit<Pick<TRPCContext, 'db' | 'env' | 'userId' | 'requestId' | 'traceId'>, 'userId'> & {
    userId: string;
  },
  input: {
    itemId: string;
    userItemId: string;
    trigger: EnrichmentTrigger;
  }
): Promise<void> {
  const queue = ctx.env.ENRICHMENT_QUEUE as EnrichmentQueue | undefined;
  if (!queue) {
    enrichmentLogger.debug('Enrichment queue not configured; skipping enqueue', {
      itemId: input.itemId,
      userItemId: input.userItemId,
      trigger: input.trigger,
    });
    return;
  }

  const ownedUserItem = await ctx.db
    .select({ id: userItems.id })
    .from(userItems)
    .where(and(eq(userItems.id, input.userItemId), eq(userItems.userId, ctx.userId)))
    .limit(1);

  if (ownedUserItem.length === 0) {
    enrichmentLogger.warn('Skipping enrichment enqueue for non-owned user item', {
      itemId: input.itemId,
      userItemId: input.userItemId,
      userId: ctx.userId,
    });
    return;
  }

  const contentHash = await getItemContentHash(ctx.db, input.itemId);
  if (!contentHash) {
    enrichmentLogger.warn('Skipping enrichment enqueue for missing item', {
      itemId: input.itemId,
      userItemId: input.userItemId,
    });
    return;
  }

  const message: EnrichmentQueueMessage = {
    itemId: input.itemId,
    userItemId: input.userItemId,
    userId: ctx.userId,
    trigger: input.trigger,
    schemaVersion: ENRICHMENT_SCHEMA_VERSION,
    contentHash,
    enqueuedAt: Date.now(),
  };

  await queue.send(message);

  enrichmentLogger.info('Bookmark enrichment queued', {
    itemId: input.itemId,
    userItemId: input.userItemId,
    trigger: input.trigger,
    requestId: ctx.requestId,
    traceId: ctx.traceId,
  });
}
