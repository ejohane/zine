import { useMutation, useQueryClient } from '@tanstack/react-query';
import { feedsApi } from '../lib/api';

interface UseHideFeedItemOptions {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export function useHideFeedItem(options?: UseHideFeedItemOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (feedItemId: string) => {
      return feedsApi.hideFeedItem(feedItemId);
    },
    onSuccess: () => {
      // Invalidate feed items query to remove hidden item from UI
      queryClient.invalidateQueries({ queryKey: ['feed-items'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      options?.onSuccess?.();
    },
    onError: (error: Error) => {
      console.error('Failed to hide feed item:', error);
      options?.onError?.(error);
    },
  });
}
