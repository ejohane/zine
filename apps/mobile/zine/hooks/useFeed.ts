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

// Fetch feed items with pagination
export function useFeed(options?: {
  category?: FeedCategory
  page?: number
  limit?: number
}) {
  return useQuery({
    queryKey: feedKeys.list(options || {}),
    queryFn: async () => {
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