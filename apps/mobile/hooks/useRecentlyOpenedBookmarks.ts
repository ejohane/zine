import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getRecentBookmarks, syncRecentBookmarksFromStorage } from '../lib/recentBookmarks';
import { bookmarksApi } from '../lib/api';
import type { Bookmark } from '@zine/shared';

export function useRecentlyOpenedBookmarks() {
  const queryClient = useQueryClient();
  
  useEffect(() => {
    let isMounted = true;
    
    async function syncFromServer() {
      try {
        const serverBookmarks = await bookmarksApi.getRecentlyAccessed(4);
        
        if (!isMounted) return;
        
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
        console.error('Background sync failed:', error);
      }
    }
    
    syncFromServer();
    
    return () => {
      isMounted = false;
    };
  }, [queryClient]);
  
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
      
      return localBookmarks;
    },
    staleTime: 1000 * 60 * 5,
    gcTime: Infinity,
  });
}
