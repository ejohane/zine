/**
 * tRPC-based data hooks for Items
 *
 * Provides React Query hooks for fetching and mutating items data via tRPC.
 * This replaces the Replicache-based hooks in use-items.ts.
 */

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
export type UIProvider = 'youtube' | 'spotify' | 'rss' | 'substack';

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
    provider?: 'YOUTUBE' | 'SPOTIFY' | 'SUBSTACK' | 'RSS';
    contentType?: 'VIDEO' | 'PODCAST' | 'ARTICLE' | 'POST';
  };
  limit?: number;
}) {
  return trpc.items.inbox.useQuery(options);
}

/**
 * Hook for fetching library/bookmarked items (BOOKMARKED state)
 *
 * Returns items that have been saved for later consumption.
 * Supports filtering by provider and content type.
 *
 * @param options - Optional filter and pagination options
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
 */
export function useLibraryItems(options?: {
  filter?: {
    provider?: 'YOUTUBE' | 'SPOTIFY' | 'SUBSTACK' | 'RSS';
    contentType?: 'VIDEO' | 'PODCAST' | 'ARTICLE' | 'POST';
  };
  limit?: number;
}) {
  return trpc.items.library.useQuery(options);
}

/**
 * Hook for fetching home screen data
 *
 * Returns curated sections for the home screen:
 * - recentBookmarks: Latest bookmarked items
 * - jumpBackIn: Items with playback progress
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
  return trpc.items.home.useQuery();
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

  return trpc.items.bookmark.useMutation({
    onMutate: async ({ id }) => {
      // Cancel outgoing queries to prevent race conditions
      await utils.items.inbox.cancel();

      // Snapshot previous value for rollback
      const previousInbox = utils.items.inbox.getData();

      // Optimistically remove item from inbox
      utils.items.inbox.setData(undefined, (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.filter((item) => item.id !== id),
        };
      });

      return { previousInbox };
    },
    onError: (_err, _vars, context) => {
      // Rollback on error
      if (context?.previousInbox) {
        utils.items.inbox.setData(undefined, context.previousInbox);
      }
    },
    onSettled: () => {
      // Refetch after mutation completes (success or error)
      utils.items.inbox.invalidate();
      utils.items.library.invalidate();
    },
  });
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

  return trpc.items.archive.useMutation({
    onMutate: async ({ id }) => {
      // Cancel outgoing queries to prevent race conditions
      await Promise.all([utils.items.inbox.cancel(), utils.items.library.cancel()]);

      // Snapshot previous values for rollback
      const previousInbox = utils.items.inbox.getData();
      const previousLibrary = utils.items.library.getData();

      // Optimistically remove item from inbox
      utils.items.inbox.setData(undefined, (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.filter((item) => item.id !== id),
        };
      });

      // Optimistically remove item from library
      utils.items.library.setData(undefined, (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.filter((item) => item.id !== id),
        };
      });

      return { previousInbox, previousLibrary };
    },
    onError: (_err, _vars, context) => {
      // Rollback on error
      if (context?.previousInbox) {
        utils.items.inbox.setData(undefined, context.previousInbox);
      }
      if (context?.previousLibrary) {
        utils.items.library.setData(undefined, context.previousLibrary);
      }
    },
    onSettled: () => {
      // Refetch after mutation completes (success or error)
      utils.items.inbox.invalidate();
      utils.items.library.invalidate();
    },
  });
}

/**
 * Hook for updating playback/reading progress
 *
 * Updates the progress position for video/podcast/article consumption.
 * Used for "Jump Back In" feature on home screen.
 *
 * No optimistic update is performed since progress updates are typically
 * fire-and-forget operations that don't need immediate UI feedback.
 * Invalidates home data on completion to refresh "Jump Back In" section.
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
      // Invalidate home data to refresh "Jump Back In" section
      utils.items.home.invalidate();
    },
  });
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

export { ContentType, Provider, UserItemState };
