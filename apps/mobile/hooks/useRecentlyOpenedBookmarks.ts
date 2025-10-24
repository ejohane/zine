import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getRecentBookmarks, syncRecentBookmarksFromStorage } from '../lib/recentBookmarks';
import { bookmarksApi } from '../lib/api';
import type { Bookmark } from '@zine/shared';
import type { QueryClient } from '@tanstack/react-query';

async function syncRecentBookmarksFromServer(
  queryClient: QueryClient
): Promise<void> {
  try {
    const serverBookmarks = await bookmarksApi.getRecentlyAccessed(4);
    
    if (serverBookmarks.length >= 4) {
      const recentItems = serverBookmarks.map(b => ({
        bookmarkId: b.id,
        openedAt: b.lastAccessedAt || Date.now(),
      }));
      
      await syncRecentBookmarksFromStorage({ bookmarks: recentItems });
      
      queryClient.invalidateQueries({ 
        queryKey: ['recently-opened-bookmarks'] 
      });
    }
  } catch (error) {
    console.error('Server sync failed:', error);
  }
}

export function useRecentlyOpenedBookmarks() {
  const queryClient = useQueryClient();
  
  return useQuery({
    queryKey: ['recently-opened-bookmarks'],
    queryFn: async () => {
      const recentIds = await getRecentBookmarks();
      
      if (recentIds.length < 4) {
        return [];
      }
      
      const allBookmarks = await bookmarksApi.getAll();
      
      const localBookmarks = recentIds
        .map(recent => allBookmarks.find(b => b.id === recent.bookmarkId))
        .filter((b): b is Bookmark => b !== undefined);
      
      syncRecentBookmarksFromServer(queryClient).catch(error => {
        console.error('Background sync failed:', error);
      });
      
      return localBookmarks;
    },
    staleTime: 0,
    gcTime: Infinity,
  });
}
