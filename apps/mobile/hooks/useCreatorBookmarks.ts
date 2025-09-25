import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../contexts/auth';

export function useCreatorBookmarks(creatorId: string | undefined, page: number = 1, limit: number = 20) {
  const { getToken, isSignedIn } = useAuth();
  
  return useQuery({
    queryKey: ['creator-bookmarks', creatorId, page, limit],
    queryFn: async () => {
      const token = await getToken();
      if (!token || !creatorId) throw new Error('Missing requirements');
      return api.getBookmarksByCreatorWithDetails(creatorId, token, page, limit);
    },
    enabled: isSignedIn && !!creatorId,
  });
}