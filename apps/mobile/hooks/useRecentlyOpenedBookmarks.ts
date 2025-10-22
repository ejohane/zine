import { useQuery } from '@tanstack/react-query';
import { getRecentBookmarks } from '../lib/recentBookmarks';
import { bookmarksApi } from '../lib/api';
import type { Bookmark } from '@zine/shared';

export function useRecentlyOpenedBookmarks() {
  return useQuery({
    queryKey: ['recently-opened-bookmarks'],
    queryFn: async () => {
      const recentIds = await getRecentBookmarks();
      
      if (recentIds.length < 4) {
        return [];
      }
      
      const allBookmarks = await bookmarksApi.getAll();
      
      const recentBookmarks = recentIds
        .map(recent => allBookmarks.find(b => b.id === recent.bookmarkId))
        .filter((b): b is Bookmark => b !== undefined);
      
      return recentBookmarks;
    },
    staleTime: 0,
  });
}
