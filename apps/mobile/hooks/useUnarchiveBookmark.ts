import { useMutation, useQueryClient } from '@tanstack/react-query';
import { bookmarksApi } from '../lib/api';
import type { Bookmark } from '@zine/shared';

export function useUnarchiveBookmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (bookmarkId: string) => {
      return bookmarksApi.unarchive(bookmarkId);
    },
    
    // Optimistic update - immediately restore to inbox
    onMutate: async (bookmarkId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['bookmarks', 'inbox'] });

      // Snapshot previous value for rollback
      const previousBookmarks = queryClient.getQueryData<Bookmark[]>(['bookmarks', 'inbox']);

      // Fetch the bookmark data from archive or cache
      const archivedBookmark = queryClient.getQueryData<Bookmark>(['bookmarks', bookmarkId]);

      // Optimistically add back to inbox if we have the bookmark data
      if (archivedBookmark) {
        queryClient.setQueryData<Bookmark[]>(['bookmarks', 'inbox'], (old) => {
          // Add at the beginning to make it visible
          return [archivedBookmark, ...(old ?? [])];
        });
      }

      // Return context for rollback
      return { previousBookmarks, bookmarkId };
    },

    // Rollback on error
    onError: (error, bookmarkId, context) => {
      console.error('Failed to unarchive bookmark:', error);
      if (context?.previousBookmarks) {
        queryClient.setQueryData(['bookmarks', 'inbox'], context.previousBookmarks);
      }
    },

    // Refetch on success to ensure data is in sync
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
      queryClient.invalidateQueries({ queryKey: ['recent-bookmarks'] });
    },
  });
}
