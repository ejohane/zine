/**
 * Replicache-style data hooks for Items
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
 * This mirrors what Replicache would return with joined data
 */
export interface ItemWithUserState {
  item: {
    id: string;
    title: string | null;
    description?: string | null;
    author?: string | null;
    publisher?: string | null;
    thumbnailUrl?: string | null;
    contentUrl?: string | null;
    providerId?: string | null;
    contentType?: string;
    duration?: number | null;
    publishedAt?: string | null;
    createdAt?: string;
  };
  userItem: {
    id: string;
    itemId: string;
    userId: string;
    state: string;
    position?: number | null;
    createdAt?: string;
    updatedAt?: string;
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
      description: item.description,
      author: item.author,
      publisher: item.publisher,
      thumbnailUrl: item.thumbnailUrl,
      contentUrl: item.contentUrl,
      providerId: item.providerId,
      contentType: item.contentType,
      duration: item.duration,
      publishedAt: item.publishedAt,
      createdAt: item.createdAt,
    },
    userItem: {
      id: item.id,
      itemId: item.itemId,
      userId: item.userId,
      state: item.state,
      position: item.position,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
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
      description: item.description,
      author: item.author,
      publisher: item.publisher,
      thumbnailUrl: item.thumbnailUrl,
      contentUrl: item.contentUrl,
      providerId: item.providerId,
      contentType: item.contentType,
      duration: item.duration,
      publishedAt: item.publishedAt,
      createdAt: item.createdAt,
    },
    userItem: {
      id: item.id,
      itemId: item.itemId,
      userId: item.userId,
      state: item.state,
      position: item.position,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    },
  }));
}
