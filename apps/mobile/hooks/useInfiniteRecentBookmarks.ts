import { useInfiniteQuery } from '@tanstack/react-query';
import { bookmarksApi } from '../lib/api';
import type { Bookmark } from '@zine/shared';

interface UseInfiniteRecentBookmarksOptions {
  limit?: number;
  enabled?: boolean;
}

export function useInfiniteRecentBookmarks(options: UseInfiniteRecentBookmarksOptions = {}) {
  const { limit = 20, enabled = true } = options;

  return useInfiniteQuery({
    queryKey: ['bookmarks', 'recent', 'infinite', limit],
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      const bookmarks = await bookmarksApi.getRecent(limit, pageParam);
      
      if (!bookmarks || !Array.isArray(bookmarks)) {
        console.warn('API returned invalid bookmarks data:', bookmarks);
        return [];
      }
      
      return bookmarks.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < limit) return undefined;
      return allPages.length * limit;
    },
    enabled,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60 * 24,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}
