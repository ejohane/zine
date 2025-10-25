import { useQuery } from '@tanstack/react-query';
import { bookmarksApi } from '../lib/api';

export function useRecentlyOpenedBookmarks() {
  return useQuery({
    queryKey: ['recently-opened-bookmarks'],
    queryFn: async () => {
      console.log('[RecentlyOpened] Fetching from server...');
      const bookmarks = await bookmarksApi.getRecentlyAccessed(4);
      console.log('[RecentlyOpened] Server returned:', bookmarks.length, 'bookmarks');

      // Only show section if we have at least 4 bookmarks
      if (bookmarks.length < 4) {
        console.log('[RecentlyOpened] Hiding section - need 4 bookmarks, got', bookmarks.length);
        return [];
      }

      console.log('[RecentlyOpened] Showing section with', bookmarks.length, 'bookmarks');
      return bookmarks;
    },
    staleTime: 1000 * 60 * 2, // Consider stale after 2 minutes
    gcTime: 1000 * 60 * 10, // Keep in cache for 10 minutes
  });
}
