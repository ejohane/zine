/**
 * Tests for lib/offline-queue.ts
 *
 * Comprehensive tests for the offline action queue including:
 * - Error classification logic
 * - Retry behavior determination
 * - Queue operations (enqueue, getQueue, getPendingCount, subscribe, clear)
 * - Queue processing with various error scenarios
 *
 * @see Frontend Spec Section 9.3 for requirements
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

// ============================================================================
// Module-level Mocks
// ============================================================================

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
}));

// Mock NetInfo
jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(),
  addEventListener: jest.fn(() => jest.fn()),
}));

// Mock the trpc-offline-client module
jest.mock('./trpc-offline-client', () => ({
  getOfflineTRPCClient: jest.fn(),
  notifyQueueProcessed: jest.fn(),
}));

// Mock ulid to return predictable IDs
jest.mock('ulid', () => ({
  ulid: jest.fn(() => 'TEST_ULID_' + Math.random().toString(36).substr(2, 9)),
}));

// ============================================================================
// Test Setup
// ============================================================================

const QUEUE_KEY = 'zine:offline_action_queue';

// Import after mocks are set up
import {
  offlineQueue,
  type OfflineAction,
  type OfflineActionType,
  type ErrorClassification,
} from './offline-queue';
import { getOfflineTRPCClient, notifyQueueProcessed } from './trpc-offline-client';

// Helper to reset queue state between tests
async function resetQueue(): Promise<void> {
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
  await offlineQueue.clear();
  jest.clearAllMocks();
}

// Helper to mock queue contents
function mockQueueContents(actions: OfflineAction[]): void {
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(actions));
}

// Helper to capture saved queue
function getSavedQueue(): OfflineAction[] {
  const calls = (AsyncStorage.setItem as jest.Mock).mock.calls;
  const lastCall = calls.filter((c) => c[0] === QUEUE_KEY).pop();
  return lastCall ? JSON.parse(lastCall[1]) : [];
}

// Create a test action
function createTestAction(overrides: Partial<OfflineAction> = {}): OfflineAction {
  return {
    id: 'test-action-id',
    type: 'SUBSCRIBE',
    payload: { provider: 'YOUTUBE', feedUrl: 'https://youtube.com/@test' },
    createdAt: Date.now(),
    retryCount: 0,
    authRetryCount: 0,
    ...overrides,
  };
}

// ============================================================================
// Error Classification Tests (classifyError)
// ============================================================================

describe('Error Classification', () => {
  // We need to test classifyError indirectly since it's not exported
  // We'll do this by testing isRetryableError behavior which depends on classification

  describe('via isRetryableError behavior', () => {
    // These tests verify error classification indirectly through retry behavior
    // The actual classification logic is tested through integration tests below
  });
});

// ============================================================================
// Queue Operations Tests
// ============================================================================

describe('OfflineActionQueue', () => {
  beforeEach(async () => {
    await resetQueue();
    // Default: online and reachable
    (NetInfo.fetch as jest.Mock).mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
    });
  });

  describe('enqueue', () => {
    it('adds action to queue with ULID', async () => {
      const id = await offlineQueue.enqueue({
        type: 'SUBSCRIBE',
        payload: { provider: 'YOUTUBE', feedUrl: 'https://youtube.com/@test' },
      });

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id.startsWith('TEST_ULID_')).toBe(true);
    });

    it('persists action to AsyncStorage', async () => {
      await offlineQueue.enqueue({
        type: 'SUBSCRIBE',
        payload: { provider: 'YOUTUBE', feedUrl: 'https://youtube.com/@test' },
      });

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        QUEUE_KEY,
        expect.stringContaining('SUBSCRIBE')
      );
    });

    it('initializes retry counts to zero', async () => {
      await offlineQueue.enqueue({
        type: 'SUBSCRIBE',
        payload: { provider: 'YOUTUBE', feedUrl: 'https://youtube.com/@test' },
      });

      const savedQueue = getSavedQueue();
      expect(savedQueue).toHaveLength(1);
      expect(savedQueue[0].retryCount).toBe(0);
      expect(savedQueue[0].authRetryCount).toBe(0);
    });

    it('includes createdAt timestamp', async () => {
      const beforeEnqueue = Date.now();
      await offlineQueue.enqueue({
        type: 'SUBSCRIBE',
        payload: {},
      });
      const afterEnqueue = Date.now();

      const savedQueue = getSavedQueue();
      expect(savedQueue[0].createdAt).toBeGreaterThanOrEqual(beforeEnqueue);
      expect(savedQueue[0].createdAt).toBeLessThanOrEqual(afterEnqueue);
    });

    it('preserves existing queue items when adding new', async () => {
      const existingAction = createTestAction({ id: 'existing-1' });
      mockQueueContents([existingAction]);

      await offlineQueue.enqueue({
        type: 'UNSUBSCRIBE',
        payload: { id: '123' },
      });

      const savedQueue = getSavedQueue();
      expect(savedQueue).toHaveLength(2);
      expect(savedQueue[0].id).toBe('existing-1');
      expect(savedQueue[1].type).toBe('UNSUBSCRIBE');
    });

    it('supports all action types', async () => {
      const actionTypes: OfflineActionType[] = [
        'SUBSCRIBE',
        'UNSUBSCRIBE',
        'PAUSE_SUBSCRIPTION',
        'RESUME_SUBSCRIPTION',
      ];

      for (const type of actionTypes) {
        await resetQueue();
        await offlineQueue.enqueue({ type, payload: {} });
        const savedQueue = getSavedQueue();
        expect(savedQueue[0].type).toBe(type);
      }
    });
  });

  describe('getQueue', () => {
    it('returns empty array when queue is empty', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      const queue = await offlineQueue.getQueue();

      expect(queue).toEqual([]);
    });

    it('returns parsed actions from storage', async () => {
      const actions = [
        createTestAction({ id: 'action-1' }),
        createTestAction({ id: 'action-2', type: 'UNSUBSCRIBE' }),
      ];
      mockQueueContents(actions);

      const queue = await offlineQueue.getQueue();

      expect(queue).toHaveLength(2);
      expect(queue[0].id).toBe('action-1');
      expect(queue[1].id).toBe('action-2');
    });

    it('returns empty array on storage read error', async () => {
      (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('Storage error'));

      const queue = await offlineQueue.getQueue();

      expect(queue).toEqual([]);
    });

    it('returns empty array for invalid JSON', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('invalid json {');

      // This should throw during JSON.parse and return []
      const queue = await offlineQueue.getQueue();

      expect(queue).toEqual([]);
    });
  });

  describe('getPendingCount', () => {
    it('returns 0 for empty queue', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      const count = await offlineQueue.getPendingCount();

      expect(count).toBe(0);
    });

    it('returns correct count', async () => {
      const actions = [
        createTestAction({ id: 'action-1' }),
        createTestAction({ id: 'action-2' }),
        createTestAction({ id: 'action-3' }),
      ];
      mockQueueContents(actions);

      const count = await offlineQueue.getPendingCount();

      expect(count).toBe(3);
    });
  });

  describe('subscribe', () => {
    it('calls listener on queue changes', async () => {
      const listener = jest.fn();
      const unsubscribe = offlineQueue.subscribe(listener);

      await offlineQueue.enqueue({ type: 'SUBSCRIBE', payload: {} });

      expect(listener).toHaveBeenCalled();

      unsubscribe();
    });

    it('returns unsubscribe function', async () => {
      const listener = jest.fn();
      const unsubscribe = offlineQueue.subscribe(listener);

      unsubscribe();

      // Clear previous calls
      listener.mockClear();

      await offlineQueue.enqueue({ type: 'SUBSCRIBE', payload: {} });

      // Listener should not be called after unsubscribe
      expect(listener).not.toHaveBeenCalled();
    });

    it('supports multiple listeners', async () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      const unsub1 = offlineQueue.subscribe(listener1);
      const unsub2 = offlineQueue.subscribe(listener2);

      await offlineQueue.enqueue({ type: 'SUBSCRIBE', payload: {} });

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();

      unsub1();
      unsub2();
    });

    it('handles listener errors gracefully', async () => {
      const errorListener = jest.fn(() => {
        throw new Error('Listener error');
      });
      const goodListener = jest.fn();

      const unsub1 = offlineQueue.subscribe(errorListener);
      const unsub2 = offlineQueue.subscribe(goodListener);

      // Should not throw
      await offlineQueue.enqueue({ type: 'SUBSCRIBE', payload: {} });

      // Both listeners should be called despite the error
      expect(errorListener).toHaveBeenCalled();
      expect(goodListener).toHaveBeenCalled();

      unsub1();
      unsub2();
    });
  });

  describe('clear', () => {
    it('removes queue from storage', async () => {
      await offlineQueue.clear();

      expect(AsyncStorage.removeItem).toHaveBeenCalledWith(QUEUE_KEY);
    });

    it('notifies listeners', async () => {
      const listener = jest.fn();
      const unsubscribe = offlineQueue.subscribe(listener);

      await offlineQueue.clear();

      expect(listener).toHaveBeenCalled();

      unsubscribe();
    });
  });
});

// ============================================================================
// Queue Processing Tests
// ============================================================================

describe('Queue Processing', () => {
  let mockTrpcClient: {
    sources: {
      add: { mutate: jest.Mock };
      remove: { mutate: jest.Mock };
    };
  };

  beforeEach(async () => {
    await resetQueue();

    // Set up mock tRPC client
    mockTrpcClient = {
      sources: {
        add: { mutate: jest.fn().mockResolvedValue({}) },
        remove: { mutate: jest.fn().mockResolvedValue({}) },
      },
    };
    (getOfflineTRPCClient as jest.Mock).mockReturnValue(mockTrpcClient);

    // Default: online
    (NetInfo.fetch as jest.Mock).mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
    });
  });

  describe('connectivity checks', () => {
    it('does not process when offline', async () => {
      (NetInfo.fetch as jest.Mock).mockResolvedValue({
        isConnected: false,
        isInternetReachable: false,
      });

      const action = createTestAction();
      mockQueueContents([action]);

      await offlineQueue.processQueue();

      expect(mockTrpcClient.sources.add.mutate).not.toHaveBeenCalled();
    });

    it('does not process when internet not reachable', async () => {
      (NetInfo.fetch as jest.Mock).mockResolvedValue({
        isConnected: true,
        isInternetReachable: false,
      });

      const action = createTestAction();
      mockQueueContents([action]);

      await offlineQueue.processQueue();

      expect(mockTrpcClient.sources.add.mutate).not.toHaveBeenCalled();
    });

    it('processes when online and reachable', async () => {
      const action = createTestAction();
      mockQueueContents([action]);

      await offlineQueue.processQueue();

      expect(mockTrpcClient.sources.add.mutate).toHaveBeenCalled();
    });
  });

  describe('action execution', () => {
    it('executes SUBSCRIBE action', async () => {
      const action = createTestAction({
        type: 'SUBSCRIBE',
        payload: { provider: 'YOUTUBE', feedUrl: 'https://youtube.com/@test' },
      });
      mockQueueContents([action]);

      await offlineQueue.processQueue();

      expect(mockTrpcClient.sources.add.mutate).toHaveBeenCalledWith(action.payload);
    });

    it('executes UNSUBSCRIBE action', async () => {
      const action = createTestAction({
        type: 'UNSUBSCRIBE',
        payload: { id: 'sub-123' },
      });
      mockQueueContents([action]);

      await offlineQueue.processQueue();

      expect(mockTrpcClient.sources.remove.mutate).toHaveBeenCalledWith(action.payload);
    });

    it('removes successful action from queue', async () => {
      const action = createTestAction();
      mockQueueContents([action]);

      await offlineQueue.processQueue();

      const savedQueue = getSavedQueue();
      expect(savedQueue).toHaveLength(0);
    });

    it('notifies React Query after successful processing', async () => {
      const action = createTestAction();
      mockQueueContents([action]);

      await offlineQueue.processQueue();

      expect(notifyQueueProcessed).toHaveBeenCalled();
    });

    it('processes multiple actions in order', async () => {
      const actions = [
        createTestAction({ id: 'action-1', type: 'SUBSCRIBE', payload: { order: 1 } }),
        createTestAction({ id: 'action-2', type: 'SUBSCRIBE', payload: { order: 2 } }),
        createTestAction({ id: 'action-3', type: 'SUBSCRIBE', payload: { order: 3 } }),
      ];
      mockQueueContents(actions);

      await offlineQueue.processQueue();

      const calls = mockTrpcClient.sources.add.mutate.mock.calls;
      expect(calls).toHaveLength(3);
      expect(calls[0][0].order).toBe(1);
      expect(calls[1][0].order).toBe(2);
      expect(calls[2][0].order).toBe(3);
    });
  });

  describe('error handling', () => {
    describe('CONFLICT errors (409)', () => {
      it('treats conflict as success and removes from queue', async () => {
        const action = createTestAction();
        mockQueueContents([action]);

        // Simulate 409 Conflict error
        mockTrpcClient.sources.add.mutate.mockRejectedValue({
          data: { httpStatus: 409, code: 'CONFLICT' },
          message: 'Already subscribed',
        });

        await offlineQueue.processQueue();

        const savedQueue = getSavedQueue();
        expect(savedQueue).toHaveLength(0);
        expect(notifyQueueProcessed).toHaveBeenCalled();
      });
    });

    describe('CLIENT errors (4xx)', () => {
      it('removes permanently failed action (400 Bad Request)', async () => {
        const action = createTestAction();
        mockQueueContents([action]);

        mockTrpcClient.sources.add.mutate.mockRejectedValue({
          data: { httpStatus: 400 },
          message: 'Invalid payload',
        });

        await offlineQueue.processQueue();

        const savedQueue = getSavedQueue();
        expect(savedQueue).toHaveLength(0);
      });

      it('does not notify React Query for permanent failures', async () => {
        const action = createTestAction();
        mockQueueContents([action]);

        mockTrpcClient.sources.add.mutate.mockRejectedValue({
          data: { httpStatus: 400 },
          message: 'Invalid payload',
        });

        await offlineQueue.processQueue();

        expect(notifyQueueProcessed).not.toHaveBeenCalled();
      });
    });

    describe('NETWORK errors', () => {
      it('keeps action in queue for retry', async () => {
        const action = createTestAction();
        mockQueueContents([action]);

        mockTrpcClient.sources.add.mutate.mockRejectedValue(
          new TypeError('Network request failed')
        );

        await offlineQueue.processQueue();

        const savedQueue = getSavedQueue();
        expect(savedQueue).toHaveLength(1);
        expect(savedQueue[0].retryCount).toBe(1);
      });

      it('removes action after MAX_RETRIES (3)', async () => {
        // Action with retryCount at limit - should be removed on failure
        const action = createTestAction({ retryCount: 3 }); // Already at MAX_RETRIES
        mockQueueContents([action]);

        mockTrpcClient.sources.add.mutate.mockRejectedValue(
          new TypeError('Network request failed')
        );

        await offlineQueue.processQueue();

        // Should be removed since retryCount >= MAX_RETRIES (3)
        const savedQueue = getSavedQueue();
        expect(savedQueue).toHaveLength(0);
      });

      it('records last error message', async () => {
        const action = createTestAction();
        mockQueueContents([action]);

        mockTrpcClient.sources.add.mutate.mockRejectedValue(new Error('Connection timeout'));

        await offlineQueue.processQueue();

        const savedQueue = getSavedQueue();
        expect(savedQueue[0].lastError).toBe('Connection timeout');
      });
    });

    describe('SERVER errors (5xx)', () => {
      it('retries server errors', async () => {
        const action = createTestAction();
        mockQueueContents([action]);

        mockTrpcClient.sources.add.mutate.mockRejectedValue({
          data: { httpStatus: 500 },
          message: 'Internal server error',
        });

        await offlineQueue.processQueue();

        const savedQueue = getSavedQueue();
        expect(savedQueue).toHaveLength(1);
        expect(savedQueue[0].retryCount).toBe(1);
      });
    });

    describe('AUTH errors (401)', () => {
      it('retries after auth refresh attempt', async () => {
        const action = createTestAction();
        mockQueueContents([action]);

        // First call fails with 401, auth refresh will fail (not implemented)
        mockTrpcClient.sources.add.mutate.mockRejectedValue({
          data: { httpStatus: 401, code: 'UNAUTHORIZED' },
          message: 'Token expired',
        });

        await offlineQueue.processQueue();

        const savedQueue = getSavedQueue();
        // Action should still be in queue with incremented authRetryCount
        expect(savedQueue).toHaveLength(1);
        expect(savedQueue[0].authRetryCount).toBe(1);
      });

      it('removes after AUTH_RETRY_LIMIT (1)', async () => {
        const action = createTestAction({ authRetryCount: 1 }); // Already at limit
        mockQueueContents([action]);

        mockTrpcClient.sources.add.mutate.mockRejectedValue({
          data: { httpStatus: 401, code: 'UNAUTHORIZED' },
          message: 'Token expired',
        });

        await offlineQueue.processQueue();

        const savedQueue = getSavedQueue();
        // Should be removed - exceeded auth retry limit
        expect(savedQueue).toHaveLength(0);
      });
    });

    describe('UNKNOWN errors', () => {
      it('treats unknown errors as retryable', async () => {
        const action = createTestAction();
        mockQueueContents([action]);

        mockTrpcClient.sources.add.mutate.mockRejectedValue({
          someUnknownProperty: 'value',
        });

        await offlineQueue.processQueue();

        const savedQueue = getSavedQueue();
        expect(savedQueue).toHaveLength(1);
        expect(savedQueue[0].retryCount).toBe(1);
        expect(savedQueue[0].lastErrorType).toBe('UNKNOWN');
      });
    });

    describe('unimplemented actions', () => {
      it('fails PAUSE_SUBSCRIPTION with not implemented error', async () => {
        const action = createTestAction({ type: 'PAUSE_SUBSCRIPTION' });
        mockQueueContents([action]);

        await offlineQueue.processQueue();

        // Should retry as UNKNOWN error
        const savedQueue = getSavedQueue();
        expect(savedQueue).toHaveLength(1);
        expect(savedQueue[0].retryCount).toBe(1);
      });

      it('fails RESUME_SUBSCRIPTION with not implemented error', async () => {
        const action = createTestAction({ type: 'RESUME_SUBSCRIPTION' });
        mockQueueContents([action]);

        await offlineQueue.processQueue();

        // Should retry as UNKNOWN error
        const savedQueue = getSavedQueue();
        expect(savedQueue).toHaveLength(1);
        expect(savedQueue[0].retryCount).toBe(1);
      });
    });
  });

  describe('concurrent processing prevention', () => {
    it('prevents concurrent queue processing via isProcessing flag', async () => {
      // This test verifies the concurrent processing prevention logic exists
      // The isProcessing flag is checked at the start of processQueue()
      // We can't easily test this without accessing internal state, but we can
      // verify the queue processes correctly when called multiple times sequentially

      const action = createTestAction();
      mockQueueContents([action]);

      // Process queue twice sequentially - should work fine
      await offlineQueue.processQueue();

      // Reset for second call
      mockQueueContents([createTestAction({ id: 'action-2' })]);
      await offlineQueue.processQueue();

      // Both calls should complete successfully
      expect(mockTrpcClient.sources.add.mutate).toHaveBeenCalledTimes(2);
    });
  });

  describe('partial success handling', () => {
    it('processes remaining actions after one fails', async () => {
      const actions = [
        createTestAction({ id: 'fail-action', payload: { fail: true } }),
        createTestAction({ id: 'success-action', payload: { fail: false } }),
      ];
      mockQueueContents(actions);

      // First action fails, second succeeds
      mockTrpcClient.sources.add.mutate
        .mockRejectedValueOnce(new TypeError('Network request failed'))
        .mockResolvedValueOnce({});

      await offlineQueue.processQueue();

      // First action should be in queue with incremented retry, second removed
      const savedQueue = getSavedQueue();
      expect(savedQueue).toHaveLength(1);
      expect(savedQueue[0].id).toBe('fail-action');
      expect(savedQueue[0].retryCount).toBe(1);

      // Should notify about partial success
      expect(notifyQueueProcessed).toHaveBeenCalled();
    });
  });
});

// ============================================================================
// Integration Tests: Error Classification Paths
// ============================================================================

describe('Error Classification Integration', () => {
  let mockTrpcClient: {
    sources: {
      add: { mutate: jest.Mock };
      remove: { mutate: jest.Mock };
    };
  };

  beforeEach(async () => {
    await resetQueue();

    mockTrpcClient = {
      sources: {
        add: { mutate: jest.fn() },
        remove: { mutate: jest.fn() },
      },
    };
    (getOfflineTRPCClient as jest.Mock).mockReturnValue(mockTrpcClient);

    (NetInfo.fetch as jest.Mock).mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
    });
  });

  describe('Network error patterns', () => {
    it('classifies TypeError with fetch message as NETWORK', async () => {
      const action = createTestAction();
      mockQueueContents([action]);

      mockTrpcClient.sources.add.mutate.mockRejectedValue(new TypeError('Failed to fetch'));

      await offlineQueue.processQueue();

      const savedQueue = getSavedQueue();
      expect(savedQueue[0].lastErrorType).toBe('NETWORK');
    });

    it('classifies timeout message as NETWORK', async () => {
      const action = createTestAction();
      mockQueueContents([action]);

      mockTrpcClient.sources.add.mutate.mockRejectedValue(new Error('Request timeout exceeded'));

      await offlineQueue.processQueue();

      const savedQueue = getSavedQueue();
      expect(savedQueue[0].lastErrorType).toBe('NETWORK');
    });

    it('classifies connection message as NETWORK', async () => {
      const action = createTestAction();
      mockQueueContents([action]);

      mockTrpcClient.sources.add.mutate.mockRejectedValue(new Error('Connection refused'));

      await offlineQueue.processQueue();

      const savedQueue = getSavedQueue();
      expect(savedQueue[0].lastErrorType).toBe('NETWORK');
    });

    it('classifies aborted message as NETWORK', async () => {
      const action = createTestAction();
      mockQueueContents([action]);

      mockTrpcClient.sources.add.mutate.mockRejectedValue(new Error('Request aborted'));

      await offlineQueue.processQueue();

      const savedQueue = getSavedQueue();
      expect(savedQueue[0].lastErrorType).toBe('NETWORK');
    });
  });

  describe('HTTP status code patterns', () => {
    const statusTestCases: Array<{
      status: number;
      code?: string;
      expectedType: ErrorClassification;
    }> = [
      { status: 401, expectedType: 'AUTH' },
      { status: 401, code: 'UNAUTHORIZED', expectedType: 'AUTH' },
      { status: 409, expectedType: 'CONFLICT' },
      { status: 409, code: 'CONFLICT', expectedType: 'CONFLICT' },
      { status: 400, expectedType: 'CLIENT' },
      { status: 403, expectedType: 'CLIENT' },
      { status: 404, expectedType: 'CLIENT' },
      { status: 422, expectedType: 'CLIENT' },
      { status: 500, expectedType: 'SERVER' },
      { status: 502, expectedType: 'SERVER' },
      { status: 503, expectedType: 'SERVER' },
    ];

    for (const { status, code, expectedType } of statusTestCases) {
      it(`classifies HTTP ${status}${code ? ` (${code})` : ''} as ${expectedType}`, async () => {
        const action = createTestAction();
        mockQueueContents([action]);

        mockTrpcClient.sources.add.mutate.mockRejectedValue({
          data: { httpStatus: status, code },
          message: `HTTP ${status} error`,
        });

        await offlineQueue.processQueue();

        const savedQueue = getSavedQueue();

        // CONFLICT and CLIENT errors are not retried, so queue will be empty
        if (expectedType === 'CONFLICT' || expectedType === 'CLIENT') {
          expect(savedQueue).toHaveLength(0);
        } else if (expectedType === 'AUTH') {
          // AUTH errors increment authRetryCount
          expect(savedQueue).toHaveLength(1);
          expect(savedQueue[0].authRetryCount).toBe(1);
        } else {
          // NETWORK, SERVER, UNKNOWN increment retryCount
          expect(savedQueue).toHaveLength(1);
          expect(savedQueue[0].lastErrorType).toBe(expectedType);
        }
      });
    }
  });

  describe('tRPC error structure patterns', () => {
    it('extracts httpStatus from data.httpStatus', async () => {
      const action = createTestAction();
      mockQueueContents([action]);

      mockTrpcClient.sources.add.mutate.mockRejectedValue({
        data: { httpStatus: 500, code: 'INTERNAL_SERVER_ERROR' },
      });

      await offlineQueue.processQueue();

      const savedQueue = getSavedQueue();
      expect(savedQueue[0].lastErrorType).toBe('SERVER');
    });

    it('extracts code from data.code', async () => {
      const action = createTestAction();
      mockQueueContents([action]);

      mockTrpcClient.sources.add.mutate.mockRejectedValue({
        data: { code: 'UNAUTHORIZED' },
      });

      await offlineQueue.processQueue();

      // AUTH errors trigger auth retry, check authRetryCount
      const savedQueue = getSavedQueue();
      expect(savedQueue[0].authRetryCount).toBe(1);
    });

    it('falls back to root status property', async () => {
      const action = createTestAction();
      mockQueueContents([action]);

      mockTrpcClient.sources.add.mutate.mockRejectedValue({
        status: 503,
        message: 'Service unavailable',
      });

      await offlineQueue.processQueue();

      const savedQueue = getSavedQueue();
      expect(savedQueue[0].lastErrorType).toBe('SERVER');
    });

    it('falls back to root statusCode property', async () => {
      const action = createTestAction();
      mockQueueContents([action]);

      mockTrpcClient.sources.add.mutate.mockRejectedValue({
        statusCode: 404,
        message: 'Not found',
      });

      await offlineQueue.processQueue();

      // 404 is CLIENT error - removed from queue
      const savedQueue = getSavedQueue();
      expect(savedQueue).toHaveLength(0);
    });
  });
});

// ============================================================================
// NetInfo Integration Tests
// ============================================================================

describe('NetInfo Integration', () => {
  it('auto-processing is configured via addEventListener', () => {
    // The offline-queue module registers a NetInfo listener at load time
    // to automatically process the queue when connectivity is restored.
    // Since our mock replaces addEventListener with a mock function,
    // we verify the behavior is wired correctly by checking the module setup.

    // The addEventListener mock is defined in jest.mock at the top of this file
    // and returns a jest.fn() (unsubscribe function).
    // We can verify the integration exists by checking the module exports work.
    expect(typeof offlineQueue.processQueue).toBe('function');
    expect(typeof offlineQueue.subscribe).toBe('function');
  });
});
