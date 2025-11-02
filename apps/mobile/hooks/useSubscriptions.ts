import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { subscriptionsApi, DiscoveredSubscription, DiscoveryResult, UserSubscription } from '../lib/api';
import { Alert, Platform, ToastAndroid } from 'react-native';
import { useRef, useCallback, useEffect } from 'react';

export function useDiscoverSubscriptions(provider: 'spotify' | 'youtube', autoFetch = false) {
  return useQuery<DiscoveryResult>({
    queryKey: ['subscriptions', 'discover', provider],
    queryFn: () => subscriptionsApi.discover(provider),
    enabled: autoFetch,
    staleTime: 5 * 60 * 1000,
    retry: 1
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
      queryClient.invalidateQueries({ queryKey: ['feed-items'] });
    },
    onError: (error) => {
      console.error('Failed to update subscriptions:', error);
      Alert.alert('Error', 'Failed to update subscriptions. Please try again.');
    }
  });
}

/**
 * Show a toast message (platform-specific)
 */
function showToast(message: string) {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    // For iOS, use Alert as fallback (you could use a library like react-native-toast-message)
    Alert.alert('Error', message);
  }
}

/**
 * Hook for batched, optimistic subscription updates with debouncing and error rollback
 */
export function useBatchedSubscriptionUpdates(
  provider: 'spotify' | 'youtube',
  onBatchStart?: () => void,
  onBatchComplete?: () => void,
  onBatchError?: (previousState: DiscoveredSubscription[]) => void
) {
  const updateMutation = useUpdateSubscriptions(provider);
  const pendingUpdateRef = useRef<DiscoveredSubscription[] | null>(null);
  const previousStateRef = useRef<DiscoveredSubscription[] | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isBatchingRef = useRef(false);

  // Debounce delay in milliseconds (1 second after last change)
  const DEBOUNCE_DELAY = 1000;

  const executeBatch = useCallback(async () => {
    if (!pendingUpdateRef.current) return;

    const subscriptionsToUpdate = pendingUpdateRef.current;
    const previousState = previousStateRef.current;
    pendingUpdateRef.current = null;
    isBatchingRef.current = true;

    try {
      onBatchStart?.();
      await updateMutation.mutateAsync(subscriptionsToUpdate);
      onBatchComplete?.();
      // Clear previous state after successful save
      previousStateRef.current = null;
    } catch (error) {
      console.error('Batch update failed:', error);
      showToast('Failed to save subscriptions. Changes reverted.');
      
      // Rollback to previous state
      if (previousState && onBatchError) {
        onBatchError(previousState);
      }
    } finally {
      isBatchingRef.current = false;
    }
  }, [updateMutation, onBatchStart, onBatchComplete, onBatchError]);

  const scheduleBatchUpdate = useCallback((subscriptions: DiscoveredSubscription[], previousState?: DiscoveredSubscription[]) => {
    // Store the latest state
    pendingUpdateRef.current = subscriptions;
    
    // Store the previous state for rollback (only on first change in batch)
    if (!previousStateRef.current && previousState) {
      previousStateRef.current = previousState;
    }

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Schedule new batch execution
    timeoutRef.current = setTimeout(() => {
      executeBatch();
    }, DEBOUNCE_DELAY);
  }, [executeBatch]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      // Execute any pending updates on unmount
      if (pendingUpdateRef.current && !isBatchingRef.current) {
        executeBatch();
      }
    };
  }, [executeBatch]);

  return {
    scheduleBatchUpdate,
    isBatching: updateMutation.isPending,
    hasPendingUpdates: pendingUpdateRef.current !== null
  };
}

export function useSubscriptions(provider?: 'spotify' | 'youtube') {
  return useQuery<UserSubscription[]>({
    queryKey: ['subscriptions', 'list', provider],
    queryFn: () => subscriptionsApi.list(provider),
    staleTime: 5 * 60 * 1000
  });
}
