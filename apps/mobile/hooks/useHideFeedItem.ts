import { useMutation, useQueryClient } from '@tanstack/react-query';
import { feedsApi } from '../lib/api';

interface UseHideFeedItemOptions {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

interface FeedResponse {
  feedItems: Array<{
    id: string;
    isRead: boolean;
    readAt?: Date;
    feedItem: any;
  }>;
  pagination: {
    offset: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

export function useHideFeedItem(options?: UseHideFeedItemOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (feedItemId: string) => {
      return feedsApi.hideFeedItem(feedItemId);
    },
    onMutate: async (feedItemId: string) => {
      // Cancel any outgoing refetches to avoid overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey: ['feed-items'] });
      await queryClient.cancelQueries({ queryKey: ['feed'] });

      // Snapshot the previous values for rollback
      const previousFeedItems = queryClient.getQueriesData({ queryKey: ['feed-items'] });
      const previousFeed = queryClient.getQueriesData({ queryKey: ['feed'] });

      // Optimistically update all feed-items queries to remove the hidden item
      queryClient.setQueriesData<FeedResponse>(
        { queryKey: ['feed-items'] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            feedItems: old.feedItems.filter((item) => item.id !== feedItemId),
            pagination: {
              ...old.pagination,
              total: Math.max(0, old.pagination.total - 1),
            },
          };
        }
      );

      // Return context for rollback
      return { previousFeedItems, previousFeed };
    },
    onSuccess: () => {
      // Call the success callback without invalidating (optimistic update already applied)
      options?.onSuccess?.();
    },
    onError: (error: Error, _feedItemId, context) => {
      console.error('Failed to hide feed item:', error);
      
      // Rollback optimistic updates on error
      if (context?.previousFeedItems) {
        context.previousFeedItems.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      if (context?.previousFeed) {
        context.previousFeed.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      
      options?.onError?.(error);
    },
    onSettled: () => {
      // Optionally refetch in the background to ensure consistency
      // This won't show loading states since data is already in cache
      queryClient.invalidateQueries({ 
        queryKey: ['feed-items'],
        refetchType: 'none' // Don't trigger an immediate refetch
      });
    },
  });
}
