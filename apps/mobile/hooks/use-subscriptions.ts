/**
 * Full useSubscriptions Hook with Offline Mutation Support
 *
 * Provides subscription management with offline-capable mutations.
 * Combines query functionality (from use-subscriptions-query.ts) with
 * offline-aware subscribe/unsubscribe mutations.
 *
 * For read-only use cases (e.g., displaying subscription count), use
 * useSubscriptionsQuery from use-subscriptions-query.ts instead.
 *
 * @see Frontend Spec Section 9.5 for detailed requirements
 * @see Frontend Spec Section 10.3 for API contract
 */

import { keepPreviousData } from '@tanstack/react-query';
import { trpc } from '../lib/trpc';
import { useOfflineMutation } from './use-offline-mutation';
import type {
  Subscription,
  SubscriptionsResponse,
  SubscriptionProvider,
} from './use-subscriptions-query';

// Re-export types for convenience
export type { Subscription, SubscriptionsResponse, SubscriptionProvider };

// ============================================================================
// Types
// ============================================================================

/**
 * Payload for subscribing to a channel/show.
 *
 * The index signature allows this interface to satisfy Record<string, unknown>
 * constraint required by useOfflineMutation for serialization to the offline queue.
 */
export interface SubscribePayload {
  /** The content provider */
  provider: SubscriptionProvider;
  /** Provider-specific channel/show ID */
  providerChannelId: string;
  /** Display name of the channel/show */
  name: string;
  /** Optional thumbnail URL */
  imageUrl?: string;
  /** Index signature for Record<string, unknown> compatibility */
  [key: string]: unknown;
}

/**
 * Payload for unsubscribing from a channel/show.
 *
 * The index signature allows this interface to satisfy Record<string, unknown>
 * constraint required by useOfflineMutation for serialization to the offline queue.
 */
export interface UnsubscribePayload {
  /** The subscription ID to remove */
  subscriptionId: string;
  /** Index signature for Record<string, unknown> compatibility */
  [key: string]: unknown;
}

/**
 * Return type for the useSubscriptions hook.
 */
export interface UseSubscriptionsReturn {
  // Query
  /** Array of subscription items (extracted from paginated response) */
  subscriptions: Subscription[];
  /** Full paginated response with nextCursor and hasMore */
  subscriptionsResponse: SubscriptionsResponse | undefined;
  /** Whether the initial query is loading */
  isLoading: boolean;
  /** Refetch subscriptions from server */
  refetch: () => Promise<void>;

  // Subscribe mutation
  /** Subscribe to a channel/show */
  subscribe: (payload: SubscribePayload) => void;
  /** Whether a subscribe mutation is in progress */
  isSubscribing: boolean;
  /** Whether a subscribe action was queued for offline execution */
  subscribeQueued: boolean;

  // Unsubscribe mutation
  /** Unsubscribe from a channel/show */
  unsubscribe: (payload: UnsubscribePayload) => void;
  /** Whether an unsubscribe mutation is in progress */
  isUnsubscribing: boolean;
  /** Whether an unsubscribe action was queued for offline execution */
  unsubscribeQueued: boolean;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Full subscriptions hook with offline mutation support.
 *
 * Provides:
 * - Query: Fetch user's subscriptions with pagination support
 * - Subscribe: Add subscription with optimistic update + offline queue
 * - Unsubscribe: Remove subscription with optimistic update + offline queue
 *
 * The hook uses optimistic updates for immediate UI feedback:
 * - Subscribe: Adds a temporary subscription to the cache
 * - Unsubscribe: Removes the subscription from the cache
 *
 * When offline:
 * - Actions are queued to the offline queue
 * - Optimistic updates remain until the queue processes
 * - Cache is invalidated when the queue successfully executes
 *
 * Query configuration:
 * - staleTime: 5 minutes (subscriptions don't change frequently)
 * - gcTime: 24 hours (keep in cache for offline access)
 *
 * @returns Object with subscriptions data, loading states, and mutation functions
 *
 * @example
 * ```tsx
 * function SubscriptionsList() {
 *   const {
 *     subscriptions,
 *     isLoading,
 *     subscribe,
 *     isSubscribing,
 *     subscribeQueued,
 *     unsubscribe,
 *     isUnsubscribing,
 *   } = useSubscriptions();
 *
 *   if (isLoading) return <LoadingSpinner />;
 *
 *   return (
 *     <FlatList
 *       data={subscriptions}
 *       renderItem={({ item }) => (
 *         <SubscriptionCard
 *           subscription={item}
 *           onUnsubscribe={() => unsubscribe({ subscriptionId: item.id })}
 *           isUnsubscribing={isUnsubscribing}
 *         />
 *       )}
 *     />
 *   );
 * }
 * ```
 *
 * @example
 * ```tsx
 * // Subscribe to a new channel
 * function ChannelCard({ channel }) {
 *   const { subscribe, isSubscribing, subscribeQueued } = useSubscriptions();
 *
 *   return (
 *     <Pressable
 *       onPress={() => subscribe({
 *         provider: 'YOUTUBE',
 *         providerChannelId: channel.id,
 *         name: channel.name,
 *         imageUrl: channel.thumbnail,
 *       })}
 *       disabled={isSubscribing}
 *     >
 *       <Text>
 *         {subscribeQueued ? 'Queued' : isSubscribing ? 'Subscribing...' : 'Subscribe'}
 *       </Text>
 *     </Pressable>
 *   );
 * }
 * ```
 */
export function useSubscriptions(): UseSubscriptionsReturn {
  const utils = trpc.useUtils();

  // ============================================================================
  // Query
  // ============================================================================

  // Using type assertion until router is updated with proper typing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subscriptionsQuery = (trpc as any).subscriptions.list.useQuery(
    { limit: 50 }, // Use default limit from API contract
    {
      // Cache for 5 minutes - subscriptions don't change frequently
      staleTime: 5 * 60 * 1000,
      // Keep in cache for 24 hours for offline access
      gcTime: 24 * 60 * 60 * 1000,
      placeholderData: keepPreviousData,
    }
  );

  // ============================================================================
  // Subscribe Mutation
  // ============================================================================

  const {
    mutate: subscribe,
    isPending: isSubscribing,
    isQueued: subscribeQueued,
  } = useOfflineMutation<SubscribePayload>({
    actionType: 'SUBSCRIBE',

    // Execute the actual mutation when online
    mutationFn: async (payload) => {
      // Using type assertion until router is updated with proper typing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (utils as any).client.subscriptions.add.mutate({
        provider: payload.provider,
        providerChannelId: payload.providerChannelId,
        name: payload.name,
        imageUrl: payload.imageUrl,
      });
    },

    // Apply optimistic update to cache immediately
    onOptimisticUpdate: (payload) => {
      // Response shape: { items: Subscription[], nextCursor, hasMore }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (utils as any).subscriptions.list.setData(
        { limit: 50 },
        (old: SubscriptionsResponse | undefined) => {
          if (!old) {
            return {
              items: [createTempSubscription(payload)],
              nextCursor: null,
              hasMore: false,
            };
          }

          return {
            ...old,
            items: [...old.items, createTempSubscription(payload)],
          };
        }
      );
    },

    // Rollback optimistic update on failure
    onRollback: (payload) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (utils as any).subscriptions.list.setData(
        { limit: 50 },
        (old: SubscriptionsResponse | undefined) => {
          if (!old) {
            return { items: [], nextCursor: null, hasMore: false };
          }

          return {
            ...old,
            items: old.items.filter(
              (s: Subscription) => s.providerChannelId !== payload.providerChannelId
            ),
          };
        }
      );
    },

    // Invalidate cache to get fresh data from server
    onSuccess: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (utils as any).subscriptions.list.invalidate();
      // Also invalidate items queries - new subscription triggers ingestion of latest episode
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (utils as any).items.inbox.invalidate();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (utils as any).items.library.invalidate();
    },
  });

  // ============================================================================
  // Unsubscribe Mutation
  // ============================================================================

  const {
    mutate: unsubscribe,
    isPending: isUnsubscribing,
    isQueued: unsubscribeQueued,
  } = useOfflineMutation<UnsubscribePayload>({
    actionType: 'UNSUBSCRIBE',

    // Execute the actual mutation when online
    mutationFn: async (payload) => {
      // Using type assertion until router is updated with proper typing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (utils as any).client.subscriptions.remove.mutate({
        subscriptionId: payload.subscriptionId,
      });
    },

    // Apply optimistic update to cache immediately
    onOptimisticUpdate: (payload) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (utils as any).subscriptions.list.setData(
        { limit: 50 },
        (old: SubscriptionsResponse | undefined) => {
          if (!old) {
            return { items: [], nextCursor: null, hasMore: false };
          }

          return {
            ...old,
            items: old.items.filter((s: Subscription) => s.id !== payload.subscriptionId),
          };
        }
      );
    },

    // Rollback by invalidating cache (let it refetch the actual state)
    onRollback: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (utils as any).subscriptions.list.invalidate();
    },
  });

  // ============================================================================
  // Return
  // ============================================================================

  return {
    // Query
    subscriptions: subscriptionsQuery.data?.items ?? [],
    subscriptionsResponse: subscriptionsQuery.data,
    isLoading: subscriptionsQuery.isLoading,
    refetch: async () => {
      await subscriptionsQuery.refetch();
    },

    // Subscribe mutation
    subscribe,
    isSubscribing,
    subscribeQueued,

    // Unsubscribe mutation
    unsubscribe,
    isUnsubscribing,
    unsubscribeQueued,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a temporary subscription object for optimistic updates.
 *
 * Uses a temp ID prefix so we can identify and update it later.
 * All nullable fields are set to null, and status is ACTIVE.
 */
function createTempSubscription(payload: SubscribePayload): Subscription {
  return {
    id: `temp-${Date.now()}`,
    provider: payload.provider,
    providerChannelId: payload.providerChannelId,
    name: payload.name,
    imageUrl: payload.imageUrl ?? null,
    status: 'ACTIVE',
    createdAt: Date.now(),
    lastItemAt: null,
  };
}

// ============================================================================
// Additional Exports
// ============================================================================

/**
 * Hook for infinite scroll/pagination of subscriptions.
 *
 * Uses React Query's useInfiniteQuery for cursor-based pagination.
 * Preferred for long subscription lists that should load progressively.
 *
 * Note: This hook does not include mutation support. Use useSubscriptions()
 * to get mutation functions alongside the standard query.
 *
 * @param options - Optional configuration
 * @param options.limit - Number of items per page (default: 20)
 * @returns React Query infinite query result
 *
 * @example
 * ```tsx
 * function InfiniteSubscriptionsList() {
 *   const {
 *     data,
 *     fetchNextPage,
 *     hasNextPage,
 *     isFetchingNextPage,
 *   } = useInfiniteSubscriptions({ limit: 20 });
 *
 *   // Flatten pages for FlatList
 *   const allSubscriptions = data?.pages.flatMap(page => page.items) ?? [];
 *
 *   return (
 *     <FlatList
 *       data={allSubscriptions}
 *       onEndReached={() => hasNextPage && fetchNextPage()}
 *       ListFooterComponent={isFetchingNextPage ? <Spinner /> : null}
 *     />
 *   );
 * }
 * ```
 */
export function useInfiniteSubscriptions(options?: { limit?: number }) {
  // Using type assertion until router is updated with proper typing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (trpc as any).subscriptions.list.useInfiniteQuery(
    { limit: options?.limit ?? 20 },
    {
      getNextPageParam: (lastPage: SubscriptionsResponse) => lastPage.nextCursor,
      staleTime: 5 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
    }
  );
}
