import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { accountsApi, ConnectedAccount } from '../lib/api';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Alert } from 'react-native';

// Complete the auth session to ensure browsers close properly on mobile
WebBrowser.maybeCompleteAuthSession();

export function useAccounts() {
  const queryClient = useQueryClient();

  const {
    data: accounts = [],
    isLoading,
    error,
    refetch
  } = useQuery<ConnectedAccount[]>({
    queryKey: ['accounts'],
    queryFn: async () => {
      try {
        const result = await accountsApi.fetchAccounts();
        // Ensure we always return an array
        return result || [];
      } catch (error) {
        console.error('Failed to fetch accounts:', error);
        // Always return an array, never undefined
        return [];
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 1000 * 60 * 60 * 24, // Keep in cache for 24 hours for persistence
    retry: 2,
  });

  const connectMutation = useMutation({
    mutationFn: async ({ provider }: { provider: 'spotify' | 'youtube' }) => {
      try {
        // Get the redirect URL for OAuth callback
        const redirectUrl = AuthSession.makeRedirectUri({
          scheme: 'zine',
          path: 'oauth-callback'
        });

        // Get the auth URL from the API
        const authUrl = await accountsApi.connectAccount(provider, redirectUrl);
        
        // Open the OAuth flow in a web browser
        const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
        
        if (result.type === 'success' && result.url) {
          // The OAuth flow completed successfully
          // The callback URL contains the auth result
          // Refetch accounts to get the updated connection status
          await queryClient.invalidateQueries({ queryKey: ['accounts'] });
          return { success: true };
        } else if (result.type === 'cancel') {
          // User cancelled the auth flow
          return { success: false, cancelled: true };
        } else {
          // Auth flow failed
          throw new Error('Authentication failed');
        }
      } catch (error) {
        console.error('Failed to connect account:', error);
        throw error;
      }
    },
    onSuccess: (result) => {
      if (result?.success) {
        Alert.alert('Success', 'Account connected successfully!');
      }
    },
    onError: (error) => {
      console.error('Failed to connect account:', error);
      Alert.alert('Error', 'Failed to connect account. Please try again.');
    }
  });

  const disconnectMutation = useMutation({
    mutationFn: async (provider: 'spotify' | 'youtube') => {
      await accountsApi.disconnectAccount(provider);
    },
    onSuccess: () => {
      // Invalidate and refetch accounts
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      Alert.alert('Success', 'Account disconnected successfully!');
    },
    onError: (error) => {
      console.error('Failed to disconnect account:', error);
      Alert.alert('Error', 'Failed to disconnect account. Please try again.');
    }
  });

  // Helper function to check if a specific provider is connected
  const isProviderConnected = (provider: 'spotify' | 'youtube'): boolean => {
    return accounts.some(account => account.provider === provider && account.isConnected);
  };

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
    disconnectError: disconnectMutation.error,
    isSpotifyConnected: isProviderConnected('spotify'),
    isYouTubeConnected: isProviderConnected('youtube'),
  };
}