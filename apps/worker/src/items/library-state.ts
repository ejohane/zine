import { UserItemState } from '@zine/shared';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../db';
import { userItems } from '../db/schema';
import { enqueueBookmarkEnrichment } from '../enrichment/service';
import {
  deactivatePeopleForUserItemBestEffort,
  syncPeopleForUserItemBestEffort,
} from '../people/service';
import type { Bindings } from '../types';

/** Expected item-state failures; each API translates these into its own envelope. */
export class ItemStateError extends Error {
  readonly code: 'NOT_FOUND' | 'BAD_REQUEST';
  constructor(input: { code: 'NOT_FOUND' | 'BAD_REQUEST'; message: string }) {
    super(input.message);
    this.name = 'ItemStateError';
    this.code = input.code;
  }
}

type ItemStateContext = {
  db: Database;
  userId: string;
  env: Bindings;
  requestId: string;
  traceId: string;
};

// Preserve the distinct state rules and ordering of database and external writes.
// In particular, archive retains bookmarkedAt, while unbookmark clears it.
export async function bookmarkItem(ctx: ItemStateContext, input: { id: string }) {
  const now = new Date().toISOString();

  // Verify the item exists and belongs to the user
  const existing = await ctx.db
    .select({ id: userItems.id, itemId: userItems.itemId, state: userItems.state })
    .from(userItems)
    .where(and(eq(userItems.id, input.id), eq(userItems.userId, ctx.userId)))
    .limit(1);

  if (existing.length === 0) {
    throw new ItemStateError({
      code: 'NOT_FOUND',
      message: `Item ${input.id} not found`,
    });
  }

  // Update the item state
  await ctx.db
    .update(userItems)
    .set({
      state: UserItemState.BOOKMARKED,
      bookmarkedAt: now,
      updatedAt: now,
    })
    .where(eq(userItems.id, input.id));

  if (existing[0].state === UserItemState.INBOX) {
    await enqueueBookmarkEnrichment(ctx, {
      itemId: existing[0].itemId,
      userItemId: existing[0].id,
      trigger: 'inbox_bookmark',
    });
  }

  await syncPeopleForUserItemBestEffort(ctx.db, {
    userId: ctx.userId,
    userItemId: existing[0].id,
    operation: 'items.bookmark',
  });

  return { success: true as const };
}

export async function archiveItem(ctx: ItemStateContext, input: { id: string }) {
  const now = new Date().toISOString();

  // Verify the item exists and belongs to the user
  const existing = await ctx.db
    .select({ id: userItems.id })
    .from(userItems)
    .where(and(eq(userItems.id, input.id), eq(userItems.userId, ctx.userId)))
    .limit(1);

  if (existing.length === 0) {
    throw new ItemStateError({
      code: 'NOT_FOUND',
      message: `Item ${input.id} not found`,
    });
  }

  // Update the item state
  await ctx.db
    .update(userItems)
    .set({
      state: UserItemState.ARCHIVED,
      archivedAt: now,
      updatedAt: now,
    })
    .where(eq(userItems.id, input.id));

  await deactivatePeopleForUserItemBestEffort(ctx.db, {
    userId: ctx.userId,
    userItemId: input.id,
    operation: 'items.archive',
  });

  return { success: true as const };
}

export async function unbookmarkItem(ctx: ItemStateContext, input: { id: string }) {
  const now = new Date().toISOString();

  // Find the user item
  const existing = await ctx.db
    .select({ id: userItems.id, state: userItems.state })
    .from(userItems)
    .where(and(eq(userItems.id, input.id), eq(userItems.userId, ctx.userId)))
    .limit(1);

  if (existing.length === 0) {
    throw new ItemStateError({
      code: 'NOT_FOUND',
      message: 'Item not found',
    });
  }

  // Verify bookmarked state
  if (existing[0].state !== UserItemState.BOOKMARKED) {
    throw new ItemStateError({
      code: 'BAD_REQUEST',
      message: 'Item is not bookmarked',
    });
  }

  // Update to ARCHIVED state
  await ctx.db
    .update(userItems)
    .set({
      state: UserItemState.ARCHIVED,
      bookmarkedAt: null,
      archivedAt: now,
      updatedAt: now,
    })
    .where(eq(userItems.id, input.id));

  await deactivatePeopleForUserItemBestEffort(ctx.db, {
    userId: ctx.userId,
    userItemId: input.id,
    operation: 'items.unbookmark',
  });

  return { success: true as const };
}
