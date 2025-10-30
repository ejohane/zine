import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api';
import type { CreateBookmarkFromContent, CreateBookmarkFromContentResponse } from '@zine/shared';
import type { Bookmark } from '../types/bookmark';

interface UseSaveBookmarkFromContentOptions {
  onSuccess?: (bookmark: Bookmark) => void;
  onDuplicate?: (existingBookmarkId: string) => void;
  onError?: (error: Error) => void;
}

export function useSaveBookmarkFromContent(
  options?: UseSaveBookmarkFromContentOptions
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateBookmarkFromContent) => {
      return apiClient.post<CreateBookmarkFromContentResponse>(
        '/api/v1/bookmarks/from-content',
        payload
      );
    },
    onSuccess: (response) => {
      if (response.duplicate && response.existingBookmarkId) {
        // Handle duplicate case
        options?.onDuplicate?.(response.existingBookmarkId);
      } else {
        // Handle success case - invalidate relevant queries
        queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
        queryClient.invalidateQueries({ queryKey: ['recent-bookmarks'] });
        queryClient.invalidateQueries({ queryKey: ['feed-items'] });
        options?.onSuccess?.(response.data);
      }
    },
    onError: (error: Error) => {
      console.error('Failed to save bookmark from content:', error);
      options?.onError?.(error);
    },
  });
}
