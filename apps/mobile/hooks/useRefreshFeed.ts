import { useMutation } from '@tanstack/react-query';
import { subscriptionsApi } from '../lib/api';

export function useRefreshFeed() {
  return useMutation({
    mutationFn: async () => {
      return subscriptionsApi.refresh();
    },
    onSuccess: () => {
      console.log('Feed refresh triggered successfully');
    },
    onError: (error: any) => {
      // Handle rate limiting gracefully
      if (error?.status === 429) {
        console.log('Feed refresh rate limited - will retry later');
      } else {
        console.error('Failed to refresh feed:', error);
      }
    },
  });
}
