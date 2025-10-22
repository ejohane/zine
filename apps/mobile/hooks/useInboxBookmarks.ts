import { useQuery } from '@tanstack/react-query';
import { bookmarksApi } from '../lib/api';
import type { Bookmark } from '@zine/shared';
import type { CategoryType } from '../components/CategoryTabs';

interface UseInboxBookmarksOptions {
  filter?: CategoryType;
  enabled?: boolean;
}

export function useInboxBookmarks(options: UseInboxBookmarksOptions = {}) {
  const { filter = 'all', enabled = true } = options;

  return useQuery<Bookmark[], Error>({
    queryKey: ['bookmarks', 'inbox', filter],
    queryFn: async () => {
      // Fetch all active bookmarks
      const allBookmarks = await bookmarksApi.getAll();

      // Handle undefined or non-array responses
      if (!allBookmarks || !Array.isArray(allBookmarks)) {
        console.warn('API returned invalid bookmarks data:', allBookmarks);
        return [];
      }

      // Filter out archived and deleted bookmarks
      let activeBookmarks = allBookmarks.filter(
        (bookmark) => bookmark.status === 'active'
      );

      // Client-side filtering by content type
      if (filter !== 'all') {
        // Map filter to contentType
        const contentTypeMap: Record<CategoryType, string | null> = {
          all: null,
          videos: 'video',
          podcasts: 'podcast',
          articles: 'article',
          posts: 'post',
        };

        const contentType = contentTypeMap[filter];
        if (contentType) {
          activeBookmarks = activeBookmarks.filter(
            (bookmark) => bookmark.contentType === contentType
          );
        }
      }

      // Sort by createdAt (newest first)
      return activeBookmarks.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
    },
    enabled,
    staleTime: 1000 * 60 * 5, // Consider data fresh for 5 minutes
    gcTime: 1000 * 60 * 60 * 24, // Keep in cache for 24 hours
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}
