import { useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../lib/api';
import { useAuth } from '../contexts/auth';
import type { Bookmark } from '../types/bookmark';

interface UseBookmarkDetailOptions {
  enabled?: boolean;
}

// Cache key prefix for offline article content
const ARTICLE_CACHE_PREFIX = 'article_content_';

// Helper to get cached article content
async function getCachedArticle(bookmarkId: string): Promise<Bookmark | null> {
  try {
    const cached = await AsyncStorage.getItem(`${ARTICLE_CACHE_PREFIX}${bookmarkId}`);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (error) {
    console.error('Failed to read cached article:', error);
  }
  return null;
}

// Helper to cache article content
async function cacheArticle(bookmark: Bookmark): Promise<void> {
  try {
    // Only cache articles with full text content
    if (bookmark.contentType === 'article' && bookmark.fullTextContent) {
      await AsyncStorage.setItem(
        `${ARTICLE_CACHE_PREFIX}${bookmark.id}`,
        JSON.stringify(bookmark)
      );
    }
  } catch (error) {
    console.error('Failed to cache article:', error);
  }
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

        // Try to fetch from API
        try {
          const result = await api.getBookmark(bookmarkId, token);
          if (result) {
            // Cache the article for offline reading
            await cacheArticle(result);
            return result;
          }
        } catch (apiError) {
          console.warn('API fetch failed, trying cache:', apiError);
          // If API fails, try to load from cache
          const cached = await getCachedArticle(bookmarkId);
          if (cached) {
            console.log('Loaded article from offline cache');
            return cached;
          }
          // Re-throw if no cache available
          throw apiError;
        }

        return null;
      } catch (error) {
        console.error('Failed to fetch bookmark detail:', error);
        // Last resort: try cache one more time
        if (bookmarkId) {
          const cached = await getCachedArticle(bookmarkId);
          if (cached) {
            console.log('Loaded article from offline cache (fallback)');
            return cached;
          }
        }
        return null;
      }
    },
    enabled: options?.enabled !== false && isSignedIn && !!bookmarkId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 1000 * 60 * 60 * 24, // Keep in cache for 24 hours for persistence
    retry: 2,
  });
}
