import { useQuery } from '@tanstack/react-query';
import { fetchBookmarks } from '../lib/api';

export const useBookmarks = () => {
  return useQuery({
    queryKey: ['bookmarks'],
    queryFn: fetchBookmarks,
  });
};