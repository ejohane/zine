import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { subscriptionsApi, DiscoveredSubscription, DiscoveryResult, UserSubscription } from '../lib/api';
import { Alert } from 'react-native';

export function useDiscoverSubscriptions(provider: 'spotify' | 'youtube') {
  return useQuery<DiscoveryResult>({
    queryKey: ['subscriptions', 'discover', provider],
    queryFn: () => subscriptionsApi.discover(provider),
    enabled: false,
    staleTime: 5 * 60 * 1000
  });
}

export function useUpdateSubscriptions(provider: 'spotify' | 'youtube') {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (subscriptions: DiscoveredSubscription[]) => 
      subscriptionsApi.update(provider, subscriptions.map(sub => ({
        externalId: sub.externalId,
        title: sub.title,
        creatorName: sub.creatorName,
        description: sub.description,
        thumbnailUrl: sub.thumbnailUrl,
        subscriptionUrl: sub.subscriptionUrl,
        selected: sub.isUserSubscribed,
        totalEpisodes: sub.totalEpisodes
      }))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      Alert.alert('Success', 'Subscriptions updated!');
    },
    onError: (error) => {
      console.error('Failed to update subscriptions:', error);
      Alert.alert('Error', 'Failed to update subscriptions. Please try again.');
    }
  });
}

export function useSubscriptions(provider?: 'spotify' | 'youtube') {
  return useQuery<UserSubscription[]>({
    queryKey: ['subscriptions', 'list', provider],
    queryFn: () => subscriptionsApi.list(provider),
    staleTime: 5 * 60 * 1000
  });
}
