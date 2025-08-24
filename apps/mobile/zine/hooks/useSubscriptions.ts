import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, Platform } from '@/lib/api'
import { cacheUtils, StorageKeys } from '@/lib/storage'

// Query keys
export const subscriptionKeys = {
  all: ['subscriptions'] as const,
  lists: () => [...subscriptionKeys.all, 'list'] as const,
  list: (filters: any) => [...subscriptionKeys.lists(), filters] as const,
  details: () => [...subscriptionKeys.all, 'detail'] as const,
  detail: (id: string) => [...subscriptionKeys.details(), id] as const,
}

// Fetch subscriptions
export function useSubscriptions(options?: {
  platform?: Platform
  search?: string
}) {
  return useQuery({
    queryKey: subscriptionKeys.list(options || {}),
    queryFn: async () => {
      // Try cache first
      const cached = await cacheUtils.getWithExpiry(
        StorageKeys.SUBSCRIPTIONS_CACHE,
        1000 * 60 * 10 // 10 minutes
      )
      
      if (cached && !options?.search) {
        return cached
      }
      
      // Fetch from API
      const data = await api.subscriptions.getAll(options)
      
      // Cache if no search
      if (!options?.search) {
        await cacheUtils.saveWithTimestamp(StorageKeys.SUBSCRIPTIONS_CACHE, data)
      }
      
      return data
    },
    staleTime: 1000 * 60 * 10, // 10 minutes
  })
}

// Fetch single subscription
export function useSubscription(id: string) {
  return useQuery({
    queryKey: subscriptionKeys.detail(id),
    queryFn: () => api.subscriptions.getById(id),
    enabled: !!id,
  })
}

// Subscribe mutation
export function useSubscribe() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (data: {
      url?: string
      platform: Platform
      externalId?: string
      name: string
    }) => api.subscriptions.subscribe(data),
    onSuccess: async () => {
      // Invalidate subscriptions list
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.lists() })
      // Clear cache
      await cacheUtils.clearCache()
    },
    onError: (error) => {
      console.error('Error subscribing:', error)
    },
  })
}

// Unsubscribe mutation
export function useUnsubscribe() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (id: string) => api.subscriptions.unsubscribe(id),
    onMutate: async (id) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: subscriptionKeys.lists() })
      
      // Snapshot previous value
      const previousSubscriptions = queryClient.getQueryData(subscriptionKeys.lists())
      
      // Optimistically remove from list
      queryClient.setQueryData(subscriptionKeys.lists(), (old: any) => {
        if (!old) return old
        return {
          ...old,
          items: old.items?.filter((item: any) => item.id !== id) || [],
        }
      })
      
      return { previousSubscriptions }
    },
    onError: (err, _id, context) => {
      // Rollback on error
      if (context?.previousSubscriptions) {
        queryClient.setQueryData(subscriptionKeys.lists(), context.previousSubscriptions)
      }
      console.error('Error unsubscribing:', err)
    },
    onSettled: async () => {
      // Refetch after mutation
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.lists() })
      // Clear cache
      await cacheUtils.clearCache()
    },
  })
}

// Discover subscriptions (suggestions)
export function useDiscoverSubscriptions(platform?: Platform) {
  return useQuery({
    queryKey: ['discover', 'subscriptions', platform],
    queryFn: async () => {
      // This would be a different endpoint for suggestions
      // For now, using the same endpoint with a filter
      return api.subscriptions.getAll({ platform })
    },
    staleTime: 1000 * 60 * 30, // 30 minutes (suggestions don't change often)
  })
}