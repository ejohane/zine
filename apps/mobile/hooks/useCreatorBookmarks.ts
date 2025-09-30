import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../contexts/auth';

export function useCreatorBookmarks(creatorId: string | undefined, page: number = 1, limit: number = 20) {
  const { getToken, isSignedIn } = useAuth();
  
  return useQuery({
    queryKey: ['creator-bookmarks', creatorId, page, limit],
    queryFn: async () => {
      try {
        const token = await getToken();
        if (!token || !creatorId) {
          // Return empty result instead of throwing
          return {
            creator: null,
            bookmarks: [],
            totalCount: 0,
            page: 1,
            limit: 20,
            hasNextPage: false,
            hasPreviousPage: false,
            totalPages: 0
          };
        }
        const result = await api.getBookmarksByCreatorWithDetails(creatorId, token, page, limit);
        // Ensure we return a valid object
        return result || {
          creator: null,
          bookmarks: [],
          totalCount: 0,
          page: 1,
          limit: 20,
          hasNextPage: false,
          hasPreviousPage: false,
          totalPages: 0
        };
      } catch (error) {
        console.error('Failed to fetch creator bookmarks:', error);
        // Return empty result on error
        return {
          creator: null,
          bookmarks: [],
          totalCount: 0,
          page: 1,
          limit: 20,
          hasNextPage: false,
          hasPreviousPage: false,
          totalPages: 0
        };
      }
    },
    enabled: isSignedIn && !!creatorId,
  });
}