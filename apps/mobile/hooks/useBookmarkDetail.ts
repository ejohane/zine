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

  return useQuery<Bookmark | null>({
    queryKey: ['bookmarks', bookmarkId],
    queryFn: async () => {
      try {
        if (!bookmarkId) {
          console.warn('Bookmark ID is missing');
          return null;
        }
        const token = await getToken();
        if (!token) {
          console.warn('Authentication token is missing');
          return null;
        }
        const result = await api.getBookmark(bookmarkId, token);
        return result || null;
      } catch (error) {
        console.error('Failed to fetch bookmark detail:', error);
        return null;
      }
    },
    enabled: options?.enabled !== false && isSignedIn && !!bookmarkId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 1000 * 60 * 60 * 24, // Keep in cache for 24 hours for persistence
    retry: 2,
  });
}