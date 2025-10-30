import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authenticatedFetch } from '../lib/api';

interface UseMarkFeedItemReadOptions {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export function useMarkFeedItemRead(options?: UseMarkFeedItemReadOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (feedItemId: string) => {
      const response = await authenticatedFetch(`/api/v1/feed/${feedItemId}/read`, {
        method: 'PUT',
      });

      if (!response.ok) {
        throw new Error('Failed to mark feed item as read');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate feed items query to update UI
      queryClient.invalidateQueries({ queryKey: ['feed-items'] });
      options?.onSuccess?.();
    },
    onError: (error: Error) => {
      console.error('Failed to mark feed item as read:', error);
      options?.onError?.(error);
    },
  });
}
