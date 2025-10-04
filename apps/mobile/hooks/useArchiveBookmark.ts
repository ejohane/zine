import { useMutation, useQueryClient } from '@tanstack/react-query';
import { bookmarksApi } from '../lib/api';
import type { Bookmark } from '@zine/shared';

export function useArchiveBookmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (bookmarkId: string) => {
      return bookmarksApi.archive(bookmarkId);
    },
    onSuccess: (data: Bookmark, bookmarkId: string) => {
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
      queryClient.invalidateQueries({ queryKey: ['bookmarks', bookmarkId] });
      queryClient.invalidateQueries({ queryKey: ['recent-bookmarks'] });
    },
    onError: (error) => {
      console.error('Failed to archive bookmark:', error);
    },
  });
}
