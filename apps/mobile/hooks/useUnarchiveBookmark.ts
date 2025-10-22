import { useMutation, useQueryClient } from '@tanstack/react-query';
import { bookmarksApi } from '../lib/api';
import type { Bookmark } from '@zine/shared';

export function useUnarchiveBookmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (bookmarkId: string) => {
      return bookmarksApi.unarchive(bookmarkId);
    },
    onSuccess: (data: Bookmark, bookmarkId: string) => {
      // Invalidate all bookmark-related queries to refresh the list
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
      queryClient.invalidateQueries({ queryKey: ['bookmarks', bookmarkId] });
      queryClient.invalidateQueries({ queryKey: ['recent-bookmarks'] });
    },
    onError: (error) => {
      console.error('Failed to unarchive bookmark:', error);
    },
  });
}
