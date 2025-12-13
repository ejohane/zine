/**
 * Replicache Mutators for Zine
 *
 * Shared mutator definitions used by both client and server.
 * These mutators are typed against Replicache's WriteTransaction.
 */

import type { ReadonlyJSONValue, WriteTransaction } from 'replicache';
import type { Source, UserItem } from '../types/domain';
import { UserItemState } from '../types/domain';
import { userItemKey, sourceKey } from '../constants/keys';

/**
 * Helper to cast domain objects to Replicache's JSONValue type
 * This is safe because our domain types are all JSON-serializable
 */
function toJSONValue<T extends object>(obj: T): ReadonlyJSONValue {
  return obj as unknown as ReadonlyJSONValue;
}

// ============================================================================
// Mutator Arguments
// ============================================================================

export interface BookmarkItemArgs {
  userItemId: string;
}

export interface ArchiveItemArgs {
  userItemId: string;
}

export interface AddSourceArgs {
  source: Omit<Source, 'createdAt'>;
}

export interface RemoveSourceArgs {
  sourceId: string;
}

export interface UpdateUserItemStateArgs {
  userItemId: string;
  state: UserItemState;
}

// ============================================================================
// Mutator Definitions
// ============================================================================

/**
 * Mutators object for use with Replicache
 *
 * @example
 * const rep = new Replicache({
 *   mutators,
 *   // ... other options
 * });
 *
 * // Then call mutations:
 * await rep.mutate.bookmarkItem({ userItemId: 'abc' });
 */
export const mutators = {
  /**
   * Bookmark a user item
   * Moves the item from INBOX to BOOKMARKED state
   */
  async bookmarkItem(
    tx: WriteTransaction,
    args: BookmarkItemArgs
  ): Promise<void> {
    const key = userItemKey(args.userItemId);
    const existing = (await tx.get(key)) as UserItem | undefined;

    if (!existing) {
      console.warn(`bookmarkItem: UserItem ${args.userItemId} not found`);
      return;
    }

    const updated: UserItem = {
      ...existing,
      state: UserItemState.BOOKMARKED,
      bookmarkedAt: new Date().toISOString(),
    };

    await tx.set(key, toJSONValue(updated));
  },

  /**
   * Archive a user item
   * Moves the item to ARCHIVED state
   */
  async archiveItem(
    tx: WriteTransaction,
    args: ArchiveItemArgs
  ): Promise<void> {
    const key = userItemKey(args.userItemId);
    const existing = (await tx.get(key)) as UserItem | undefined;

    if (!existing) {
      console.warn(`archiveItem: UserItem ${args.userItemId} not found`);
      return;
    }

    const updated: UserItem = {
      ...existing,
      state: UserItemState.ARCHIVED,
      archivedAt: new Date().toISOString(),
    };

    await tx.set(key, toJSONValue(updated));
  },

  /**
   * Add a new source subscription
   */
  async addSource(tx: WriteTransaction, args: AddSourceArgs): Promise<void> {
    const source: Source = {
      ...args.source,
      createdAt: new Date().toISOString(),
    };

    const key = sourceKey(source.id);
    await tx.set(key, toJSONValue(source));
  },

  /**
   * Remove a source subscription
   */
  async removeSource(
    tx: WriteTransaction,
    args: RemoveSourceArgs
  ): Promise<void> {
    const key = sourceKey(args.sourceId);
    const exists = await tx.has(key);

    if (!exists) {
      console.warn(`removeSource: Source ${args.sourceId} not found`);
      return;
    }

    await tx.del(key);
  },

  /**
   * Update a user item's state directly
   * More flexible than bookmark/archive for complex workflows
   */
  async updateUserItemState(
    tx: WriteTransaction,
    args: UpdateUserItemStateArgs
  ): Promise<void> {
    const key = userItemKey(args.userItemId);
    const existing = (await tx.get(key)) as UserItem | undefined;

    if (!existing) {
      console.warn(
        `updateUserItemState: UserItem ${args.userItemId} not found`
      );
      return;
    }

    const now = new Date().toISOString();
    const updated: UserItem = {
      ...existing,
      state: args.state,
    };

    // Update state-specific timestamps
    if (args.state === UserItemState.BOOKMARKED && !existing.bookmarkedAt) {
      updated.bookmarkedAt = now;
    } else if (args.state === UserItemState.ARCHIVED && !existing.archivedAt) {
      updated.archivedAt = now;
    }

    await tx.set(key, toJSONValue(updated));
  },
};

/**
 * Type for the mutators object
 * Useful for typing the Replicache instance
 */
export type Mutators = typeof mutators;
