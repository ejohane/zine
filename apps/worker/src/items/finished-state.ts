import { type JsonObject, type UserItemState } from '@zine/shared';
import { and, eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import type { Database } from '../db';
import { userItemConsumptionEvents, userItems } from '../db/schema';

type FinishedStateChange = { type: 'set'; isFinished: boolean } | { type: 'toggle' };

/**
 * Change an owned item's finished state and record its consumption event.
 * Explicit sets retain an existing finished timestamp and do not write on repeat;
 * toggles always use a fresh timestamp. Callers choose eligible states and event
 * metadata, and translate a missing/ineligible item into their API's error shape.
 */
export async function changeItemFinishedState(
  db: Database,
  input: {
    userId: string;
    userItemId: string;
    change: FinishedStateChange;
    requiredState?: UserItemState;
    eventMetadata?: JsonObject;
  }
) {
  // Preserve the toggle operation's clock capture before its database lookup.
  const toggleTime = input.change.type === 'toggle' ? new Date().toISOString() : null;
  const toggleTimeMs = input.change.type === 'toggle' ? Date.now() : null;
  const item = await db.query.userItems.findFirst({
    where: and(
      eq(userItems.id, input.userItemId),
      eq(userItems.userId, input.userId),
      input.requiredState === undefined ? undefined : eq(userItems.state, input.requiredState)
    ),
  });
  if (!item) return null;

  const isFinished = input.change.type === 'toggle' ? !item.isFinished : input.change.isFinished;
  const finishedAt = isFinished
    ? (toggleTime ?? item.finishedAt ?? new Date().toISOString())
    : null;

  if (item.isFinished !== isFinished) {
    const occurredAt = toggleTimeMs ?? Date.now();
    await db
      .update(userItems)
      .set({ isFinished, finishedAt, updatedAt: toggleTime ?? new Date(occurredAt).toISOString() })
      .where(eq(userItems.id, input.userItemId));

    // Keep the existing sequential writes; transaction/retry changes are separate.
    await db.insert(userItemConsumptionEvents).values({
      id: ulid(),
      userId: input.userId,
      userItemId: item.id,
      itemId: item.itemId,
      eventType: isFinished ? 'FINISHED' : 'UNFINISHED',
      occurredAt,
      positionSeconds: null,
      durationSeconds: null,
      deltaSeconds: null,
      source: 'MANUAL_FINISH_TOGGLE',
      metadata: input.eventMetadata ? JSON.stringify(input.eventMetadata) : null,
    });
  }

  return { id: item.id, itemId: item.itemId, isFinished, finishedAt };
}
