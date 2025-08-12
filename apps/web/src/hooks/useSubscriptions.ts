import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/clerk-react'
import { 
  discoverSubscriptions, 
  fetchUserSubscriptions, 
  updateSubscriptions,
  type SubscriptionUpdateRequest
} from '../lib/api'

export function useSubscriptionDiscovery(provider: 'spotify' | 'youtube') {
  const { getToken } = useAuth()

  return useQuery({
    queryKey: ['subscription-discovery', provider],
    queryFn: async () => {
      const token = await getToken()
      return discoverSubscriptions(provider, token)
    },
    enabled: false, // Only run when manually triggered
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false // Don't auto-retry, user needs to trigger manually
  })
}

export function useUserSubscriptions(provider?: string) {
  const { getToken } = useAuth()

  return useQuery({
    queryKey: ['user-subscriptions', provider],
    queryFn: async () => {
      const token = await getToken()
      return fetchUserSubscriptions(token, provider)
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  })
}

export function useUpdateSubscriptions() {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ 
      provider, 
      subscriptions 
    }: { 
      provider: 'spotify' | 'youtube'
      subscriptions: SubscriptionUpdateRequest[] 
    }) => {
      const token = await getToken()
      return updateSubscriptions(provider, subscriptions, token)
    },
    onSuccess: (_, variables) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['user-subscriptions'] })
      queryClient.invalidateQueries({ queryKey: ['user-subscriptions', variables.provider] })
      queryClient.invalidateQueries({ queryKey: ['subscription-discovery', variables.provider] })
      // Invalidate feed queries to show new episodes
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      queryClient.invalidateQueries({ queryKey: ['subscriptions-with-counts'] })
    },
    onError: (error) => {
      console.error('Failed to update subscriptions:', error)
    }
  })
}

// Combined hook for managing a specific provider's subscriptions
export function useProviderSubscriptions(provider: 'spotify' | 'youtube') {
  const discovery = useSubscriptionDiscovery(provider)
  const userSubscriptions = useUserSubscriptions(provider)
  const updateMutation = useUpdateSubscriptions()

  const discover = () => discovery.refetch()
  
  const updateSelections = (subscriptions: SubscriptionUpdateRequest[]) => {
    return updateMutation.mutateAsync({ provider, subscriptions })
  }

  return {
    // Discovery data
    discoveredSubscriptions: discovery.data?.subscriptions || [],
    totalFound: discovery.data?.totalFound || 0,
    
    // User's current subscriptions
    userSubscriptions: userSubscriptions.data || [],
    
    // Loading states
    isDiscovering: discovery.isFetching,
    isLoadingUserSubscriptions: userSubscriptions.isLoading,
    isUpdating: updateMutation.isPending,
    
    // Error states
    discoveryError: discovery.error,
    userSubscriptionsError: userSubscriptions.error,
    updateError: updateMutation.error,
    
    // Actions
    discover,
    updateSelections,
    
    // Refetch functions
    refetchUserSubscriptions: userSubscriptions.refetch,
    refetchDiscovery: discovery.refetch
  }
}