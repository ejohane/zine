import { useQuery } from '@tanstack/react-query';
import { bookmarksApi } from '../lib/api';
import type { Bookmark } from '@zine/shared';

interface UseTodayBookmarksOptions {
  enabled?: boolean;
}

export function useTodayBookmarks(options: UseTodayBookmarksOptions = {}) {
  const { enabled = true } = options;

  return useQuery<Bookmark[], Error>({
    queryKey: ['bookmarks', 'today'],
    queryFn: async () => {
      // Get all recent bookmarks
      const bookmarks = await bookmarksApi.getRecent(50);
      
      // Handle undefined or non-array responses
      if (!bookmarks || !Array.isArray(bookmarks)) {
        console.warn('API returned invalid bookmarks data:', bookmarks);
        return [];
      }
      
      // Filter for bookmarks created today
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      
      const todayBookmarks = bookmarks.filter((bookmark) => {
        if (!bookmark.createdAt) return false;
        const createdAt = new Date(bookmark.createdAt).getTime();
        return createdAt >= todayStart;
      });
      
      // Sort by createdAt (newest first)
      return todayBookmarks.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
    },
    enabled,
    staleTime: 1000 * 60 * 2, // Consider data fresh for 2 minutes (more frequent for "today" items)
    gcTime: 1000 * 60 * 60 * 24, // Keep in cache for 24 hours for persistence
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}