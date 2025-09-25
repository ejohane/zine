import { useQuery, useQueryClient } from '@tanstack/react-query';
import { bookmarksApi } from '../lib/api';
import type { Bookmark } from '@zine/shared';

interface UseRecentBookmarksOptions {
  limit?: number;
  enabled?: boolean;
}

export function useRecentBookmarks(options: UseRecentBookmarksOptions = {}) {
  const { limit = 10, enabled = true } = options;

  return useQuery<Bookmark[], Error>({
    queryKey: ['bookmarks', 'recent', limit],
    queryFn: async () => {
      const bookmarks = await bookmarksApi.getRecent(limit);
      
      // Handle undefined or non-array responses
      if (!bookmarks || !Array.isArray(bookmarks)) {
        console.warn('API returned invalid bookmarks data:', bookmarks);
        return [];
      }
      
      // Sort by createdAt (newest first) - API should already do this, but ensure it
      return bookmarks.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
    },
    enabled,
    staleTime: 1000 * 60 * 5, // Consider data fresh for 5 minutes
    gcTime: 1000 * 60 * 10, // Keep in cache for 10 minutes (formerly cacheTime)
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

// Hook for refreshing recent bookmarks
export function useRefreshRecentBookmarks() {
  const queryClient = useQueryClient();
  
  return () => {
    return queryClient.invalidateQueries({ 
      queryKey: ['bookmarks', 'recent'] 
    });
  };
}