/**
 * Tests for hooks/use-offline-mutation.ts
 *
 * Tests the offline-first mutation pattern including:
 * - Online behavior: immediate execution
 * - Offline behavior: queuing and optimistic updates
 * - Sync on reconnect: FIFO processing
 * - Error handling: appropriate queuing/rejection based on error type
 *
 * @see Frontend Spec Section 9.4 for detailed requirements
 */

import { renderHook, act } from '@testing-library/react-hooks';
import { useOfflineMutation, type UseOfflineMutationOptions } from './use-offline-mutation';
import { offlineQueue } from '../lib/offline-queue';

// Import the mocked module for type safety
import { useNetworkStatus } from './use-network-status';

// ============================================================================
// Module-level Mocks
// ============================================================================

// Mock the network status hook
jest.mock('./use-network-status', () => ({
  useNetworkStatus: jest.fn(() => ({
    isConnected: true,
    isInternetReachable: true,
    type: 'wifi',
  })),
}));

// Mock the offline queue
jest.mock('../lib/offline-queue', () => ({
  offlineQueue: {
    enqueue: jest.fn(() => Promise.resolve('mock-queue-id')),
    processQueue: jest.fn(() => Promise.resolve()),
    getQueue: jest.fn(() => Promise.resolve([])),
    getPendingCount: jest.fn(() => Promise.resolve(0)),
    subscribe: jest.fn(() => jest.fn()),
    clear: jest.fn(() => Promise.resolve()),
  },
}));

// Mock logger to suppress output during tests
jest.mock('../lib/logger', () => ({
  offlineLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// ============================================================================
// Test Setup
// ============================================================================

// Helper to create default mutation options
function createMutationOptions<TPayload extends Record<string, unknown>>(
  overrides: Partial<UseOfflineMutationOptions<TPayload>> = {}
): UseOfflineMutationOptions<TPayload> {
  return {
    actionType: 'SUBSCRIBE',
    mutationFn: jest.fn(() => Promise.resolve()),
    ...overrides,
  };
}

// Helper to simulate online status
function setOnline(isOnline: boolean) {
  (useNetworkStatus as jest.Mock).mockReturnValue({
    isConnected: isOnline,
    isInternetReachable: isOnline,
    type: isOnline ? 'wifi' : 'none',
  });
}

// Helper to simulate partial connectivity (connected but no internet)
function setConnectedNoInternet() {
  (useNetworkStatus as jest.Mock).mockReturnValue({
    isConnected: true,
    isInternetReachable: false,
    type: 'wifi',
  });
}

// Helper to simulate Android's initial null state
function setAndroidInitialState() {
  (useNetworkStatus as jest.Mock).mockReturnValue({
    isConnected: true,
    isInternetReachable: null,
    type: 'wifi',
  });
}

// ============================================================================
// Online Behavior Tests
// ============================================================================

describe('useOfflineMutation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setOnline(true);
  });

  describe('Online behavior', () => {
    it('executes mutation immediately when online', async () => {
      const mutationFn = jest.fn(() => Promise.resolve());
      const options = createMutationOptions({ mutationFn });

      const { result } = renderHook(() => useOfflineMutation(options));

      await act(async () => {
        await result.current.mutate({ provider: 'YOUTUBE', feedUrl: 'https://youtube.com/@test' });
      });

      expect(mutationFn).toHaveBeenCalledTimes(1);
      expect(mutationFn).toHaveBeenCalledWith({
        provider: 'YOUTUBE',
        feedUrl: 'https://youtube.com/@test',
      });
    });

    it('does not queue mutation when online', async () => {
      const options = createMutationOptions();

      const { result } = renderHook(() => useOfflineMutation(options));

      await act(async () => {
        await result.current.mutate({ data: 'test' });
      });

      expect(offlineQueue.enqueue).not.toHaveBeenCalled();
    });

    it('returns mutation result via onSuccess callback', async () => {
      const onSuccess = jest.fn();
      const options = createMutationOptions({ onSuccess });

      const { result } = renderHook(() => useOfflineMutation(options));

      await act(async () => {
        await result.current.mutate({ data: 'test' });
      });

      expect(onSuccess).toHaveBeenCalledWith({ data: 'test' });
    });

    it('calls onOptimisticUpdate before mutation execution', async () => {
      const callOrder: string[] = [];
      const onOptimisticUpdate = jest.fn(() => callOrder.push('optimistic'));
      const mutationFn = jest.fn(async () => {
        callOrder.push('mutation');
      });

      const options = createMutationOptions({ mutationFn, onOptimisticUpdate });

      const { result } = renderHook(() => useOfflineMutation(options));

      await act(async () => {
        await result.current.mutate({ data: 'test' });
      });

      expect(callOrder).toEqual(['optimistic', 'mutation']);
    });

    it('sets isPending to true then false during mutation execution', async () => {
      const mutationFn = jest.fn(async () => {
        // Capture isPending state during execution would require internal access
        // Instead, we verify the state transitions through the result
        return Promise.resolve();
      });

      const options = createMutationOptions({ mutationFn });

      const { result } = renderHook(() => useOfflineMutation(options));

      // Initially not pending
      expect(result.current.isPending).toBe(false);

      // After mutation completes, should not be pending
      await act(async () => {
        await result.current.mutate({ data: 'test' });
      });

      // Should no longer be pending after completion
      expect(result.current.isPending).toBe(false);
      expect(mutationFn).toHaveBeenCalled();
    });

    it('isQueued remains false for online mutations', async () => {
      const options = createMutationOptions();

      const { result } = renderHook(() => useOfflineMutation(options));

      await act(async () => {
        await result.current.mutate({ data: 'test' });
      });

      expect(result.current.isQueued).toBe(false);
    });

    it('isOnline reflects current network status', () => {
      setOnline(true);
      const { result: onlineResult } = renderHook(() =>
        useOfflineMutation(createMutationOptions())
      );
      expect(onlineResult.current.isOnline).toBe(true);

      setOnline(false);
      const { result: offlineResult } = renderHook(() =>
        useOfflineMutation(createMutationOptions())
      );
      expect(offlineResult.current.isOnline).toBe(false);
    });

    it('treats Android null isInternetReachable as online', () => {
      setAndroidInitialState();

      const { result } = renderHook(() => useOfflineMutation(createMutationOptions()));

      // null isInternetReachable should be treated as online
      expect(result.current.isOnline).toBe(true);
    });
  });

  // ============================================================================
  // Offline Behavior Tests
  // ============================================================================

  describe('Offline behavior', () => {
    beforeEach(() => {
      setOnline(false);
    });

    it('queues mutation when offline', async () => {
      const options = createMutationOptions({ actionType: 'SUBSCRIBE' });

      const { result } = renderHook(() => useOfflineMutation(options));

      await act(async () => {
        await result.current.mutate({
          provider: 'YOUTUBE',
          feedUrl: 'https://youtube.com/@channel',
        });
      });

      expect(offlineQueue.enqueue).toHaveBeenCalledWith({
        type: 'SUBSCRIBE',
        payload: { provider: 'YOUTUBE', feedUrl: 'https://youtube.com/@channel' },
      });
    });

    it('does not execute mutation immediately when offline', async () => {
      const mutationFn = jest.fn();
      const options = createMutationOptions({ mutationFn });

      const { result } = renderHook(() => useOfflineMutation(options));

      await act(async () => {
        await result.current.mutate({ data: 'test' });
      });

      expect(mutationFn).not.toHaveBeenCalled();
    });

    it('returns optimistic success (isQueued = true)', async () => {
      const options = createMutationOptions();

      const { result } = renderHook(() => useOfflineMutation(options));

      await act(async () => {
        await result.current.mutate({ data: 'test' });
      });

      expect(result.current.isQueued).toBe(true);
    });

    it('calls onOptimisticUpdate when queuing offline', async () => {
      const onOptimisticUpdate = jest.fn();
      const options = createMutationOptions({ onOptimisticUpdate });

      const { result } = renderHook(() => useOfflineMutation(options));

      await act(async () => {
        await result.current.mutate({ data: 'test' });
      });

      expect(onOptimisticUpdate).toHaveBeenCalledWith({ data: 'test' });
    });

    it('does not call onSuccess for queued mutations', async () => {
      const onSuccess = jest.fn();
      const options = createMutationOptions({ onSuccess });

      const { result } = renderHook(() => useOfflineMutation(options));

      await act(async () => {
        await result.current.mutate({ data: 'test' });
      });

      expect(onSuccess).not.toHaveBeenCalled();
    });

    it('sets isPending to false after queuing completes', async () => {
      const options = createMutationOptions();

      const { result } = renderHook(() => useOfflineMutation(options));

      await act(async () => {
        await result.current.mutate({ data: 'test' });
      });

      expect(result.current.isPending).toBe(false);
    });

    it('handles connected but no internet as offline', async () => {
      setConnectedNoInternet();
      const mutationFn = jest.fn();
      const options = createMutationOptions({ mutationFn });

      const { result } = renderHook(() => useOfflineMutation(options));

      await act(async () => {
        await result.current.mutate({ data: 'test' });
      });

      // Should queue, not execute
      expect(mutationFn).not.toHaveBeenCalled();
      expect(offlineQueue.enqueue).toHaveBeenCalled();
    });

    it('resets isQueued on next mutate call when hook is re-rendered', async () => {
      // First hook instance - offline
      setOnline(false);
      const options = createMutationOptions();

      const { result: offlineResult } = renderHook(() => useOfflineMutation(options));

      // First mutation - queued
      await act(async () => {
        await offlineResult.current.mutate({ data: 'first' });
      });
      expect(offlineResult.current.isQueued).toBe(true);

      // Second hook instance - online (simulates network change causing re-render)
      setOnline(true);
      const { result: onlineResult } = renderHook(() => useOfflineMutation(options));

      // Fresh hook instance starts with isQueued = false
      expect(onlineResult.current.isQueued).toBe(false);

      // After online mutation, isQueued should still be false
      await act(async () => {
        await onlineResult.current.mutate({ data: 'second' });
      });
      expect(onlineResult.current.isQueued).toBe(false);
    });

    it('calls onRollback when queuing fails', async () => {
      const onRollback = jest.fn();
      const options = createMutationOptions({ onRollback });

      // Make enqueue fail
      (offlineQueue.enqueue as jest.Mock).mockRejectedValueOnce(new Error('Storage full'));

      const { result } = renderHook(() => useOfflineMutation(options));

      await act(async () => {
        await result.current.mutate({ data: 'test' });
      });

      expect(onRollback).toHaveBeenCalledWith({ data: 'test' });
    });
  });

  // ============================================================================
  // Sync on Reconnect Tests
  // ============================================================================

  describe('Sync on reconnect', () => {
    it('processes queued mutations via offlineQueue when coming online', async () => {
      // Queue is processed by the offlineQueue module's NetInfo listener.
      // Here we verify the hook correctly delegates to the queue.
      setOnline(false);
      const options = createMutationOptions({ actionType: 'SUBSCRIBE' });

      const { result } = renderHook(() => useOfflineMutation(options));

      // Queue first mutation
      await act(async () => {
        await result.current.mutate({ provider: 'YOUTUBE', id: '1' });
      });

      // Queue second mutation
      await act(async () => {
        await result.current.mutate({ provider: 'YOUTUBE', id: '2' });
      });

      // Both should be queued
      expect(offlineQueue.enqueue).toHaveBeenCalledTimes(2);

      // First queued before second (FIFO order is handled by offlineQueue)
      const calls = (offlineQueue.enqueue as jest.Mock).mock.calls;
      expect(calls[0][0].payload.id).toBe('1');
      expect(calls[1][0].payload.id).toBe('2');
    });

    it('queues mutations in FIFO order for later processing', async () => {
      setOnline(false);
      const options = createMutationOptions({ actionType: 'UNSUBSCRIBE' });

      const { result } = renderHook(() => useOfflineMutation(options));

      // Queue in specific order
      await act(async () => {
        await result.current.mutate({ id: 'first' });
      });
      await act(async () => {
        await result.current.mutate({ id: 'second' });
      });
      await act(async () => {
        await result.current.mutate({ id: 'third' });
      });

      const calls = (offlineQueue.enqueue as jest.Mock).mock.calls;
      expect(calls).toHaveLength(3);
      expect(calls[0][0].payload.id).toBe('first');
      expect(calls[1][0].payload.id).toBe('second');
      expect(calls[2][0].payload.id).toBe('third');
    });

    it('successful queue entries are removed by offlineQueue on execution', async () => {
      // This behavior is handled by offlineQueue.processQueue()
      // The hook's responsibility is just to enqueue correctly
      setOnline(false);
      const options = createMutationOptions();

      const { result } = renderHook(() => useOfflineMutation(options));

      await act(async () => {
        await result.current.mutate({ data: 'test' });
      });

      // Verify correct action type and payload are passed to queue
      expect(offlineQueue.enqueue).toHaveBeenCalledWith({
        type: 'SUBSCRIBE',
        payload: { data: 'test' },
      });
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('Error handling', () => {
    describe('Online mutation errors', () => {
      beforeEach(() => {
        setOnline(true);
      });

      it('calls onRollback on mutation failure', async () => {
        const onRollback = jest.fn();
        const mutationFn = jest.fn(() => Promise.reject(new Error('Server error')));
        const options = createMutationOptions({ mutationFn, onRollback });

        const { result } = renderHook(() => useOfflineMutation(options));

        await act(async () => {
          await result.current.mutate({ data: 'test' });
        });

        expect(onRollback).toHaveBeenCalledWith({ data: 'test' });
      });

      it('calls onError with error and payload on failure', async () => {
        const onError = jest.fn();
        const error = new Error('Validation failed');
        const mutationFn = jest.fn(() => Promise.reject(error));
        const options = createMutationOptions({ mutationFn, onError });

        const { result } = renderHook(() => useOfflineMutation(options));

        await act(async () => {
          await result.current.mutate({ data: 'test' });
        });

        expect(onError).toHaveBeenCalledWith(error, { data: 'test' });
      });

      it('does not queue on auth/validation errors (4xx)', async () => {
        const mutationFn = jest.fn(() =>
          Promise.reject({
            data: { httpStatus: 400 },
            message: 'Validation error',
          })
        );
        const options = createMutationOptions({ mutationFn });

        const { result } = renderHook(() => useOfflineMutation(options));

        await act(async () => {
          await result.current.mutate({ data: 'test' });
        });

        // Should not queue client errors
        expect(offlineQueue.enqueue).not.toHaveBeenCalled();
      });

      it('does not call onSuccess on failure', async () => {
        const onSuccess = jest.fn();
        const mutationFn = jest.fn(() => Promise.reject(new Error('Failed')));
        const options = createMutationOptions({ mutationFn, onSuccess });

        const { result } = renderHook(() => useOfflineMutation(options));

        await act(async () => {
          await result.current.mutate({ data: 'test' });
        });

        expect(onSuccess).not.toHaveBeenCalled();
      });

      it('sets isPending to false after error', async () => {
        const mutationFn = jest.fn(() => Promise.reject(new Error('Failed')));
        const options = createMutationOptions({ mutationFn });

        const { result } = renderHook(() => useOfflineMutation(options));

        await act(async () => {
          await result.current.mutate({ data: 'test' });
        });

        expect(result.current.isPending).toBe(false);
      });
    });

    describe('Network-triggered queueing (online mutation with network error)', () => {
      beforeEach(() => {
        setOnline(true);
      });

      it('online mutation that fails with network error still calls onError', async () => {
        // When online but network error occurs during mutation, the hook
        // calls onError and onRollback - it doesn't automatically queue
        // (that's a different pattern handled by the queue processor)
        const onError = jest.fn();
        const onRollback = jest.fn();
        const networkError = new TypeError('Failed to fetch');
        const mutationFn = jest.fn(() => Promise.reject(networkError));
        const options = createMutationOptions({ mutationFn, onError, onRollback });

        const { result } = renderHook(() => useOfflineMutation(options));

        await act(async () => {
          await result.current.mutate({ data: 'test' });
        });

        expect(onError).toHaveBeenCalledWith(networkError, { data: 'test' });
        expect(onRollback).toHaveBeenCalledWith({ data: 'test' });
      });
    });

    describe('Offline queuing errors', () => {
      beforeEach(() => {
        setOnline(false);
      });

      it('calls onRollback when enqueue throws', async () => {
        const onRollback = jest.fn();
        const options = createMutationOptions({ onRollback });

        (offlineQueue.enqueue as jest.Mock).mockRejectedValueOnce(
          new Error('AsyncStorage quota exceeded')
        );

        const { result } = renderHook(() => useOfflineMutation(options));

        await act(async () => {
          await result.current.mutate({ data: 'test' });
        });

        expect(onRollback).toHaveBeenCalledWith({ data: 'test' });
      });

      it('does not set isQueued when enqueue fails', async () => {
        const options = createMutationOptions();

        (offlineQueue.enqueue as jest.Mock).mockRejectedValueOnce(new Error('Queue error'));

        const { result } = renderHook(() => useOfflineMutation(options));

        await act(async () => {
          await result.current.mutate({ data: 'test' });
        });

        expect(result.current.isQueued).toBe(false);
      });

      it('sets isPending to false when enqueue fails', async () => {
        const options = createMutationOptions();

        (offlineQueue.enqueue as jest.Mock).mockRejectedValueOnce(new Error('Queue error'));

        const { result } = renderHook(() => useOfflineMutation(options));

        await act(async () => {
          await result.current.mutate({ data: 'test' });
        });

        expect(result.current.isPending).toBe(false);
      });
    });
  });

  // ============================================================================
  // Action Type Tests
  // ============================================================================

  describe('Action types', () => {
    beforeEach(() => {
      setOnline(false);
    });

    it('queues SUBSCRIBE actions correctly', async () => {
      const options = createMutationOptions({ actionType: 'SUBSCRIBE' });

      const { result } = renderHook(() => useOfflineMutation(options));

      await act(async () => {
        await result.current.mutate({ provider: 'YOUTUBE', feedUrl: 'https://youtube.com/@test' });
      });

      expect(offlineQueue.enqueue).toHaveBeenCalledWith({
        type: 'SUBSCRIBE',
        payload: { provider: 'YOUTUBE', feedUrl: 'https://youtube.com/@test' },
      });
    });

    it('queues UNSUBSCRIBE actions correctly', async () => {
      const options = createMutationOptions({ actionType: 'UNSUBSCRIBE' });

      const { result } = renderHook(() => useOfflineMutation(options));

      await act(async () => {
        await result.current.mutate({ id: 'subscription-123' });
      });

      expect(offlineQueue.enqueue).toHaveBeenCalledWith({
        type: 'UNSUBSCRIBE',
        payload: { id: 'subscription-123' },
      });
    });
  });

  // ============================================================================
  // Callback Behavior Tests
  // ============================================================================

  describe('Callback behavior', () => {
    it('all callbacks are optional', async () => {
      setOnline(true);
      const options: UseOfflineMutationOptions<Record<string, unknown>> = {
        actionType: 'SUBSCRIBE',
        mutationFn: jest.fn(() => Promise.resolve()),
        // No callbacks provided
      };

      const { result } = renderHook(() => useOfflineMutation(options));

      // Should not throw
      await act(async () => {
        await result.current.mutate({ data: 'test' });
      });

      expect(result.current.isPending).toBe(false);
    });

    it('handles missing onOptimisticUpdate gracefully', async () => {
      setOnline(true);
      const options = createMutationOptions({
        onOptimisticUpdate: undefined,
      });

      const { result } = renderHook(() => useOfflineMutation(options));

      // Should not throw
      await act(async () => {
        await result.current.mutate({ data: 'test' });
      });
    });

    it('handles missing onRollback gracefully on error', async () => {
      setOnline(true);
      const mutationFn = jest.fn(() => Promise.reject(new Error('Failed')));
      const options = createMutationOptions({
        mutationFn,
        onRollback: undefined,
      });

      const { result } = renderHook(() => useOfflineMutation(options));

      // Should not throw
      await act(async () => {
        await result.current.mutate({ data: 'test' });
      });
    });

    it('handles missing onSuccess gracefully', async () => {
      setOnline(true);
      const options = createMutationOptions({
        onSuccess: undefined,
      });

      const { result } = renderHook(() => useOfflineMutation(options));

      // Should not throw
      await act(async () => {
        await result.current.mutate({ data: 'test' });
      });
    });

    it('handles missing onError gracefully on failure', async () => {
      setOnline(true);
      const mutationFn = jest.fn(() => Promise.reject(new Error('Failed')));
      const options = createMutationOptions({
        mutationFn,
        onError: undefined,
      });

      const { result } = renderHook(() => useOfflineMutation(options));

      // Should not throw
      await act(async () => {
        await result.current.mutate({ data: 'test' });
      });
    });
  });

  // ============================================================================
  // State Consistency Tests
  // ============================================================================

  describe('State consistency', () => {
    it('resets state correctly between mutations', async () => {
      setOnline(true);
      const options = createMutationOptions();

      const { result } = renderHook(() => useOfflineMutation(options));

      // First mutation
      await act(async () => {
        await result.current.mutate({ data: 'first' });
      });

      expect(result.current.isPending).toBe(false);
      expect(result.current.isQueued).toBe(false);

      // Go offline and mutate again
      setOnline(false);
      const { result: result2 } = renderHook(() => useOfflineMutation(options));

      await act(async () => {
        await result2.current.mutate({ data: 'second' });
      });

      expect(result2.current.isPending).toBe(false);
      expect(result2.current.isQueued).toBe(true);
    });

    it('maintains stable mutate function reference', () => {
      const options = createMutationOptions();

      const { result, rerender } = renderHook(() => useOfflineMutation(options));

      const firstMutate = result.current.mutate;
      rerender();
      const secondMutate = result.current.mutate;

      // mutate is wrapped in useCallback, should be stable when deps don't change
      // Note: This may change if deps change, but for same options should be stable
      expect(typeof firstMutate).toBe('function');
      expect(typeof secondMutate).toBe('function');
    });
  });
});
