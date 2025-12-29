/**
 * Offline Mutation Hook
 *
 * Wraps any mutation to make it offline-capable by checking network status
 * and either executing directly or queuing for later processing.
 *
 * @see Frontend Spec Section 9.4 for detailed requirements
 *
 * Features:
 * - Checks online status before executing mutations
 * - Queues mutations via offlineQueue when offline
 * - Calls onOptimisticUpdate before executing/queuing for immediate UI feedback
 * - Supports rollback on error
 * - Exposes status flags for UI indicators
 */

import { useState, useCallback } from 'react';
import { useNetworkStatus } from './use-network-status';
import { offlineQueue, type OfflineActionType } from '../lib/offline-queue';
import { offlineLogger } from '../lib/logger';

/**
 * Options for configuring the offline-capable mutation hook.
 *
 * @template TPayload - The type of payload the mutation accepts
 */
export interface UseOfflineMutationOptions<TPayload> {
  /**
   * The action type for offline queue identification.
   * Maps to tRPC mutation endpoints when queue is processed.
   */
  actionType: OfflineActionType;

  /**
   * The actual mutation function to execute when online.
   * Should call the appropriate tRPC mutation.
   */
  mutationFn: (payload: TPayload) => Promise<void>;

  /**
   * Called immediately before executing/queuing the mutation.
   * Use this to update React Query cache optimistically.
   * The UI should reflect the expected outcome immediately.
   */
  onOptimisticUpdate?: (payload: TPayload) => void;

  /**
   * Called when the mutation fails (online) or queuing fails (offline).
   * Use this to revert optimistic updates.
   */
  onRollback?: (payload: TPayload) => void;

  /**
   * Called when the online mutation completes successfully.
   * Note: Not called for offline queued mutations - those succeed silently
   * when processed by the queue, which triggers cache invalidation via
   * notifyQueueProcessed() callback.
   */
  onSuccess?: (payload: TPayload) => void;

  /**
   * Called when the online mutation fails.
   * Use this for error reporting, toast notifications, etc.
   */
  onError?: (error: Error, payload: TPayload) => void;
}

/**
 * Return type of useOfflineMutation hook.
 */
export interface UseOfflineMutationResult<TPayload> {
  /**
   * Execute the mutation. Will either run immediately (if online)
   * or queue for later execution (if offline).
   */
  mutate: (payload: TPayload) => Promise<void>;

  /**
   * True while the mutation is in progress (online execution)
   * or being queued (offline).
   */
  isPending: boolean;

  /**
   * True if the last mutation was queued for offline processing.
   * Resets to false on next mutate() call.
   */
  isQueued: boolean;

  /**
   * Current network status. True if device has connectivity and
   * internet is reachable.
   */
  isOnline: boolean;
}

/**
 * Hook to wrap mutations with offline support.
 *
 * When online: Executes the mutation directly via mutationFn.
 * When offline: Queues the action for later processing when connectivity returns.
 *
 * In both cases, onOptimisticUpdate is called first to provide immediate UI feedback.
 *
 * @template TPayload - The mutation payload type (must extend Record<string, unknown>
 *                      for serialization to offline queue)
 *
 * @example
 * ```tsx
 * const { mutate, isPending, isQueued, isOnline } = useOfflineMutation({
 *   actionType: 'SUBSCRIBE',
 *   mutationFn: async (payload) => {
 *     await trpcClient.subscriptions.add.mutate(payload);
 *   },
 *   onOptimisticUpdate: (payload) => {
 *     // Add to React Query cache immediately
 *     utils.subscriptions.list.setData({}, (old) => ({
 *       ...old,
 *       items: [...(old?.items ?? []), { id: 'temp', ...payload }],
 *     }));
 *   },
 *   onRollback: (payload) => {
 *     // Remove from cache on error
 *     utils.subscriptions.list.setData({}, (old) => ({
 *       ...old,
 *       items: old?.items?.filter(s => s.providerChannelId !== payload.providerChannelId),
 *     }));
 *   },
 *   onSuccess: () => utils.subscriptions.list.invalidate(),
 *   onError: (error) => showToast('Failed to subscribe'),
 * });
 *
 * // In component:
 * <Button
 *   onPress={() => mutate({ provider: 'YOUTUBE', providerChannelId: 'UC...' })}
 *   disabled={isPending}
 * >
 *   {isPending ? 'Subscribing...' : isQueued ? 'Queued (offline)' : 'Subscribe'}
 * </Button>
 * ```
 */
export function useOfflineMutation<TPayload extends Record<string, unknown>>({
  actionType,
  mutationFn,
  onOptimisticUpdate,
  onRollback,
  onSuccess,
  onError,
}: UseOfflineMutationOptions<TPayload>): UseOfflineMutationResult<TPayload> {
  const { isConnected, isInternetReachable } = useNetworkStatus();
  const [isPending, setIsPending] = useState(false);
  const [isQueued, setIsQueued] = useState(false);

  // Device is online if connected AND internet is reachable
  // Note: isInternetReachable can be null on Android initially, treat as online
  const isOnline = isConnected && isInternetReachable !== false;

  const mutate = useCallback(
    async (payload: TPayload) => {
      // Reset state for new mutation
      setIsPending(true);
      setIsQueued(false);

      // Apply optimistic update immediately (before network check)
      // This ensures instant UI feedback regardless of online/offline status
      onOptimisticUpdate?.(payload);

      if (!isOnline) {
        // Offline path: Queue the action for later processing
        try {
          await offlineQueue.enqueue({
            type: actionType,
            payload,
          });
          setIsQueued(true);
          // Note: No rollback here - optimistic update stays until queue processes
          // The queue will notify React Query to invalidate when it eventually succeeds
        } catch (error) {
          // Queuing failed (e.g., AsyncStorage error) - this is rare
          offlineLogger.error('Failed to queue action', { error, actionType });
          onRollback?.(payload);
        } finally {
          setIsPending(false);
        }
        return;
      }

      // Online path: Execute mutation directly
      try {
        await mutationFn(payload);
        onSuccess?.(payload);
      } catch (error) {
        // Mutation failed - roll back optimistic update
        onRollback?.(payload);
        onError?.(error as Error, payload);
      } finally {
        setIsPending(false);
      }
    },
    [isOnline, actionType, mutationFn, onOptimisticUpdate, onRollback, onSuccess, onError]
  );

  return {
    mutate,
    isPending,
    isQueued,
    isOnline,
  };
}
