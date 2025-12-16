/**
 * Data hooks for Items
 *
 * Wraps tRPC hooks to provide a simpler interface for UI components.
 * Returns arrays directly instead of React Query result objects.
 */

import {
  useLibraryItems as useTRPCLibraryItems,
  useInboxItems as useTRPCInboxItems,
} from './use-items-trpc';

// Re-export helper functions and types from tRPC hooks
export { mapContentType, formatDuration, UIContentType, UIProvider } from './use-items-trpc';

// ============================================================================
// Types
// ============================================================================

/**
 * Represents an item joined with its user state
 * This mirrors what the old architecture would return with joined data
 */
export interface ItemWithUserState {
  item: {
    id: string;
    title: string | null;
    summary?: string | null;
    creator?: string | null;
    publisher?: string | null;
    thumbnailUrl?: string | null;
    canonicalUrl?: string | null;
    contentType?: string;
    duration?: number | null;
    publishedAt?: string | null;
  };
  userItem: {
    id: string;
    itemId: string;
    state: string;
    ingestedAt?: string | null;
    bookmarkedAt?: string | null;
  };
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook for fetching bookmarked items as a simple array
 *
 * @returns Array of ItemWithUserState, empty array while loading
 *
 * @example
 * function LibraryScreen() {
 *   const bookmarkedItems = useBookmarkedItems();
 *   return bookmarkedItems.map((item) => <ItemCard key={item.userItem.id} item={item} />);
 * }
 */
export function useBookmarkedItems(): ItemWithUserState[] {
  const { data } = useTRPCLibraryItems();

  if (!data?.items) return [];

  // Transform tRPC response to ItemWithUserState format
  return data.items.map((item) => ({
    item: {
      id: item.itemId,
      title: item.title,
      summary: item.summary,
      creator: item.creator,
      publisher: item.publisher,
      thumbnailUrl: item.thumbnailUrl,
      canonicalUrl: item.canonicalUrl,
      contentType: item.contentType,
      duration: item.duration,
      publishedAt: item.publishedAt,
    },
    userItem: {
      id: item.id,
      itemId: item.itemId,
      state: item.state,
      ingestedAt: item.ingestedAt,
      bookmarkedAt: item.bookmarkedAt,
    },
  }));
}

/**
 * Hook for fetching inbox items as a simple array
 *
 * @returns Array of ItemWithUserState, empty array while loading
 *
 * @example
 * function InboxScreen() {
 *   const inboxItems = useInboxItems();
 *   return inboxItems.map((item) => <ItemCard key={item.userItem.id} item={item} />);
 * }
 */
export function useInboxItems(): ItemWithUserState[] {
  const { data } = useTRPCInboxItems();

  if (!data?.items) return [];

  // Transform tRPC response to ItemWithUserState format
  return data.items.map((item) => ({
    item: {
      id: item.itemId,
      title: item.title,
      summary: item.summary,
      creator: item.creator,
      publisher: item.publisher,
      thumbnailUrl: item.thumbnailUrl,
      canonicalUrl: item.canonicalUrl,
      contentType: item.contentType,
      duration: item.duration,
      publishedAt: item.publishedAt,
    },
    userItem: {
      id: item.id,
      itemId: item.itemId,
      state: item.state,
      ingestedAt: item.ingestedAt,
      bookmarkedAt: item.bookmarkedAt,
    },
  }));
}
