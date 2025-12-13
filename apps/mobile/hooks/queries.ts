/**
 * Convenience Query Hooks for Zine Mobile
 *
 * Pre-built subscription hooks for common data queries:
 * - useInboxItems() - Items awaiting triage
 * - useBookmarkedItems() - Saved items
 * - useItem(id) - Single item with related data
 * - useSources() - User's source subscriptions
 *
 * @module hooks/queries
 */

import {
  type Item,
  type UserItem,
  type Source,
  UserItemState,
  userItemScanPrefix,
  sourceScanPrefix,
  itemKey,
  userItemKey,
} from '@zine/shared';
import {
  useSubscribe,
  useSubscribeKey,
  useSubscribePrefix,
  type UseSubscribeResult,
} from './useSubscribe';

// ============================================================================
// Types
// ============================================================================

/**
 * A UserItem joined with its associated Item data
 */
export interface UserItemWithDetails extends UserItem {
  /** The associated Item, if found */
  item?: Item;
}

/**
 * Options for item query hooks
 */
export interface ItemQueryOptions {
  /** Filter by item state */
  state?: UserItemState;
  /** Sort direction for items (by ingestedAt) */
  sortDirection?: 'asc' | 'desc';
  /** Maximum number of items to return */
  limit?: number;
}

// ============================================================================
// User Item Queries
// ============================================================================

/**
 * Subscribe to inbox items (items awaiting triage)
 *
 * @param options - Optional query configuration
 * @returns Subscription result with inbox items and their details
 *
 * @example
 * ```tsx
 * function InboxScreen() {
 *   const { data: inboxItems, isLoading, error } = useInboxItems();
 *
 *   if (isLoading) return <ActivityIndicator />;
 *
 *   return (
 *     <FlatList
 *       data={inboxItems}
 *       renderItem={({ item }) => (
 *         <ItemCard
 *           title={item.item?.title}
 *           state={item.state}
 *         />
 *       )}
 *     />
 *   );
 * }
 * ```
 */
export function useInboxItems(
  options: Omit<ItemQueryOptions, 'state'> = {}
): UseSubscribeResult<UserItemWithDetails[]> {
  const { sortDirection = 'desc', limit } = options;

  return useSubscribe<UserItemWithDetails[]>(
    async (tx) => {
      // Get all user items
      const userItemEntries = await tx.scan({ prefix: userItemScanPrefix() }).entries().toArray();

      // Filter to inbox items
      let inboxItems = userItemEntries
        .map(([, value]) => value as unknown as UserItem)
        .filter((ui) => ui.state === UserItemState.INBOX);

      // Sort by ingestedAt
      inboxItems.sort((a, b) => {
        const comparison = new Date(a.ingestedAt).getTime() - new Date(b.ingestedAt).getTime();
        return sortDirection === 'asc' ? comparison : -comparison;
      });

      // Apply limit
      if (limit) {
        inboxItems = inboxItems.slice(0, limit);
      }

      // Fetch associated items
      const results: UserItemWithDetails[] = await Promise.all(
        inboxItems.map(async (userItem) => {
          const item = (await tx.get(itemKey(userItem.itemId))) as Item | undefined;
          return { ...userItem, item };
        })
      );

      return results;
    },
    [sortDirection, limit],
    { defaultValue: [] }
  );
}

/**
 * Subscribe to bookmarked items
 *
 * @param options - Optional query configuration
 * @returns Subscription result with bookmarked items and their details
 *
 * @example
 * ```tsx
 * function LibraryScreen() {
 *   const { data: bookmarks, isLoading } = useBookmarkedItems({
 *     sortDirection: 'desc',
 *   });
 *
 *   return (
 *     <FlatList
 *       data={bookmarks}
 *       renderItem={({ item }) => <BookmarkCard item={item} />}
 *     />
 *   );
 * }
 * ```
 */
export function useBookmarkedItems(
  options: Omit<ItemQueryOptions, 'state'> = {}
): UseSubscribeResult<UserItemWithDetails[]> {
  const { sortDirection = 'desc', limit } = options;

  return useSubscribe<UserItemWithDetails[]>(
    async (tx) => {
      // Get all user items
      const userItemEntries = await tx.scan({ prefix: userItemScanPrefix() }).entries().toArray();

      // Filter to bookmarked items
      let bookmarkedItems = userItemEntries
        .map(([, value]) => value as unknown as UserItem)
        .filter((ui) => ui.state === UserItemState.BOOKMARKED);

      // Sort by bookmarkedAt
      bookmarkedItems.sort((a, b) => {
        const aTime = a.bookmarkedAt ? new Date(a.bookmarkedAt).getTime() : 0;
        const bTime = b.bookmarkedAt ? new Date(b.bookmarkedAt).getTime() : 0;
        const comparison = aTime - bTime;
        return sortDirection === 'asc' ? comparison : -comparison;
      });

      // Apply limit
      if (limit) {
        bookmarkedItems = bookmarkedItems.slice(0, limit);
      }

      // Fetch associated items
      const results: UserItemWithDetails[] = await Promise.all(
        bookmarkedItems.map(async (userItem) => {
          const item = (await tx.get(itemKey(userItem.itemId))) as Item | undefined;
          return { ...userItem, item };
        })
      );

      return results;
    },
    [sortDirection, limit],
    { defaultValue: [] }
  );
}

/**
 * Subscribe to archived items
 *
 * @param options - Optional query configuration
 * @returns Subscription result with archived items and their details
 */
export function useArchivedItems(
  options: Omit<ItemQueryOptions, 'state'> = {}
): UseSubscribeResult<UserItemWithDetails[]> {
  const { sortDirection = 'desc', limit } = options;

  return useSubscribe<UserItemWithDetails[]>(
    async (tx) => {
      // Get all user items
      const userItemEntries = await tx.scan({ prefix: userItemScanPrefix() }).entries().toArray();

      // Filter to archived items
      let archivedItems = userItemEntries
        .map(([, value]) => value as unknown as UserItem)
        .filter((ui) => ui.state === UserItemState.ARCHIVED);

      // Sort by archivedAt
      archivedItems.sort((a, b) => {
        const aTime = a.archivedAt ? new Date(a.archivedAt).getTime() : 0;
        const bTime = b.archivedAt ? new Date(b.archivedAt).getTime() : 0;
        const comparison = aTime - bTime;
        return sortDirection === 'asc' ? comparison : -comparison;
      });

      // Apply limit
      if (limit) {
        archivedItems = archivedItems.slice(0, limit);
      }

      // Fetch associated items
      const results: UserItemWithDetails[] = await Promise.all(
        archivedItems.map(async (userItem) => {
          const item = (await tx.get(itemKey(userItem.itemId))) as Item | undefined;
          return { ...userItem, item };
        })
      );

      return results;
    },
    [sortDirection, limit],
    { defaultValue: [] }
  );
}

/**
 * Subscribe to all user items (any state)
 *
 * @param options - Optional query configuration
 * @returns Subscription result with all user items and their details
 */
export function useAllUserItems(
  options: ItemQueryOptions = {}
): UseSubscribeResult<UserItemWithDetails[]> {
  const { state, sortDirection = 'desc', limit } = options;

  return useSubscribe<UserItemWithDetails[]>(
    async (tx) => {
      // Get all user items
      const userItemEntries = await tx.scan({ prefix: userItemScanPrefix() }).entries().toArray();

      // Filter by state if provided
      let userItems = userItemEntries.map(([, value]) => value as unknown as UserItem);

      if (state) {
        userItems = userItems.filter((ui) => ui.state === state);
      }

      // Sort by ingestedAt
      userItems.sort((a, b) => {
        const comparison = new Date(a.ingestedAt).getTime() - new Date(b.ingestedAt).getTime();
        return sortDirection === 'asc' ? comparison : -comparison;
      });

      // Apply limit
      if (limit) {
        userItems = userItems.slice(0, limit);
      }

      // Fetch associated items
      const results: UserItemWithDetails[] = await Promise.all(
        userItems.map(async (userItem) => {
          const item = (await tx.get(itemKey(userItem.itemId))) as Item | undefined;
          return { ...userItem, item };
        })
      );

      return results;
    },
    [state, sortDirection, limit],
    { defaultValue: [] }
  );
}

// ============================================================================
// Single Item Queries
// ============================================================================

/**
 * Subscribe to a single user item by ID
 *
 * @param userItemId - The user item ID
 * @returns Subscription result with user item or undefined
 *
 * @example
 * ```tsx
 * function ItemDetailScreen({ userItemId }: { userItemId: string }) {
 *   const { data: userItem, isLoading } = useUserItem(userItemId);
 *
 *   if (isLoading) return <ActivityIndicator />;
 *   if (!userItem) return <Text>Not found</Text>;
 *
 *   return <Text>State: {userItem.state}</Text>;
 * }
 * ```
 */
export function useUserItem(userItemId: string): UseSubscribeResult<UserItem | undefined> {
  return useSubscribeKey<UserItem>(userItemKey(userItemId));
}

/**
 * Subscribe to a single item by ID
 *
 * @param itemId - The item ID
 * @returns Subscription result with item or undefined
 */
export function useItem(itemId: string): UseSubscribeResult<Item | undefined> {
  return useSubscribeKey<Item>(itemKey(itemId));
}

/**
 * Subscribe to a user item with its associated item details
 *
 * @param userItemId - The user item ID
 * @returns Subscription result with user item and associated item
 *
 * @example
 * ```tsx
 * function ItemDetailScreen({ userItemId }: { userItemId: string }) {
 *   const { data, isLoading } = useUserItemWithDetails(userItemId);
 *
 *   if (isLoading) return <ActivityIndicator />;
 *   if (!data) return <Text>Not found</Text>;
 *
 *   return (
 *     <View>
 *       <Text>{data.item?.title}</Text>
 *       <Text>State: {data.state}</Text>
 *     </View>
 *   );
 * }
 * ```
 */
export function useUserItemWithDetails(
  userItemId: string
): UseSubscribeResult<UserItemWithDetails | undefined> {
  return useSubscribe<UserItemWithDetails | undefined>(
    async (tx) => {
      const userItem = (await tx.get(userItemKey(userItemId))) as UserItem | undefined;
      if (!userItem) return undefined;

      const item = (await tx.get(itemKey(userItem.itemId))) as Item | undefined;
      return { ...userItem, item };
    },
    [userItemId]
  );
}

// ============================================================================
// Source Queries
// ============================================================================

/**
 * Subscribe to all sources
 *
 * @returns Subscription result with array of sources
 *
 * @example
 * ```tsx
 * function SourcesScreen() {
 *   const { data: sources, isLoading } = useSources();
 *
 *   return (
 *     <FlatList
 *       data={sources}
 *       renderItem={({ item }) => (
 *         <SourceCard
 *           name={item.name}
 *           provider={item.provider}
 *         />
 *       )}
 *     />
 *   );
 * }
 * ```
 */
export function useSources(): UseSubscribeResult<Source[]> {
  return useSubscribePrefix<Source>(sourceScanPrefix());
}

/**
 * Subscribe to a single source by ID
 *
 * @param sourceId - The source ID
 * @returns Subscription result with source or undefined
 */
export function useSource(sourceId: string): UseSubscribeResult<Source | undefined> {
  return useSubscribeKey<Source>(sourceScanPrefix() + sourceId);
}

// ============================================================================
// Stats/Counts
// ============================================================================

/**
 * Subscribe to item counts by state
 *
 * @returns Subscription result with counts for each state
 *
 * @example
 * ```tsx
 * function Dashboard() {
 *   const { data: counts } = useItemCounts();
 *
 *   return (
 *     <View>
 *       <Text>Inbox: {counts?.inbox ?? 0}</Text>
 *       <Text>Bookmarked: {counts?.bookmarked ?? 0}</Text>
 *       <Text>Archived: {counts?.archived ?? 0}</Text>
 *     </View>
 *   );
 * }
 * ```
 */
export function useItemCounts(): UseSubscribeResult<{
  inbox: number;
  bookmarked: number;
  archived: number;
  total: number;
}> {
  return useSubscribe(
    async (tx) => {
      const userItemEntries = await tx.scan({ prefix: userItemScanPrefix() }).entries().toArray();

      const counts = {
        inbox: 0,
        bookmarked: 0,
        archived: 0,
        total: userItemEntries.length,
      };

      for (const [, value] of userItemEntries) {
        const userItem = value as unknown as UserItem;
        switch (userItem.state) {
          case UserItemState.INBOX:
            counts.inbox++;
            break;
          case UserItemState.BOOKMARKED:
            counts.bookmarked++;
            break;
          case UserItemState.ARCHIVED:
            counts.archived++;
            break;
        }
      }

      return counts;
    },
    [],
    { defaultValue: { inbox: 0, bookmarked: 0, archived: 0, total: 0 } }
  );
}

/**
 * Subscribe to source count
 *
 * @returns Subscription result with number of sources
 */
export function useSourceCount(): UseSubscribeResult<number> {
  return useSubscribe(
    async (tx) => {
      const entries = await tx.scan({ prefix: sourceScanPrefix() }).entries().toArray();
      return entries.length;
    },
    [],
    { defaultValue: 0 }
  );
}
