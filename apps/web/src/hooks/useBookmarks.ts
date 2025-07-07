import { useQuery } from '@tanstack/react-query';
import { fetchBookmarks } from '../lib/api';

export const useBookmarks = (params?: {
  userId?: string
  status?: string
  source?: string
  contentType?: string
}) => {
  return useQuery({
    queryKey: ['bookmarks', params],
    queryFn: () => fetchBookmarks(params),
  });
};