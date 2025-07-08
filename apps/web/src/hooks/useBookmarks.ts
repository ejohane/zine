import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { fetchBookmarks } from '../lib/api';

export const useBookmarks = (params?: {
  status?: string
  source?: string
  contentType?: string
}) => {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ['bookmarks', params],
    queryFn: async () => {
      const token = await getToken();
      return fetchBookmarks(token, params);
    },
    enabled: isSignedIn, // Only fetch when user is signed in
  });
};