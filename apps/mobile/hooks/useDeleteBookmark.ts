import { useMutation, useQueryClient } from '@tanstack/react-query';
import { bookmarksApi } from '../lib/api';

export function useDeleteBookmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (bookmarkId: string) => {
      return bookmarksApi.delete(bookmarkId);
    },
    onSuccess: (_data, bookmarkId: string) => {
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
      queryClient.invalidateQueries({ queryKey: ['bookmarks', bookmarkId] });
      queryClient.invalidateQueries({ queryKey: ['recent-bookmarks'] });
    },
    onError: (error) => {
      console.error('Failed to delete bookmark:', error);
    },
  });
}
