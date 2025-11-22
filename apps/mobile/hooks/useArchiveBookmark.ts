import { useMutation, useQueryClient } from '@tanstack/react-query';
import { bookmarksApi } from '../lib/api';
import type { Bookmark } from '@zine/shared';

export function useArchiveBookmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (bookmarkId: string) => {
      return bookmarksApi.archive(bookmarkId);
    },
    
    // Optimistic update - immediately remove from inbox
    onMutate: (bookmarkId) => {
      // Cancel outgoing refetches (fire and forget - don't await)
      queryClient.cancelQueries({ queryKey: ['bookmarks', 'inbox'] });

      // Snapshot previous value for rollback
      const previousBookmarks = queryClient.getQueryData<Bookmark[]>(['bookmarks', 'inbox']);

      // Optimistically remove from inbox (filter out archived item)
      queryClient.setQueryData<Bookmark[]>(['bookmarks', 'inbox'], (old) => 
        old?.filter((b) => b.id !== bookmarkId) ?? []
      );

      // Return context for rollback
      return { previousBookmarks, bookmarkId };
    },

    // Rollback on error
    onError: (error, bookmarkId, context) => {
      console.error('Failed to archive bookmark:', error);
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
