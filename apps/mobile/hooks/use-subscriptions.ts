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
import type {
  AddSubscriptionInput,
  RemoveSubscriptionInput,
  SubscriptionsListOutput,
} from '../lib/trpc-types';
import { useOfflineMutation } from './use-offline-mutation';
import type {
  Subscription,
  SubscriptionsResponse,
  SubscriptionProvider,
} from './use-subscriptions-query';
import { mapSubscriptionsResponse } from './use-subscriptions-query';

// Re-export types for convenience
export type { Subscription, SubscriptionsResponse, SubscriptionProvider };
export type SubscribePayload = AddSubscriptionInput;
export type UnsubscribePayload = RemoveSubscriptionInput;

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
  subscribe: (payload: AddSubscriptionInput) => void;
  /** Whether a subscribe mutation is in progress */
  isSubscribing: boolean;
  /** Whether a subscribe action was queued for offline execution */
  subscribeQueued: boolean;

  // Unsubscribe mutation
  /** Unsubscribe from a channel/show */
  unsubscribe: (payload: RemoveSubscriptionInput) => void;
  /** Whether an unsubscribe mutation is in progress */
  isUnsubscribing: boolean;
  /** Whether an unsubscribe action was queued for offline execution */
  unsubscribeQueued: boolean;
}

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

  const subscriptionsQuery = trpc.subscriptions.list.useQuery(
    { limit: 50 }, // Use default limit from API contract
    {
      // Cache for 5 minutes - subscriptions don't change frequently
      staleTime: 5 * 60 * 1000,
      // Keep in cache for 24 hours for offline access
      gcTime: 24 * 60 * 60 * 1000,
      placeholderData: keepPreviousData,
    }
  );

  const {
    mutate: subscribe,
    isPending: isSubscribing,
    isQueued: subscribeQueued,
  } = useOfflineMutation<AddSubscriptionInput>({
    actionType: 'SUBSCRIBE',

    mutationFn: async (payload) => {
      await utils.client.subscriptions.add.mutate(payload);
    },

    onOptimisticUpdate: (payload) => {
      utils.subscriptions.list.setData(
        { limit: 50 },
        (old: SubscriptionsListOutput | undefined) => {
          if (!old) {
            return {
              items: [createTempSubscriptionRow(payload)],
              nextCursor: null,
              hasMore: false,
            };
          }

          return {
            ...old,
            items: [...old.items, createTempSubscriptionRow(payload)],
          };
        }
      );
    },

    onRollback: (payload) => {
      utils.subscriptions.list.setData(
        { limit: 50 },
        (old: SubscriptionsListOutput | undefined) => {
          if (!old) {
            return { items: [], nextCursor: null, hasMore: false };
          }

          return {
            ...old,
            items: old.items.filter(
              (s: SubscriptionsListOutput['items'][number]) =>
                s.providerChannelId !== payload.providerChannelId
            ),
          };
        }
      );
    },

    onSuccess: () => {
      utils.subscriptions.list.invalidate();
      // Also invalidate items queries - new subscription triggers ingestion of latest episode
      utils.items.inbox.invalidate();
      utils.items.library.invalidate();
    },
  });

  const {
    mutate: unsubscribe,
    isPending: isUnsubscribing,
    isQueued: unsubscribeQueued,
  } = useOfflineMutation<RemoveSubscriptionInput>({
    actionType: 'UNSUBSCRIBE',

    mutationFn: async (payload) => {
      await utils.client.subscriptions.remove.mutate(payload);
    },

    onOptimisticUpdate: (payload) => {
      utils.subscriptions.list.setData(
        { limit: 50 },
        (old: SubscriptionsListOutput | undefined) => {
          if (!old) {
            return { items: [], nextCursor: null, hasMore: false };
          }

          return {
            ...old,
            items: old.items.filter(
              (s: SubscriptionsListOutput['items'][number]) => s.id !== payload.subscriptionId
            ),
          };
        }
      );
    },

    onRollback: () => {
      utils.subscriptions.list.invalidate();
    },
  });

  return {
    subscriptions: subscriptionsQuery.data
      ? mapSubscriptionsResponse(subscriptionsQuery.data).items
      : [],
    subscriptionsResponse: subscriptionsQuery.data
      ? mapSubscriptionsResponse(subscriptionsQuery.data)
      : undefined,
    isLoading: subscriptionsQuery.isLoading,
    refetch: async () => {
      await subscriptionsQuery.refetch();
    },

    subscribe,
    isSubscribing,
    subscribeQueued,

    unsubscribe,
    isUnsubscribing,
    unsubscribeQueued,
  };
}

// Helper Functions

/**
 * Create a temporary subscription object for optimistic updates.
 *
 * Uses a temp ID prefix so we can identify and update it later.
 * All nullable fields are set to null, and status is ACTIVE.
 */
function createTempSubscriptionRow(
  payload: AddSubscriptionInput
): SubscriptionsListOutput['items'][number] {
  return {
    id: `temp-${Date.now()}`,
    userId: 'temp-user',
    provider: payload.provider,
    providerChannelId: payload.providerChannelId,
    creatorId: null,
    name: payload.name ?? 'Unknown',
    imageUrl: payload.imageUrl ?? null,
    description: null,
    externalUrl: null,
    totalItems: 0,
    lastPublishedAt: null,
    lastPolledAt: null,
    pollIntervalSeconds: 3600,
    status: 'ACTIVE',
    disconnectedAt: null,
    disconnectedReason: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// Additional Exports

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
  return trpc.subscriptions.list.useInfiniteQuery(
    { limit: options?.limit ?? 20 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      select: (data) => ({
        ...data,
        pages: data.pages.map(mapSubscriptionsResponse),
      }),
      staleTime: 5 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
    }
  );
}
