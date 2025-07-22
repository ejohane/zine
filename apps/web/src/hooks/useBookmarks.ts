import { useQuery } from '@tanstack/react-query';
import { fetchBookmarks } from '../lib/api';

export const useBookmarks = (params?: {
  status?: string
  source?: string
  contentType?: string
}) => {
  return useQuery({
    queryKey: ['bookmarks', params],
    queryFn: async () => {
      return fetchBookmarks(null, params);
    },
    enabled: true, // Always enabled since we removed auth
  });
};