/**
 * Creator Hooks
 *
 * Provides React hooks for the Creator View feature.
 * Encapsulates all TRPC calls related to creator data:
 * - useCreator: Get creator profile info
 * - useCreatorBookmarks: Paginated bookmarks from a creator
 * - useCreatorPublications: Paginated publications from a creator (all states)
 * - useCreatorLatestContent: Latest content from provider
 * - useCreatorSubscription: Subscription status and actions
 *
 * @module
 */

import { trpc } from '../lib/trpc';

// ============================================================================
// Types
// ============================================================================

/**
 * Creator profile returned from creators.get
 */
export interface Creator {
  id: string;
  name: string;
  imageUrl: string | null;
  provider: string;
  providerCreatorId: string;
  description: string | null;
  handle: string | null;
  externalUrl: string | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * Latest content item from a creator
 * Note: Field names match backend LatestContentItem (id, externalUrl, publishedAt as number)
 */
export interface CreatorContentItem {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  duration: number | null;
  publishedAt: number | null;
  externalUrl: string;
  itemId?: string | null;
  isBookmarked?: boolean;
}

export type LatestContentCacheStatus = 'HIT' | 'MISS';

/**
 * Response from creators.fetchLatestContent
 */
export interface LatestContentResponse {
  items: CreatorContentItem[];
  provider?: string;
  cacheStatus?: LatestContentCacheStatus;
  reason?: string;
  connectUrl?: string;
}

/**
 * Response from creators.checkSubscription
 */
export interface SubscriptionStatus {
  isSubscribed: boolean;
  subscribedAt: string | null;
  canSubscribe?: boolean;
  reason?: string;
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook for fetching a single creator's profile.
 *
 * Returns creator data including name, image, and provider info.
 * Throws a TRPC error if the creator is not found.
 *
 * @param creatorId - The unique identifier of the creator
 * @returns Object with creator data, loading, error, and refetch states
 *
 * @example
 * ```tsx
 * function CreatorHeader({ creatorId }: { creatorId: string }) {
 *   const { creator, isLoading, error } = useCreator(creatorId);
 *
 *   if (isLoading) return <LoadingSpinner />;
 *   if (error) return <ErrorMessage error={error} />;
 *
 *   return (
 *     <View>
 *       <Image source={{ uri: creator?.imageUrl }} />
 *       <Text>{creator?.name}</Text>
 *     </View>
 *   );
 * }
 * ```
 */
export function useCreator(creatorId: string) {
  const creatorQuery = trpc.creators.get.useQuery(
    { creatorId },
    {
      enabled: !!creatorId,
      // Creator data is fairly stable, cache for 5 minutes
      staleTime: 5 * 60 * 1000,
      // Keep in cache for 30 minutes
      gcTime: 30 * 60 * 1000,
    }
  );

  return {
    creator: creatorQuery.data as Creator | undefined,
    isLoading: creatorQuery.isLoading,
    error: creatorQuery.error,
    refetch: creatorQuery.refetch,
  };
}

/**
 * Hook for fetching paginated bookmarked items from a creator.
 *
 * Returns items the user has bookmarked from this creator, sorted by
 * bookmarked date descending. Supports infinite scroll pagination.
 *
 * @param creatorId - The unique identifier of the creator
 * @param options - Optional configuration
 * @param options.limit - Number of items per page (default: 20)
 * @returns Object with bookmarks array, pagination controls, and states
 *
 * @example
 * ```tsx
 * function CreatorBookmarks({ creatorId }: { creatorId: string }) {
 *   const {
 *     bookmarks,
 *     isLoading,
 *     hasNextPage,
 *     fetchNextPage,
 *     isFetchingNextPage,
 *   } = useCreatorBookmarks(creatorId);
 *
 *   return (
 *     <FlatList
 *       data={bookmarks}
 *       renderItem={({ item }) => <BookmarkCard item={item} />}
 *       onEndReached={() => hasNextPage && fetchNextPage()}
 *       ListFooterComponent={isFetchingNextPage ? <Spinner /> : null}
 *     />
 *   );
 * }
 * ```
 */
export function useCreatorBookmarks(creatorId: string, options?: { limit?: number }) {
  const limit = options?.limit ?? 20;

  const bookmarksQuery = trpc.creators.listBookmarks.useInfiniteQuery(
    { creatorId, limit },
    {
      enabled: !!creatorId,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      // Bookmarks change more frequently, use shorter stale time
      staleTime: 60 * 1000, // 1 minute
      gcTime: 10 * 60 * 1000, // 10 minutes
    }
  );

  return {
    bookmarks: bookmarksQuery.data?.pages.flatMap((p) => p.items) ?? [],
    isLoading: bookmarksQuery.isLoading,
    isFetchingNextPage: bookmarksQuery.isFetchingNextPage,
    hasNextPage: bookmarksQuery.hasNextPage ?? false,
    fetchNextPage: bookmarksQuery.fetchNextPage,
    error: bookmarksQuery.error,
    refetch: bookmarksQuery.refetch,
  };
}

/**
 * Hook for fetching paginated publications from a creator.
 *
 * Returns all items for this creator in the user's collection, including:
 * - INBOX (not yet bookmarked)
 * - BOOKMARKED
 * - ARCHIVED
 *
 * Supports infinite scroll pagination.
 *
 * @param creatorId - The unique identifier of the creator
 * @param options - Optional configuration
 * @param options.limit - Number of items per page (default: 20)
 * @returns Object with publications array, pagination controls, and states
 */
export function useCreatorPublications(creatorId: string, options?: { limit?: number }) {
  const limit = options?.limit ?? 20;

  const publicationsQuery = trpc.creators.listPublications.useInfiniteQuery(
    { creatorId, limit },
    {
      enabled: !!creatorId,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      staleTime: 60 * 1000, // 1 minute
      gcTime: 10 * 60 * 1000, // 10 minutes
    }
  );

  return {
    publications: publicationsQuery.data?.pages.flatMap((p) => p.items) ?? [],
    isLoading: publicationsQuery.isLoading,
    isFetchingNextPage: publicationsQuery.isFetchingNextPage,
    hasNextPage: publicationsQuery.hasNextPage ?? false,
    fetchNextPage: publicationsQuery.fetchNextPage,
    error: publicationsQuery.error,
    refetch: publicationsQuery.refetch,
  };
}

/**
 * Hook for fetching latest content from a creator's provider.
 *
 * Queries the provider API (e.g., YouTube) to get the creator's most
 * recent published content. Used for discovery and suggestions.
 *
 * The response includes:
 * - items: Array of latest content
 * - provider: Content provider name
 * - cacheStatus: Whether content came from cache
 * - reason: If content can't be fetched, explains why
 * - connectUrl: URL to connect account if needed
 *
 * @param creatorId - The unique identifier of the creator
 * @returns Object with content array, provider info, and states
 *
 * @example
 * ```tsx
 * function CreatorLatestContent({ creatorId }: { creatorId: string }) {
 *   const {
 *     content,
 *     provider,
 *     reason,
 *     connectUrl,
 *     isLoading,
 *   } = useCreatorLatestContent(creatorId);
 *
 *   if (reason) {
 *     return (
 *       <View>
 *         <Text>{reason}</Text>
 *         {connectUrl && <ConnectButton url={connectUrl} />}
 *       </View>
 *     );
 *   }
 *
 *   return (
 *     <FlatList
 *       data={content}
 *       renderItem={({ item }) => <ContentCard item={item} />}
 *     />
 *   );
 * }
 * ```
 */
export function useCreatorLatestContent(creatorId: string) {
  const contentQuery = trpc.creators.fetchLatestContent.useQuery(
    { creatorId },
    {
      enabled: !!creatorId,
      // Match server-side 10min cache for provider API rate limiting
      staleTime: 10 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      // Don't refetch on window focus - expensive API call
      refetchOnWindowFocus: false,
    }
  );

  const data = contentQuery.data as LatestContentResponse | undefined;

  return {
    content: data?.items ?? [],
    provider: data?.provider,
    cacheStatus: data?.cacheStatus,
    reason: data?.reason,
    connectUrl: data?.connectUrl,
    isLoading: contentQuery.isLoading,
    error: contentQuery.error,
    refetch: contentQuery.refetch,
  };
}

/**
 * Hook for managing creator subscription status.
 *
 * Provides both read (subscription status) and write (subscribe action)
 * capabilities. Implements optimistic updates for instant UI feedback.
 *
 * Features:
 * - Immediate UI update on subscribe (optimistic)
 * - Rollback on error
 * - Cache invalidation on success
 *
 * @param creatorId - The unique identifier of the creator
 * @returns Object with subscription status and subscribe function
 *
 * @example
 * ```tsx
 * function SubscribeButton({ creatorId }: { creatorId: string }) {
 *   const {
 *     isSubscribed,
 *     canSubscribe,
 *     reason,
 *     isLoading,
 *     subscribe,
 *     isSubscribing,
 *   } = useCreatorSubscription(creatorId);
 *
 *   if (!canSubscribe) {
 *     return <Text>{reason}</Text>;
 *   }
 *
 *   return (
 *     <Button
 *       onPress={subscribe}
 *       disabled={isSubscribed || isSubscribing}
 *     >
 *       {isSubscribed ? 'Subscribed' : isSubscribing ? 'Subscribing...' : 'Subscribe'}
 *     </Button>
 *   );
 * }
 * ```
 */
export function useCreatorSubscription(creatorId: string) {
  const utils = trpc.useUtils();

  const statusQuery = trpc.creators.checkSubscription.useQuery(
    { creatorId },
    {
      enabled: !!creatorId,
      // Subscription status is fairly stable
      staleTime: 2 * 60 * 1000, // 2 minutes
      gcTime: 10 * 60 * 1000,
    }
  );

  const subscribeMutation = trpc.creators.subscribe.useMutation({
    onMutate: async () => {
      // Cancel any outgoing refetches
      await utils.creators.checkSubscription.cancel({ creatorId });

      // Snapshot the previous value
      const previous = utils.creators.checkSubscription.getData({ creatorId });

      // Optimistically update to subscribed
      utils.creators.checkSubscription.setData({ creatorId }, (old) =>
        old
          ? {
              ...old,
              isSubscribed: true,
              subscribedAt: new Date().toISOString(),
            }
          : undefined
      );

      return { previous };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previous) {
        utils.creators.checkSubscription.setData({ creatorId }, context.previous);
      }
    },
    onSettled: () => {
      // Always refetch after error or success
      utils.creators.checkSubscription.invalidate({ creatorId });
    },
  });

  const data = statusQuery.data as SubscriptionStatus | undefined;

  return {
    isSubscribed: data?.isSubscribed ?? false,
    subscribedAt: data?.subscribedAt ?? null,
    canSubscribe: data?.canSubscribe ?? true,
    reason: data?.reason,
    isLoading: statusQuery.isLoading,
    subscribe: () => subscribeMutation.mutate({ creatorId }),
    isSubscribing: subscribeMutation.isPending,
    error: statusQuery.error ?? subscribeMutation.error,
  };
}
