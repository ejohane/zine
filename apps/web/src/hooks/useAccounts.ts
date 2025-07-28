import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/clerk-react'
import { fetchAccounts, connectAccount, disconnectAccount } from '../lib/api'

export function useAccounts() {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()

  const {
    data: accounts = [],
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const token = await getToken()
      return fetchAccounts(token)
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  const connectMutation = useMutation({
    mutationFn: async ({ provider, redirectUrl }: { provider: string; redirectUrl?: string }) => {
      const token = await getToken()
      const authUrl = await connectAccount(provider, token, redirectUrl)
      
      // Redirect to OAuth provider
      window.location.href = authUrl
      
      return authUrl
    },
    onError: (error) => {
      console.error('Failed to connect account:', error)
    }
  })

  const disconnectMutation = useMutation({
    mutationFn: async (provider: string) => {
      const token = await getToken()
      await disconnectAccount(provider, token)
    },
    onSuccess: () => {
      // Invalidate and refetch accounts
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    },
    onError: (error) => {
      console.error('Failed to disconnect account:', error)
    }
  })

  return {
    accounts,
    isLoading,
    error,
    refetch,
    connect: connectMutation.mutate,
    disconnect: disconnectMutation.mutate,
    isConnecting: connectMutation.isPending,
    isDisconnecting: disconnectMutation.isPending,
    connectError: connectMutation.error,
    disconnectError: disconnectMutation.error
  }
}