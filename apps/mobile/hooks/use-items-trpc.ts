/**
 * tRPC-based data hooks for Items
 *
 * Provides React Query hooks for fetching and mutating items data via tRPC.
 * This replaces the Replicache-based hooks in use-items.ts.
 */

import { keepPreviousData } from '@tanstack/react-query';
import { useRef } from 'react';
import { trpc } from '@/lib/trpc';
import { ContentType, Provider, UserItemState } from '@zine/shared';

// ============================================================================
// Types
// ============================================================================

/**
 * UI-friendly content type (lowercase for styling/display)
 */
export type UIContentType = 'video' | 'podcast' | 'article' | 'post';

/**
 * UI-friendly provider type (lowercase for styling/display)
 */
export type UIProvider = 'youtube' | 'spotify' | 'gmail' | 'rss' | 'substack' | 'web' | 'x';

// ============================================================================
// Optimistic Update Types
// ============================================================================

/** Type alias for tRPC utils */
type TrpcUtils = ReturnType<typeof trpc.useUtils>;

/** Inbox/Library query data type */
type ListQueryData = ReturnType<TrpcUtils['items']['inbox']['getData']>;

/** Single item query data type */
type ItemQueryData = ReturnType<TrpcUtils['items']['get']['getData']>;

/** Extract item type from list query */
type ListItem = NonNullable<ListQueryData>['items'][number];

/** Context type for optimistic mutation rollback */
type OptimisticContext = {
  previousInbox?: ListQueryData;
  previousLibrary?: ListQueryData;
  previousItem?: ItemQueryData;
};

// ============================================================================
// Optimistic Update Factory
// ============================================================================

/**
 * Factory function to create optimistic mutation config
 *
 * Reduces boilerplate for mutations that need:
 * - Cancel queries before mutation
 * - Snapshot previous data for rollback
 * - Optimistically update cache
 * - Rollback on error
 * - Invalidate queries on completion
 *
 * @param utils - tRPC utils from useUtils()
 * @param options - Configuration for the optimistic update
 * @returns Mutation config object with onMutate, onError, and onSettled handlers
 *
 * @example
 * const bookmarkMutation = trpc.items.bookmark.useMutation(
 *   createOptimisticConfig(utils, {
 *     updateInbox: (items, input) => items.filter(item => item.id !== input.id),
 *     updateSingleItem: (item) => ({
 *       ...item,
 *       state: UserItemState.BOOKMARKED,
 *       bookmarkedAt: new Date().toISOString(),
 *     }),
 *   })
 * );
 */
function createOptimisticConfig<TInput extends { id: string }>(
  utils: TrpcUtils,
  options: {
    /** Transform inbox items (return filtered/mapped items) */
    updateInbox?: (items: ListItem[], input: TInput) => ListItem[];
    /** Transform library items (return filtered/mapped items) */
    updateLibrary?: (items: ListItem[], input: TInput) => ListItem[];
    /** Transform single item cache */
    updateSingleItem?: (
      item: NonNullable<ItemQueryData>,
      input: TInput
    ) => NonNullable<ItemQueryData>;
  }
) {
  return {
    onMutate: async (input: TInput): Promise<OptimisticContext> => {
      // Cancel outgoing queries to prevent race conditions
      const cancellations: Promise<void>[] = [utils.items.home.cancel()];
      if (options.updateInbox) cancellations.push(utils.items.inbox.cancel());
      if (options.updateLibrary) cancellations.push(utils.items.library.cancel());
      if (options.updateSingleItem) cancellations.push(utils.items.get.cancel({ id: input.id }));
      await Promise.all(cancellations);

      // Snapshot previous values for rollback
      const context: OptimisticContext = {};

      if (options.updateInbox) {
        context.previousInbox = utils.items.inbox.getData();
        utils.items.inbox.setData(undefined, (old) => {
          if (!old) return old;
          return {
            ...old,
            items: options.updateInbox!(old.items, input),
          };
        });
      }

      if (options.updateLibrary) {
        context.previousLibrary = utils.items.library.getData();
        utils.items.library.setData(undefined, (old) => {
          if (!old) return old;
          return {
            ...old,
            items: options.updateLibrary!(old.items, input),
          };
        });
      }

      if (options.updateSingleItem) {
        context.previousItem = utils.items.get.getData({ id: input.id });
        utils.items.get.setData({ id: input.id }, (old) => {
          if (!old) return old;
          return options.updateSingleItem!(old, input);
        });
      }

      return context;
    },
    onError: (_err: unknown, vars: TInput, context: OptimisticContext | undefined) => {
      // Rollback on error
      if (context?.previousInbox) {
        utils.items.inbox.setData(undefined, context.previousInbox);
      }
      if (context?.previousLibrary) {
        utils.items.library.setData(undefined, context.previousLibrary);
      }
      if (context?.previousItem) {
        utils.items.get.setData({ id: vars.id }, context.previousItem);
      }
    },
    onSettled: (_data: unknown, _err: unknown, vars: TInput) => {
      // Refetch after mutation completes (success or error)
      utils.items.inbox.invalidate();
      utils.items.library.invalidate();
      utils.items.home.invalidate();
      if (options.updateSingleItem) {
        utils.items.get.invalidate({ id: vars.id });
      }
    },
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Map ContentType enum to UI-friendly lowercase string
 *
 * @param contentType - The ContentType enum value
 * @returns Lowercase string for UI display
 *
 * @example
 * mapContentType(ContentType.VIDEO) // => 'video'
 * mapContentType(ContentType.PODCAST) // => 'podcast'
 */
export function mapContentType(contentType: ContentType): UIContentType {
  return contentType.toLowerCase() as UIContentType;
}

/**
 * Map Provider enum to UI-friendly lowercase string
 *
 * @param provider - The Provider enum value
 * @returns Lowercase string for UI display
 *
 * @example
 * mapProvider(Provider.YOUTUBE) // => 'youtube'
 * mapProvider(Provider.SPOTIFY) // => 'spotify'
 */
export function mapProvider(provider: Provider): UIProvider {
  return provider.toLowerCase() as UIProvider;
}

/**
 * Format duration in seconds to human-readable string
 *
 * @param seconds - Duration in seconds (optional)
 * @returns Formatted duration string (H:MM:SS or M:SS) or undefined
 *
 * @example
 * formatDuration(3661) // => '1:01:01'
 * formatDuration(125) // => '2:05'
 * formatDuration(45) // => '0:45'
 * formatDuration(undefined) // => undefined
 */
export function formatDuration(seconds?: number | null): string | undefined {
  if (seconds === undefined || seconds === null) return undefined;

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Hook for fetching inbox items (INBOX state)
 *
 * Returns items that are in the triage queue - new items awaiting user action.
 * Supports filtering by provider and content type.
 *
 * @param options - Optional filter and pagination options
 * @returns tRPC query result with items array and pagination cursor
 *
 * @example
 * function InboxScreen() {
 *   const { data, isLoading, error } = useInboxItems();
 *
 *   if (isLoading) return <LoadingSpinner />;
 *   if (error) return <ErrorMessage error={error} />;
 *
 *   return data?.items.map((item) => (
 *     <ItemCard key={item.id} item={item} />
 *   ));
 * }
 */
export function useInboxItems(options?: {
  filter?: {
    provider?: Provider;
    contentType?: ContentType;
  };
  limit?: number;
}) {
  return trpc.items.inbox.useQuery(options, {
    placeholderData: keepPreviousData,
  });
}

/**
 * Hook for fetching library/bookmarked items (BOOKMARKED state)
 *
 * Returns items that have been saved for later consumption.
 * Supports filtering by provider, content type, and completion status.
 * Supports optional search by item title or creator.
 *
 * @param options - Optional filter and pagination options
 * @param options.filter.provider - Filter by content provider (YOUTUBE, SPOTIFY, etc.)
 * @param options.filter.contentType - Filter by content type (VIDEO, PODCAST, ARTICLE, POST)
 * @param options.filter.isFinished - Filter by completion status
 *   - undefined/false: show only unfinished items (default)
 *   - true: show only finished items
 * @param options.search - Optional search query (title/creator)
 * @param options.limit - Maximum number of items to return
 * @returns tRPC query result with items array and pagination cursor
 *
 * @example
 * function LibraryScreen() {
 *   const { data, isLoading } = useLibraryItems({
 *     filter: { contentType: 'VIDEO' }
 *   });
 *
 *   return data?.items.map((item) => (
 *     <ItemCard key={item.id} item={item} />
 *   ));
 * }
 *
 * @example
 * // Show only finished items
 * function FinishedScreen() {
 *   const { data } = useLibraryItems({
 *     filter: { isFinished: true }
 *   });
 *   // ...
 * }
 */
export function useLibraryItems(options?: {
  filter?: {
    provider?: Provider;
    contentType?: ContentType;
    isFinished?: boolean;
  };
  search?: string;
  limit?: number;
}) {
  const filter = options?.filter
    ? {
        ...(options.filter.provider !== undefined ? { provider: options.filter.provider } : {}),
        ...(options.filter.contentType !== undefined
          ? { contentType: options.filter.contentType }
          : {}),
        ...(options.filter.isFinished ? { isFinished: true } : {}),
      }
    : undefined;

  const search = options?.search?.trim();
  const input = options
    ? {
        ...(options.limit !== undefined ? { limit: options.limit } : {}),
        ...(filter && Object.keys(filter).length > 0 ? { filter } : {}),
        ...(search ? { search } : {}),
      }
    : undefined;

  return trpc.items.library.useQuery(input, {
    placeholderData: keepPreviousData,
  });
}

/**
 * Hook for fetching home screen data
 *
 * Returns curated sections for the home screen:
 * - recentBookmarks: Latest bookmarked items
 * - jumpBackIn: Recently opened bookmarks
 * - byContentType: Items grouped by video/podcast/article
 *
 * @returns tRPC query result with home data sections
 *
 * @example
 * function HomeScreen() {
 *   const { data, isLoading } = useHomeData();
 *
 *   return (
 *     <>
 *       <Section title="Recent Bookmarks" items={data?.recentBookmarks} />
 *       <Section title="Jump Back In" items={data?.jumpBackIn} />
 *       <Section title="Videos" items={data?.byContentType.videos} />
 *     </>
 *   );
 * }
 */
export function useHomeData() {
  return trpc.items.home.useQuery(undefined, {
    placeholderData: keepPreviousData,
  });
}

/**
 * Hook for fetching a single item by ID
 *
 * @param id - The UserItem ID to fetch
 * @returns tRPC query result with the item data
 *
 * @example
 * function ItemDetailScreen({ id }: { id: string }) {
 *   const { data: item, isLoading, error } = useItem(id);
 *
 *   if (isLoading) return <LoadingSpinner />;
 *   if (error) return <ErrorMessage error={error} />;
 *
 *   return <ItemDetail item={item} />;
 * }
 */
export function useItem(id: string) {
  return trpc.items.get.useQuery({ id }, { enabled: !!id });
}

/**
 * Hook for fetching the current user's tags.
 */
export function useUserTags() {
  return trpc.items.listTags.useQuery();
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Hook for bookmarking an item with optimistic updates
 *
 * Moves an item from INBOX to BOOKMARKED state.
 * Optimistically removes the item from inbox immediately for instant UI feedback,
 * then invalidates both inbox and library queries on completion.
 *
 * @returns tRPC mutation with mutate/mutateAsync functions
 *
 * @example
 * function ItemCard({ item }) {
 *   const bookmark = useBookmarkItem();
 *
 *   return (
 *     <Button onPress={() => bookmark.mutate({ id: item.id })} disabled={bookmark.isPending}>
 *       Bookmark
 *     </Button>
 *   );
 * }
 */
export function useBookmarkItem() {
  const utils = trpc.useUtils();

  return trpc.items.bookmark.useMutation(
    createOptimisticConfig(utils, {
      updateInbox: (items, { id }) => items.filter((item) => item.id !== id),
      updateSingleItem: (item) => ({
        ...item,
        state: UserItemState.BOOKMARKED,
        bookmarkedAt: new Date().toISOString(),
      }),
    })
  );
}

/**
 * Hook for archiving an item with optimistic updates
 *
 * Moves an item to ARCHIVED state (dismissed/consumed).
 * Optimistically removes the item from both inbox and library immediately,
 * then invalidates queries on completion.
 *
 * @returns tRPC mutation with mutate/mutateAsync functions
 *
 * @example
 * function ItemCard({ item }) {
 *   const archive = useArchiveItem();
 *
 *   return (
 *     <Button onPress={() => archive.mutate({ id: item.id })} disabled={archive.isPending}>
 *       Archive
 *     </Button>
 *   );
 * }
 */
export function useArchiveItem() {
  const utils = trpc.useUtils();

  return trpc.items.archive.useMutation(
    createOptimisticConfig(utils, {
      updateInbox: (items, { id }) => items.filter((item) => item.id !== id),
      updateLibrary: (items, { id }) => items.filter((item) => item.id !== id),
    })
  );
}

/**
 * Hook for unbookmarking an item with optimistic updates
 *
 * Moves an item from BOOKMARKED to ARCHIVED state.
 * Use case: User removes a bookmark and dismisses the item.
 * Optimistically removes the item from inbox and library caches immediately.
 *
 * @returns tRPC mutation with mutate/mutateAsync functions
 *
 * @example
 * function ItemDetailScreen({ item }) {
 *   const unbookmark = useUnbookmarkItem();
 *
 *   return (
 *     <Button onPress={() => unbookmark.mutate({ id: item.id })}>
 *       Remove bookmark
 *     </Button>
 *   );
 * }
 */
export function useUnbookmarkItem() {
  const utils = trpc.useUtils();

  return trpc.items.unbookmark.useMutation(
    createOptimisticConfig(utils, {
      updateInbox: (items, { id }) => items.filter((item) => item.id !== id),
      updateLibrary: (items, { id }) => items.filter((item) => item.id !== id),
      updateSingleItem: (item) => ({
        ...item,
        state: UserItemState.ARCHIVED,
        bookmarkedAt: null,
      }),
    })
  );
}

/**
 * Hook for toggling finished state with optimistic updates
 *
 * Toggles the isFinished boolean on an item.
 * Works in any state (INBOX, BOOKMARKED, ARCHIVED).
 * Optimistically updates the item in all caches immediately.
 *
 * This hook uses filter-aware optimistic updates for the library query:
 * - When marking an item finished from the unfinished view, it's immediately removed
 * - When marking an item unfinished from the finished view, it's immediately removed
 * - The item is added to the opposite filtered query for consistency
 *
 * @returns tRPC mutation with mutate/mutateAsync functions
 *
 * @example
 * function ItemDetailScreen({ item }) {
 *   const toggleFinished = useToggleFinished();
 *
 *   return (
 *     <Button onPress={() => toggleFinished.mutate({ id: item.id })}>
 *       {item.isFinished ? 'Mark unfinished' : 'Mark finished'}
 *     </Button>
 *   );
 * }
 */
export function useToggleFinished() {
  const utils = trpc.useUtils();

  const pendingToggleCountByIdRef = useRef(new Map<string, number>());

  type ToggleableItem = ListItem | NonNullable<ItemQueryData>;
  type LibraryQueryInput = Parameters<TrpcUtils['items']['library']['setData']>[0];

  const prependUniqueById = <T extends { id: string }>(items: T[], item: T): T[] => [
    item,
    ...items.filter((existing) => existing.id !== item.id),
  ];

  const buildLibraryInputsForItem = (
    item: ToggleableItem
  ): {
    unfinishedInputs: LibraryQueryInput[];
    finishedInputs: LibraryQueryInput[];
  } => ({
    unfinishedInputs: [
      undefined,
      { filter: { isFinished: false } },
      { filter: { provider: item.provider } },
      { filter: { contentType: item.contentType } },
      { filter: { provider: item.provider, contentType: item.contentType } },
    ],
    finishedInputs: [
      { filter: { isFinished: true } },
      { filter: { isFinished: true, provider: item.provider } },
      { filter: { isFinished: true, contentType: item.contentType } },
      { filter: { isFinished: true, provider: item.provider, contentType: item.contentType } },
    ],
  });

  const toggleFinishedInCaches = (id: string): boolean => {
    const currentItem = utils.items.get.getData({ id });
    const unfinishedLibrary = utils.items.library.getData();
    const explicitUnfinishedLibrary = utils.items.library.getData({
      filter: { isFinished: false },
    });
    const finishedLibrary = utils.items.library.getData({ filter: { isFinished: true } });
    const inbox = utils.items.inbox.getData();

    const targetItem: ToggleableItem | undefined =
      currentItem ??
      unfinishedLibrary?.items.find((item) => item.id === id) ??
      explicitUnfinishedLibrary?.items.find((item) => item.id === id) ??
      finishedLibrary?.items.find((item) => item.id === id) ??
      inbox?.items.find((item) => item.id === id);

    if (!targetItem) {
      return false;
    }

    const nowFinished = !targetItem.isFinished;
    const finishedAt = nowFinished ? new Date().toISOString() : null;
    const updatedItem: ToggleableItem = {
      ...targetItem,
      isFinished: nowFinished,
      finishedAt,
    };

    const { unfinishedInputs, finishedInputs } = buildLibraryInputsForItem(updatedItem);

    for (const input of unfinishedInputs) {
      utils.items.library.setData(input, (old) => {
        if (!old) return old;

        return {
          ...old,
          items: nowFinished
            ? old.items.filter((item) => item.id !== id)
            : prependUniqueById(old.items, updatedItem as ListItem),
        };
      });
    }

    for (const input of finishedInputs) {
      utils.items.library.setData(input, (old) => {
        if (!old) return old;

        return {
          ...old,
          items: nowFinished
            ? prependUniqueById(old.items, updatedItem as ListItem)
            : old.items.filter((item) => item.id !== id),
        };
      });
    }

    utils.items.inbox.setData(undefined, (old) => {
      if (!old) return old;

      const hasItem = old.items.some((item) => item.id === id);
      if (!hasItem) return old;

      return {
        ...old,
        items: old.items.map((item) =>
          item.id === id
            ? {
                ...item,
                isFinished: nowFinished,
                finishedAt,
              }
            : item
        ),
      };
    });

    utils.items.get.setData({ id }, (old) => {
      if (old) {
        return {
          ...old,
          isFinished: nowFinished,
          finishedAt,
        };
      }

      return updatedItem as NonNullable<ItemQueryData>;
    });

    return true;
  };

  const incrementPendingCount = (id: string) => {
    const current = pendingToggleCountByIdRef.current.get(id) ?? 0;
    pendingToggleCountByIdRef.current.set(id, current + 1);
  };

  const decrementPendingCount = (id: string): number => {
    const current = pendingToggleCountByIdRef.current.get(id) ?? 0;
    const next = Math.max(0, current - 1);
    if (next === 0) {
      pendingToggleCountByIdRef.current.delete(id);
    } else {
      pendingToggleCountByIdRef.current.set(id, next);
    }
    return next;
  };

  /** Context type for filter-aware rollback */
  type ToggleFinishedContext = {
    didApplyOptimisticUpdate: boolean;
  };

  return trpc.items.toggleFinished.useMutation({
    onMutate: async ({ id }): Promise<ToggleFinishedContext> => {
      // Cancel all potentially affected queries to reduce overwrite races.
      await Promise.all([
        utils.items.library.cancel(),
        utils.items.inbox.cancel(),
        utils.items.home.cancel(),
        utils.items.get.cancel({ id }),
      ]);

      incrementPendingCount(id);

      return {
        didApplyOptimisticUpdate: toggleFinishedInCaches(id),
      };
    },
    onError: (_err, { id }, context) => {
      // Revert failed optimistic toggles by inverting once more.
      // This is resilient to overlapping toggles on the same item.
      if (context?.didApplyOptimisticUpdate) {
        const didRollback = toggleFinishedInCaches(id);
        if (!didRollback) {
          utils.items.library.invalidate();
          utils.items.inbox.invalidate();
          utils.items.home.invalidate();
          utils.items.get.invalidate({ id });
        }
      }
    },
    onSettled: (_data, _err, { id }) => {
      // Defer invalidation until the last in-flight toggle settles to avoid flicker.
      if (decrementPendingCount(id) > 0) {
        return;
      }

      utils.items.library.invalidate();
      utils.items.inbox.invalidate();
      utils.items.home.invalidate();
      utils.items.get.invalidate({ id });
    },
  });
}

/**
 * Hook for marking a bookmarked item as opened
 *
 * Used to power the "Jump Back In" section on home.
 */
export function useMarkItemOpened() {
  const utils = trpc.useUtils();

  return trpc.items.markOpened.useMutation({
    onSettled: (_data, _err, { id }) => {
      utils.items.home.invalidate();
      utils.items.get.invalidate({ id });
    },
  });
}

/**
 * Hook for replacing tags on a bookmarked item.
 */
export function useSetItemTags() {
  const utils = trpc.useUtils();

  return trpc.items.setTags.useMutation({
    onSuccess: (_data, { id }) => {
      utils.items.get.invalidate({ id });
      utils.items.library.invalidate();
      utils.items.home.invalidate();
      utils.items.listTags.invalidate();
    },
  });
}

/**
 * Hook for updating playback/reading progress
 *
 * Updates the progress position for video/podcast/article consumption.
 *
 * No optimistic update is performed since progress updates are typically
 * fire-and-forget operations that don't need immediate UI feedback.
 *
 * @returns tRPC mutation with mutate/mutateAsync functions
 *
 * @example
 * function VideoPlayer({ item }) {
 *   const updateProgress = useUpdateProgress();
 *
 *   const handleProgress = (position: number, duration: number) => {
 *     updateProgress.mutate({
 *       id: item.id,
 *       position,
 *       duration,
 *     });
 *   };
 *
 *   return <Player onProgress={handleProgress} />;
 * }
 */
export function useUpdateProgress() {
  const utils = trpc.useUtils();

  return trpc.items.updateProgress.useMutation({
    onSettled: () => {
      utils.items.home.invalidate();
    },
  });
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

export { ContentType, Provider, UserItemState };
