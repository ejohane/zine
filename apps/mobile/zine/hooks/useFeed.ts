import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import { api, FeedCategory } from '@/lib/api'
import { cacheUtils, StorageKeys } from '@/lib/storage'

// Query keys
export const feedKeys = {
  all: ['feed'] as const,
  lists: () => [...feedKeys.all, 'list'] as const,
  list: (filters: any) => [...feedKeys.lists(), filters] as const,
  infinite: (category?: FeedCategory) => [...feedKeys.all, 'infinite', category] as const,
}

// Mock feed data for development
const MOCK_FEED_DATA = {
  items: [
    {
      id: 'f1',
      url: 'https://podcast.example.com/episode-19',
      title: '19 - The Human Edge w. Bethan Winn',
      description: 'A fascinating conversation about the future of human-AI collaboration',
      thumbnailUrl: 'https://picsum.photos/seed/feed1/400/300',
      contentType: 'podcast' as const,
      source: 'The Good Stuff',
      platform: 'spotify',
      creator: { name: 'The Good Stuff Podcast', url: 'https://thegoodstuff.com' },
      podcastMetadata: { duration: 2700, episodeNumber: 19 },
      isRead: false,
      publishedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    },
    {
      id: 'f2',
      url: 'https://youtube.com/watch?v=change',
      title: 'The Hidden Art Of Reinventing Yourself',
      description: 'Matthew McConaughey shares insights on personal transformation',
      thumbnailUrl: 'https://picsum.photos/seed/feed2/400/300',
      contentType: 'video' as const,
      source: 'YouTube',
      platform: 'youtube',
      creator: { name: 'Change Your Reality', url: 'https://youtube.com' },
      videoMetadata: { duration: 1800 },
      isRead: false,
      publishedAt: new Date(Date.now() - 3600000).toISOString(),
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: 'f3',
      url: 'https://medium.com/react-native',
      title: 'Building Performant React Native Apps',
      description: 'Tips and tricks for optimizing React Native performance',
      thumbnailUrl: 'https://picsum.photos/seed/feed3/400/300',
      contentType: 'article' as const,
      source: 'Medium',
      platform: 'medium',
      articleMetadata: { readingTime: 6 },
      isRead: true,
      publishedAt: new Date(Date.now() - 7200000).toISOString(),
      createdAt: new Date(Date.now() - 7200000).toISOString(),
    },
  ],
  hasMore: false,
  total: 3,
  page: 1,
  limit: 20,
}

// Fetch feed items with pagination
export function useFeed(options?: {
  category?: FeedCategory
  page?: number
  limit?: number
}) {
  return useQuery({
    queryKey: feedKeys.list(options || {}),
    queryFn: async () => {
      // TEMPORARY: Return mock data for development
      const USE_MOCK_DATA = true;
      
      if (USE_MOCK_DATA) {
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 300));
        return MOCK_FEED_DATA;
      }
      
      // Try cache first
      const cached = await cacheUtils.getWithExpiry(
        StorageKeys.FEED_CACHE,
        1000 * 60 * 2 // 2 minutes (feed updates more frequently)
      )
      
      if (cached && !options?.page) {
        return cached
      }
      
      // Fetch from API
      const data = await api.feed.getAll(options)
      
      // Cache first page only
      if (!options?.page || options.page === 1) {
        await cacheUtils.saveWithTimestamp(StorageKeys.FEED_CACHE, data)
      }
      
      return data
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
  })
}

// Infinite scroll for feed
export function useInfiniteFeed(category?: FeedCategory) {
  return useInfiniteQuery({
    queryKey: feedKeys.infinite(category),
    queryFn: async ({ pageParam = 1 }) => {
      return api.feed.getAll({
        category,
        page: pageParam,
        limit: 20,
      })
    },
    getNextPageParam: (lastPage: any, allPages) => {
      // Assuming API returns hasMore flag
      if (lastPage?.hasMore) {
        return allPages.length + 1
      }
      return undefined
    },
    initialPageParam: 1,
    staleTime: 1000 * 60 * 2,
  })
}

// Mark feed item as read
export function useMarkAsRead() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (id: string) => api.feed.markAsRead(id),
    onMutate: async (id) => {
      // Optimistically update the feed item
      await queryClient.cancelQueries({ queryKey: feedKeys.lists() })
      
      const previousData = queryClient.getQueryData(feedKeys.lists())
      
      queryClient.setQueriesData(
        { queryKey: feedKeys.lists() },
        (old: any) => {
          if (!old) return old
          return {
            ...old,
            items: old.items?.map((item: any) =>
              item.id === id ? { ...item, isRead: true } : item
            ) || [],
          }
        }
      )
      
      return { previousData }
    },
    onError: (err, _id, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(feedKeys.lists(), context.previousData)
      }
      console.error('Error marking as read:', err)
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: feedKeys.lists() })
    },
  })
}

// Refresh feed (pull to refresh)
export function useRefreshFeed() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async () => {
      // Clear cache first
      await cacheUtils.clearCache()
      
      // Fetch fresh data
      const data = await api.feed.getAll()
      
      // Update cache
      await cacheUtils.saveWithTimestamp(StorageKeys.FEED_CACHE, data)
      
      return data
    },
    onSuccess: (data) => {
      // Update query data
      queryClient.setQueryData(feedKeys.lists(), data)
      queryClient.invalidateQueries({ queryKey: feedKeys.all })
    },
    onError: (error) => {
      console.error('Error refreshing feed:', error)
    },
  })
}