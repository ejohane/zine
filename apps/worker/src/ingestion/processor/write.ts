import { ulid } from 'ulid';
import { UserItemState } from '@zine/shared';
import type { BatchItem } from 'drizzle-orm/batch';

import type { Database } from '../../db';
import { items, providerItemsSeen, subscriptionItems, userItems } from '../../db/schema';
import { unixToIso } from '../../lib/timestamps';
import type { PreparedItem, WriteContext } from './types';

// Write Helpers

/**
 * Build the ingestion statements for a prepared item.
 */
export function buildIngestionStatements(
  prepared: PreparedItem,
  context: WriteContext
): BatchItem<'sqlite'>[] {
  const { db, userId, subscriptionId, provider, nowISO, now } = context;
  const statements: BatchItem<'sqlite'>[] = [];

  if (!prepared.canonicalItemExists) {
    const publishedAtISO = prepared.newItem.publishedAt
      ? unixToIso(prepared.newItem.publishedAt)
      : null;

    statements.push(
      db
        .insert(items)
        .values({
          id: prepared.newItem.id,
          contentType: prepared.newItem.contentType,
          provider,
          providerId: prepared.newItem.providerId,
          canonicalUrl: prepared.newItem.canonicalUrl,
          title: prepared.newItem.title,
          summary: prepared.newItem.description,
          creatorId: prepared.creatorId,
          thumbnailUrl: prepared.newItem.imageUrl,
          duration: prepared.newItem.durationSeconds,
          publishedAt: publishedAtISO,
          createdAt: nowISO,
          updatedAt: nowISO,
        })
        .onConflictDoNothing()
    );
  }

  statements.push(
    db
      .insert(userItems)
      .values({
        id: prepared.userItemId,
        userId,
        itemId: prepared.canonicalItemId,
        state: UserItemState.INBOX,
        ingestedAt: nowISO,
        createdAt: nowISO,
        updatedAt: nowISO,
      })
      .onConflictDoNothing()
  );

  statements.push(
    db
      .insert(subscriptionItems)
      .values({
        id: ulid(),
        subscriptionId,
        itemId: prepared.canonicalItemId,
        providerItemId: prepared.newItem.providerId,
        publishedAt: prepared.newItem.publishedAt,
        fetchedAt: now,
      })
      .onConflictDoNothing()
  );

  statements.push(
    db
      .insert(providerItemsSeen)
      .values({
        id: ulid(),
        userId,
        provider,
        providerItemId: prepared.newItem.providerId,
        sourceId: null,
        firstSeenAt: nowISO,
      })
      .onConflictDoNothing()
  );

  return statements;
}

/**
 * Execute a batch of statements.
 */
export async function executeBatchStatements(
  statements: BatchItem<'sqlite'>[],
  db: Database
): Promise<void> {
  await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
}
