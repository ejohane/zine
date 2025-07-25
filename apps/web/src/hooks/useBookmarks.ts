import { useQuery } from '@tanstack/react-query';
import { fetchBookmarks } from '../lib/api';
import { useAuth } from '../lib/auth';

export const useBookmarks = (params?: {
  status?: string
  source?: string
  contentType?: string
}) => {
  const { getToken, isAuthenticated, signOut } = useAuth();

  return useQuery({
    queryKey: ['bookmarks', params],
    queryFn: async () => {
      try {
        const token = await getToken();
        return fetchBookmarks(token, params);
      } catch (error) {
        if (error instanceof Error && error.message === 'UNAUTHORIZED') {
          // Sign out user on authentication failure
          await signOut();
          throw new Error('Session expired. Please sign in again.');
        }
        throw error;
      }
    },
    enabled: isAuthenticated, // Only fetch when authenticated
    retry: (failureCount, error) => {
      // Don't retry on auth errors
      if (error instanceof Error && error.message.includes('Session expired')) {
        return false;
      }
      return failureCount < 3;
    },
  });
};