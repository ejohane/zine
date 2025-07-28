import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import { useAuth } from '@clerk/clerk-react'
import { 
  fetchFeed,
  fetchSubscriptionsWithCounts,
  markFeedItemAsRead,
  markFeedItemAsUnread,
  saveBookmark,
  type FeedItemWithState,
  type SubscriptionWithUnreadCount,
  type FeedItem,
  type FeedResponse
} from '../lib/api'

interface UseFeedOptions {
  unreadOnly?: boolean
  subscriptionId?: string
  limit?: number
  enabled?: boolean
}

export function useFeed(options: UseFeedOptions = {}) {
  const { getToken } = useAuth()
  const { unreadOnly = false, subscriptionId, limit = 50, enabled = true } = options

  return useInfiniteQuery({
    queryKey: ['feed', { unreadOnly, subscriptionId, limit }],
    queryFn: async ({ pageParam }) => {
      const token = await getToken()
      return fetchFeed(token, {
        unread: unreadOnly,
        subscription: subscriptionId,
        limit,
        offset: pageParam as number
      })
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.pagination.hasMore) {
        return allPages.length * limit
      }
      return undefined
    },
    enabled,
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: false, // Avoid aggressive refetching
  })
}

export function useSubscriptionsWithCounts() {
  const { getToken } = useAuth()

  return useQuery({
    queryKey: ['subscriptions-with-counts'],
    queryFn: async () => {
      const token = await getToken()
      return fetchSubscriptionsWithCounts(token)
    },
    staleTime: 1 * 60 * 1000, // 1 minute
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes for unread counts
  })
}

export function useMarkFeedItemRead() {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (itemId: string) => {
      const token = await getToken()
      return markFeedItemAsRead(itemId, token)
    },
    onMutate: async (itemId) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['feed'] })
      
      // Update all feed queries
      queryClient.setQueriesData({ queryKey: ['feed'] }, (oldData: any) => {
        if (!oldData) return oldData
        
        return {
          ...oldData,
          pages: oldData.pages.map((page: any) => ({
            ...page,
            feedItems: page.feedItems.map((item: FeedItemWithState) => 
              item.id === itemId 
                ? { ...item, isRead: true, readAt: new Date() }
                : item
            )
          }))
        }
      })

      // Update subscription counts
      queryClient.setQueryData(['subscriptions-with-counts'], (oldData: SubscriptionWithUnreadCount[]) => {
        if (!oldData) return oldData
        
        return oldData.map(sub => ({
          ...sub,
          unreadCount: Math.max(0, sub.unreadCount - 1)
        }))
      })
    },
    onError: (error) => {
      // Revert optimistic update
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      queryClient.invalidateQueries({ queryKey: ['subscriptions-with-counts'] })
      console.error('Failed to mark item as read:', error)
    },
    onSettled: () => {
      // Ensure data is fresh
      queryClient.invalidateQueries({ queryKey: ['subscriptions-with-counts'] })
    }
  })
}

export function useMarkFeedItemUnread() {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (itemId: string) => {
      const token = await getToken()
      return markFeedItemAsUnread(itemId, token)
    },
    onMutate: async (itemId) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['feed'] })
      
      // Update all feed queries
      queryClient.setQueriesData({ queryKey: ['feed'] }, (oldData: any) => {
        if (!oldData) return oldData
        
        return {
          ...oldData,
          pages: oldData.pages.map((page: any) => ({
            ...page,
            feedItems: page.feedItems.map((item: FeedItemWithState) => 
              item.id === itemId 
                ? { ...item, isRead: false, readAt: undefined }
                : item
            )
          }))
        }
      })

      // Update subscription counts
      queryClient.setQueryData(['subscriptions-with-counts'], (oldData: SubscriptionWithUnreadCount[]) => {
        if (!oldData) return oldData
        
        return oldData.map(sub => ({
          ...sub,
          unreadCount: sub.unreadCount + 1
        }))
      })
    },
    onError: (error) => {
      // Revert optimistic update
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      queryClient.invalidateQueries({ queryKey: ['subscriptions-with-counts'] })
      console.error('Failed to mark item as unread:', error)
    },
    onSettled: () => {
      // Ensure data is fresh
      queryClient.invalidateQueries({ queryKey: ['subscriptions-with-counts'] })
    }
  })
}

export function useSaveFeedItemToBookmarks() {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (feedItem: FeedItem) => {
      const token = await getToken()
      return saveBookmark({
        url: feedItem.externalUrl,
        notes: `From ${feedItem.subscription.creatorName}: ${feedItem.title}`
      }, token)
    },
    onMutate: async (feedItem) => {
      // Optimistic update - mark as bookmarked in feed
      await queryClient.cancelQueries({ queryKey: ['feed'] })
      
      queryClient.setQueriesData({ queryKey: ['feed'] }, (oldData: any) => {
        if (!oldData) return oldData
        
        return {
          ...oldData,
          pages: oldData.pages.map((page: any) => ({
            ...page,
            feedItems: page.feedItems.map((item: FeedItemWithState) => 
              item.feedItem.id === feedItem.id 
                ? { ...item, bookmarkId: 9999 } // Temporary ID for optimistic update
                : item
            )
          }))
        }
      })
    },
    onSuccess: (bookmark, feedItem) => {
      // Update with real bookmark ID
      queryClient.setQueriesData({ queryKey: ['feed'] }, (oldData: any) => {
        if (!oldData) return oldData
        
        return {
          ...oldData,
          pages: oldData.pages.map((page: any) => ({
            ...page,
            feedItems: page.feedItems.map((item: FeedItemWithState) => 
              item.feedItem.id === feedItem.id 
                ? { ...item, bookmarkId: bookmark.id }
                : item
            )
          }))
        }
      })
      
      // Invalidate bookmarks to show new bookmark
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] })
    },
    onError: (error, feedItem) => {
      // Revert optimistic update
      queryClient.setQueriesData({ queryKey: ['feed'] }, (oldData: any) => {
        if (!oldData) return oldData
        
        return {
          ...oldData,
          pages: oldData.pages.map((page: any) => ({
            ...page,
            feedItems: page.feedItems.map((item: FeedItemWithState) => 
              item.feedItem.id === feedItem.id 
                ? { ...item, bookmarkId: undefined }
                : item
            )
          }))
        }
      })
      console.error('Failed to save feed item to bookmarks:', error)
    }
  })
}

// Combined hook for the main feed interface
export function useFeedManager(options: UseFeedOptions = {}) {
  const feed = useFeed(options)
  const subscriptions = useSubscriptionsWithCounts()
  const markRead = useMarkFeedItemRead()
  const markUnread = useMarkFeedItemUnread()
  const saveToBookmarks = useSaveFeedItemToBookmarks()

  // Flatten all pages into a single array
  const feedItems = feed.data?.pages.flatMap((page: FeedResponse) => page.feedItems) || []
  
  return {
    // Data
    feedItems,
    subscriptions: subscriptions.data || [],
    
    // Loading states
    isLoading: feed.isLoading,
    isLoadingSubscriptions: subscriptions.isLoading,
    isLoadingMore: feed.isFetchingNextPage,
    
    // Error states
    error: feed.error,
    subscriptionsError: subscriptions.error,
    
    // Pagination
    hasMore: feed.hasNextPage,
    loadMore: feed.fetchNextPage,
    
    // Actions
    markAsRead: markRead.mutate,
    markAsUnread: markUnread.mutate,
    saveToBookmarks: saveToBookmarks.mutate,
    
    // Action states
    isMarkingRead: markRead.isPending,
    isMarkingUnread: markUnread.isPending,
    isSavingToBookmarks: saveToBookmarks.isPending,
    
    // Refetch
    refetch: feed.refetch,
    refetchSubscriptions: subscriptions.refetch
  }
}