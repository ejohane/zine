import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../contexts/auth';
import type { Bookmark } from '@zine/shared';

interface UseBookmarkDetailOptions {
  enabled?: boolean;
}

export function useBookmarkDetail(
  bookmarkId: string | undefined,
  options?: UseBookmarkDetailOptions
) {
  const { getToken, isSignedIn } = useAuth();

  return useQuery<Bookmark>({
    queryKey: ['bookmark', bookmarkId],
    queryFn: async () => {
      if (!bookmarkId) {
        throw new Error('Bookmark ID is missing');
      }
      const token = await getToken();
      if (!token) {
        throw new Error('Authentication token is missing');
      }
      return api.getBookmark(bookmarkId, token);
    },
    enabled: options?.enabled !== false && isSignedIn && !!bookmarkId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });
}