/**
 * useMutations Hook for Zine Mobile
 *
 * Provides bound mutation functions for common operations:
 * - bookmarkItem(userItemId)
 * - archiveItem(userItemId)
 * - addSource(source)
 * - removeSource(sourceId)
 * - updateUserItemState(userItemId, state)
 *
 * @module hooks/useMutations
 */

import { useCallback, useMemo } from 'react';
import {
  type Source,
  type UserItemState,
  type BookmarkItemArgs,
  type ArchiveItemArgs,
  type AddSourceArgs,
  type RemoveSourceArgs,
  type UpdateUserItemStateArgs,
} from '@zine/shared';
import { useReplicache } from './useReplicache';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of a mutation operation
 */
export interface MutationResult {
  /** Whether the mutation succeeded */
  success: boolean;
  /** Error message if the mutation failed */
  error?: string;
}

/**
 * Mutations context value
 */
export interface MutationsContextValue {
  /** Whether mutations are available (Replicache is ready) */
  isReady: boolean;

  /**
   * Bookmark a user item (move from INBOX to BOOKMARKED)
   * @param userItemId - The user item ID to bookmark
   */
  bookmarkItem: (userItemId: string) => Promise<MutationResult>;

  /**
   * Archive a user item
   * @param userItemId - The user item ID to archive
   */
  archiveItem: (userItemId: string) => Promise<MutationResult>;

  /**
   * Add a new source subscription
   * @param source - Source data (excluding createdAt)
   */
  addSource: (source: Omit<Source, 'createdAt'>) => Promise<MutationResult>;

  /**
   * Remove a source subscription
   * @param sourceId - The source ID to remove
   */
  removeSource: (sourceId: string) => Promise<MutationResult>;

  /**
   * Update a user item's state directly
   * @param userItemId - The user item ID
   * @param state - The new state
   */
  updateUserItemState: (userItemId: string, state: UserItemState) => Promise<MutationResult>;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook to access Replicache mutations with error handling
 *
 * Provides bound functions for common data mutations with:
 * - Automatic error handling
 * - Loading state awareness
 * - Type-safe arguments
 *
 * @returns Mutations object with bound functions
 *
 * @example
 * ```tsx
 * import { useMutations } from '@/hooks/useMutations';
 *
 * function ItemActions({ userItemId }: { userItemId: string }) {
 *   const { bookmarkItem, archiveItem, isReady } = useMutations();
 *
 *   const handleBookmark = async () => {
 *     const result = await bookmarkItem(userItemId);
 *     if (!result.success) {
 *       console.error('Failed to bookmark:', result.error);
 *     }
 *   };
 *
 *   return (
 *     <View>
 *       <Button
 *         onPress={handleBookmark}
 *         disabled={!isReady}
 *       >
 *         Bookmark
 *       </Button>
 *       <Button
 *         onPress={() => archiveItem(userItemId)}
 *         disabled={!isReady}
 *       >
 *         Archive
 *       </Button>
 *     </View>
 *   );
 * }
 * ```
 */
export function useMutations(): MutationsContextValue {
  const { rep, isReady } = useReplicache();

  // Helper to wrap mutations with error handling
  const wrapMutation = useCallback(
    async <T>(mutationFn: () => Promise<T>, operationName: string): Promise<MutationResult> => {
      if (!rep) {
        return {
          success: false,
          error: 'Replicache not initialized',
        };
      }

      try {
        await mutationFn();
        return { success: true };
      } catch (error) {
        console.error(`Mutation ${operationName} failed:`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : `${operationName} failed`,
        };
      }
    },
    [rep]
  );

  // Bookmark item mutation
  const bookmarkItem = useCallback(
    async (userItemId: string): Promise<MutationResult> => {
      return wrapMutation(
        () => rep!.mutate.bookmarkItem({ userItemId } as BookmarkItemArgs),
        'bookmarkItem'
      );
    },
    [rep, wrapMutation]
  );

  // Archive item mutation
  const archiveItem = useCallback(
    async (userItemId: string): Promise<MutationResult> => {
      return wrapMutation(
        () => rep!.mutate.archiveItem({ userItemId } as ArchiveItemArgs),
        'archiveItem'
      );
    },
    [rep, wrapMutation]
  );

  // Add source mutation
  const addSource = useCallback(
    async (source: Omit<Source, 'createdAt'>): Promise<MutationResult> => {
      return wrapMutation(() => rep!.mutate.addSource({ source } as AddSourceArgs), 'addSource');
    },
    [rep, wrapMutation]
  );

  // Remove source mutation
  const removeSource = useCallback(
    async (sourceId: string): Promise<MutationResult> => {
      return wrapMutation(
        () => rep!.mutate.removeSource({ sourceId } as RemoveSourceArgs),
        'removeSource'
      );
    },
    [rep, wrapMutation]
  );

  // Update user item state mutation
  const updateUserItemState = useCallback(
    async (userItemId: string, state: UserItemState): Promise<MutationResult> => {
      return wrapMutation(
        () =>
          rep!.mutate.updateUserItemState({
            userItemId,
            state,
          } as UpdateUserItemStateArgs),
        'updateUserItemState'
      );
    },
    [rep, wrapMutation]
  );

  // Memoize the return object
  return useMemo(
    () => ({
      isReady,
      bookmarkItem,
      archiveItem,
      addSource,
      removeSource,
      updateUserItemState,
    }),
    [isReady, bookmarkItem, archiveItem, addSource, removeSource, updateUserItemState]
  );
}

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Hook to get just the bookmark mutation
 *
 * @example
 * ```tsx
 * const bookmark = useBookmarkItem();
 * await bookmark('user-item-123');
 * ```
 */
export function useBookmarkItem(): (userItemId: string) => Promise<MutationResult> {
  const { bookmarkItem } = useMutations();
  return bookmarkItem;
}

/**
 * Hook to get just the archive mutation
 */
export function useArchiveItem(): (userItemId: string) => Promise<MutationResult> {
  const { archiveItem } = useMutations();
  return archiveItem;
}

/**
 * Hook to get just the add source mutation
 */
export function useAddSource(): (source: Omit<Source, 'createdAt'>) => Promise<MutationResult> {
  const { addSource } = useMutations();
  return addSource;
}

/**
 * Hook to get just the remove source mutation
 */
export function useRemoveSource(): (sourceId: string) => Promise<MutationResult> {
  const { removeSource } = useMutations();
  return removeSource;
}
