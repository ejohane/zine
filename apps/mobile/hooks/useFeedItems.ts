import { useQuery } from '@tanstack/react-query';
import { authenticatedFetch } from '../lib/api';
import { useAuth } from '../contexts/auth';

interface FeedItem {
  id: string;
  contentId?: string;
  title: string;
  externalUrl: string;
  thumbnailUrl?: string | null;
  publishedAt: string;
  contentType?: string;
  durationSeconds?: number | null;
  subscription: {
    id: string;
    providerId: string;
    externalId: string;
    title: string;
    creatorName: string;
    thumbnailUrl?: string | null;
  };
}

interface FeedItemWithState {
  id: string;
  isRead: boolean;
  readAt?: Date;
  feedItem: FeedItem;
}

interface FeedResponse {
  feedItems: FeedItemWithState[];
  pagination: {
    offset: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

interface UseFeedItemsOptions {
  enabled?: boolean;
  limit?: number;
  unreadOnly?: boolean;
}

export function useFeedItems(options: UseFeedItemsOptions = {}) {
  const { isSignedIn } = useAuth();
  const { enabled = true, limit = 10, unreadOnly = true } = options;

  return useQuery({
    queryKey: ['feed-items', { limit, unreadOnly }],
    queryFn: async (): Promise<FeedResponse> => {
      const params: string[] = [];
      params.push(`limit=${limit}`);
      params.push('offset=0');
      if (unreadOnly) {
        params.push('unread=true');
      }

      const queryString = params.join('&');
      const response = await authenticatedFetch(`/api/v1/feed?${queryString}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch feed items');
      }

      return response.json();
    },
    enabled: enabled && isSignedIn,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
