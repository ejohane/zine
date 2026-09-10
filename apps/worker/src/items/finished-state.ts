import { type JsonObject, UserItemState } from '@zine/shared';
import { and, eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import type { Database } from '../db';
import { userItemConsumptionEvents, userItems } from '../db/schema';
import { bookmarkEnrichmentIntent, dispatchBookmarkEnrichment } from '../enrichment/outbox';
import { syncPeopleForUserItemBestEffort } from '../people/service';
import type { Bindings } from '../types';

type FinishedStateChange = { type: 'set'; isFinished: boolean } | { type: 'toggle' };

/**
 * Change an owned item's finished state and record its consumption event.
 * Explicit sets retain an existing finished timestamp and only write on repeat when saving an unsaved item;
 * toggles always use a fresh timestamp. Callers choose eligible states and event
 * metadata, and translate a missing/ineligible item into their API's error shape.
 */
export async function changeItemFinishedState(
  ctx: { db: Database; userId: string; env: Bindings; requestId: string; traceId: string },
  input: {
    userItemId: string;
    change: FinishedStateChange;
    requiredState?: UserItemState;
    bookmarkOnFinish?: boolean;
    eventMetadata?: JsonObject;
  }
) {
  const { db, userId } = ctx;
  // Preserve the toggle operation's clock capture before its database lookup.
  const toggleTime = input.change.type === 'toggle' ? new Date().toISOString() : null;
  const toggleTimeMs = input.change.type === 'toggle' ? Date.now() : null;
  const item = await db.query.userItems.findFirst({
    where: and(
      eq(userItems.id, input.userItemId),
      eq(userItems.userId, userId),
      input.requiredState === undefined ? undefined : eq(userItems.state, input.requiredState)
    ),
  });
  if (!item) return null;

  const isFinished = input.change.type === 'toggle' ? !item.isFinished : input.change.isFinished;
  const finishedAt = isFinished
    ? (toggleTime ?? item.finishedAt ?? new Date().toISOString())
    : null;

  const shouldBookmark =
    input.bookmarkOnFinish && isFinished && item.state !== UserItemState.BOOKMARKED;
  const consumptionEvent = () =>
    db.insert(userItemConsumptionEvents).values({
      id: ulid(),
      userId,
      userItemId: item.id,
      itemId: item.itemId,
      eventType: isFinished ? 'FINISHED' : 'UNFINISHED',
      occurredAt: toggleTimeMs ?? Date.now(),
      positionSeconds: null,
      durationSeconds: null,
      deltaSeconds: null,
      source: 'MANUAL_FINISH_TOGGLE',
      metadata: input.eventMetadata ? JSON.stringify(input.eventMetadata) : null,
    });

  if (item.isFinished !== isFinished || shouldBookmark) {
    const updatedAt = toggleTime ?? new Date().toISOString();
    const update = db
      .update(userItems)
      .set({
        ...(shouldBookmark ? { state: UserItemState.BOOKMARKED, bookmarkedAt: updatedAt } : {}),
        isFinished,
        finishedAt,
        updatedAt,
      })
      .where(eq(userItems.id, input.userItemId));
    if (shouldBookmark) {
      // Saving through completion must persist the follow-up work with the save.
      // Include the event so a failed batch can safely be retried in full.
      await db.batch([
        update,
        bookmarkEnrichmentIntent(db, {
          userId,
          userItemId: item.id,
          itemId: item.itemId,
          trigger: item.state === UserItemState.INBOX ? 'inbox_bookmark' : 'manual_save',
        }),
        ...(item.isFinished !== isFinished ? [consumptionEvent()] : []),
      ]);
    } else {
      await update;
      await consumptionEvent();
    }
  }

  if (input.bookmarkOnFinish && isFinished) {
    // Repeated completion requests can recover existing intent without creating more work.
    await dispatchBookmarkEnrichment(ctx, { userId, userItemId: item.id });
  }
  if (shouldBookmark) {
    await syncPeopleForUserItemBestEffort(db, {
      userId,
      userItemId: item.id,
      operation: 'items.finishAndBookmark',
    });
  }

  return { id: item.id, itemId: item.itemId, isFinished, finishedAt };
}
