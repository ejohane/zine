/**
 * Tests for hooks/use-sync-all.ts
 *
 * Tests the useSyncAll hook for async pull-to-refresh including:
 * - Initial state
 * - syncAll mutation trigger with async job initiation
 * - Progress polling and updates
 * - Status handling (pending, processing, completed, not_found)
 * - Success message formatting (items found, all caught up, with errors)
 * - Cooldown management
 * - Rate limit error handling
 * - Inbox invalidation on success
 * - Cooldown prevents multiple calls
 * - App resume with active job detection
 *
 * @see zine-oy9z: Task: Write E2E test for async pull-to-refresh flow
 */

import { renderHook, act } from '@testing-library/react-hooks';
import type { AppStateStatus } from 'react-native';

// ============================================================================
// Module-level Mocks
// ============================================================================

// Mock sync async mutation
const mockMutate = jest.fn();
let mockOnSuccess:
  | ((data: { jobId: string; total: number; existing: boolean }) => void)
  | undefined;
let mockOnError: ((error: { data?: { code?: string }; message?: string }) => void) | undefined;

// Mock status query
const mockStatusQuery = jest.fn();

// Mock active job query
const mockActiveJobQuery = jest.fn();

// Mock invalidate
const mockInvalidate = jest.fn();

// AppState event listener mock
let appStateCallback: ((state: AppStateStatus) => void) | null = null;
const mockAddEventListener = jest.fn((event: string, callback: (state: AppStateStatus) => void) => {
  if (event === 'change') {
    appStateCallback = callback;
  }
  return { remove: jest.fn() };
});

jest.mock('react-native', () => ({
  AppState: {
    addEventListener: mockAddEventListener,
  },
}));

jest.mock('../lib/trpc', () => ({
  trpc: {
    subscriptions: {
      syncAllAsync: {
        useMutation: () => ({
          mutate: (
            data: undefined,
            options: { onSuccess?: typeof mockOnSuccess; onError?: typeof mockOnError }
          ) => {
            mockOnSuccess = options.onSuccess;
            mockOnError = options.onError;
            mockMutate(data, options);
          },
        }),
      },
    },
    useUtils: () => ({
      client: {
        subscriptions: {
          syncStatus: {
            query: mockStatusQuery,
          },
          activeSyncJob: {
            query: mockActiveJobQuery,
          },
        },
      },
      items: {
        inbox: {
          invalidate: mockInvalidate,
        },
      },
    }),
  },
}));

// ============================================================================
// Test Setup
// ============================================================================

import { useSyncAll } from './use-sync-all';

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockOnSuccess = undefined;
  mockOnError = undefined;
  appStateCallback = null;
  mockActiveJobQuery.mockResolvedValue({ inProgress: false, jobId: null });
});

afterEach(() => {
  jest.useRealTimers();
});

// ============================================================================
// Tests
// ============================================================================

describe('useSyncAll (async pattern)', () => {
  describe('initial state', () => {
    it('should return initial state correctly', () => {
      const { result } = renderHook(() => useSyncAll());

      expect(result.current.isLoading).toBe(false);
      expect(result.current.cooldownSeconds).toBe(0);
      expect(result.current.lastResult).toBeNull();
      expect(result.current.progress).toBeNull();
      expect(typeof result.current.syncAll).toBe('function');
    });

    it('should check for active job on mount', async () => {
      renderHook(() => useSyncAll());

      // Allow promises to resolve
      await act(async () => {
        await Promise.resolve();
      });

      expect(mockActiveJobQuery).toHaveBeenCalled();
    });
  });

  describe('syncAll mutation', () => {
    it('should trigger mutation when syncAll called', () => {
      const { result } = renderHook(() => useSyncAll());

      act(() => {
        result.current.syncAll();
      });

      expect(mockMutate).toHaveBeenCalled();
    });

    it('should set isLoading and initial progress immediately', () => {
      const { result } = renderHook(() => useSyncAll());

      act(() => {
        result.current.syncAll();
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.progress).toEqual({
        total: 0,
        completed: 0,
        percentage: 0,
      });
    });

    it('should not trigger mutation while loading', () => {
      const { result } = renderHook(() => useSyncAll());

      act(() => {
        result.current.syncAll();
      });

      expect(mockMutate).toHaveBeenCalledTimes(1);

      // Try to call again while loading
      act(() => {
        result.current.syncAll();
      });

      expect(mockMutate).toHaveBeenCalledTimes(1);
    });

    it('should not trigger mutation during cooldown', () => {
      const { result } = renderHook(() => useSyncAll());

      // First call
      act(() => {
        result.current.syncAll();
      });

      expect(mockMutate).toHaveBeenCalledTimes(1);

      // Simulate no subscriptions (immediate completion)
      act(() => {
        mockOnSuccess?.({ jobId: 'job_1', total: 0, existing: false });
      });

      expect(result.current.cooldownSeconds).toBe(120);

      mockMutate.mockClear();

      // Try to call again during cooldown
      act(() => {
        result.current.syncAll();
      });

      expect(mockMutate).not.toHaveBeenCalled();
    });
  });

  describe('no subscriptions case', () => {
    it('should handle no subscriptions to sync', () => {
      const { result } = renderHook(() => useSyncAll());

      act(() => {
        result.current.syncAll();
        mockOnSuccess?.({ jobId: 'job_1', total: 0, existing: false });
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.progress).toBeNull();
      expect(result.current.lastResult?.message).toBe('No subscriptions to sync');
      expect(result.current.lastResult?.success).toBe(true);
      expect(result.current.cooldownSeconds).toBe(120);
    });
  });

  describe('job initiation and polling', () => {
    it('should update progress on successful job initiation', async () => {
      mockStatusQuery.mockResolvedValue({
        jobId: 'job_1',
        status: 'pending',
        total: 5,
        completed: 0,
        succeeded: 0,
        failed: 0,
        itemsFound: 0,
        progress: 0,
        errors: [],
      });

      const { result } = renderHook(() => useSyncAll());

      act(() => {
        result.current.syncAll();
      });

      // Simulate successful job initiation
      await act(async () => {
        mockOnSuccess?.({ jobId: 'job_1', total: 5, existing: false });
        await Promise.resolve();
      });

      // Progress should be updated
      expect(result.current.progress).toEqual({
        total: 5,
        completed: 0,
        percentage: 0,
      });
    });

    it('should start polling after job initiation', async () => {
      mockStatusQuery.mockResolvedValue({
        jobId: 'job_1',
        status: 'pending',
        total: 5,
        completed: 0,
        succeeded: 0,
        failed: 0,
        itemsFound: 0,
        progress: 0,
        errors: [],
      });

      const { result } = renderHook(() => useSyncAll());

      act(() => {
        result.current.syncAll();
      });

      // Simulate successful job initiation
      await act(async () => {
        mockOnSuccess?.({ jobId: 'job_1', total: 5, existing: false });
        await Promise.resolve();
      });

      // Should have started polling
      expect(mockStatusQuery).toHaveBeenCalledWith({ jobId: 'job_1' });
    });
  });

  describe('job completion', () => {
    it('should format success message when items found', async () => {
      mockStatusQuery.mockResolvedValue({
        jobId: 'job_1',
        status: 'completed',
        total: 3,
        completed: 3,
        succeeded: 3,
        failed: 0,
        itemsFound: 15,
        progress: 100,
        errors: [],
      });

      const { result } = renderHook(() => useSyncAll());

      act(() => {
        result.current.syncAll();
      });

      await act(async () => {
        mockOnSuccess?.({ jobId: 'job_1', total: 3, existing: false });
        await Promise.resolve();
      });

      expect(result.current.lastResult?.message).toBe('Found 15 new items');
      expect(result.current.isLoading).toBe(false);
      expect(result.current.lastResult?.success).toBe(true);
      expect(result.current.lastResult?.itemsFound).toBe(15);
    });

    it('should format success message for single item', async () => {
      mockStatusQuery.mockResolvedValue({
        jobId: 'job_1',
        status: 'completed',
        total: 1,
        completed: 1,
        succeeded: 1,
        failed: 0,
        itemsFound: 1,
        progress: 100,
        errors: [],
      });

      const { result } = renderHook(() => useSyncAll());

      act(() => {
        result.current.syncAll();
      });

      await act(async () => {
        mockOnSuccess?.({ jobId: 'job_1', total: 1, existing: false });
        await Promise.resolve();
      });

      expect(result.current.lastResult?.message).toBe('Found 1 new item');
    });

    it('should format success message for all caught up', async () => {
      mockStatusQuery.mockResolvedValue({
        jobId: 'job_1',
        status: 'completed',
        total: 3,
        completed: 3,
        succeeded: 3,
        failed: 0,
        itemsFound: 0,
        progress: 100,
        errors: [],
      });

      const { result } = renderHook(() => useSyncAll());

      act(() => {
        result.current.syncAll();
      });

      await act(async () => {
        mockOnSuccess?.({ jobId: 'job_1', total: 3, existing: false });
        await Promise.resolve();
      });

      expect(result.current.lastResult?.message).toBe('All caught up!');
    });

    it('should format success message with failures', async () => {
      mockStatusQuery.mockResolvedValue({
        jobId: 'job_1',
        status: 'completed',
        total: 3,
        completed: 3,
        succeeded: 2,
        failed: 1,
        itemsFound: 10,
        progress: 100,
        errors: [{ subscriptionId: 'sub_1', error: 'Connection failed' }],
      });

      const { result } = renderHook(() => useSyncAll());

      act(() => {
        result.current.syncAll();
      });

      await act(async () => {
        mockOnSuccess?.({ jobId: 'job_1', total: 3, existing: false });
        await Promise.resolve();
      });

      expect(result.current.lastResult?.message).toBe('Found 10 new items (1 failed)');
      expect(result.current.lastResult?.success).toBe(false);
      expect(result.current.lastResult?.errors).toEqual(['Connection failed']);
    });

    it('should format all caught up with failures', async () => {
      mockStatusQuery.mockResolvedValue({
        jobId: 'job_1',
        status: 'completed',
        total: 3,
        completed: 3,
        succeeded: 1,
        failed: 2,
        itemsFound: 0,
        progress: 100,
        errors: [
          { subscriptionId: 'sub_1', error: 'Error 1' },
          { subscriptionId: 'sub_2', error: 'Error 2' },
        ],
      });

      const { result } = renderHook(() => useSyncAll());

      act(() => {
        result.current.syncAll();
      });

      await act(async () => {
        mockOnSuccess?.({ jobId: 'job_1', total: 3, existing: false });
        await Promise.resolve();
      });

      expect(result.current.lastResult?.message).toBe('All caught up! (2 failed)');
    });

    it('should invalidate inbox on completion', async () => {
      mockStatusQuery.mockResolvedValue({
        jobId: 'job_1',
        status: 'completed',
        total: 1,
        completed: 1,
        succeeded: 1,
        failed: 0,
        itemsFound: 5,
        progress: 100,
        errors: [],
      });

      const { result } = renderHook(() => useSyncAll());

      act(() => {
        result.current.syncAll();
      });

      await act(async () => {
        mockOnSuccess?.({ jobId: 'job_1', total: 1, existing: false });
        await Promise.resolve();
      });

      expect(mockInvalidate).toHaveBeenCalled();
    });

    it('should set cooldown on completion', async () => {
      mockStatusQuery.mockResolvedValue({
        jobId: 'job_1',
        status: 'completed',
        total: 1,
        completed: 1,
        succeeded: 1,
        failed: 0,
        itemsFound: 5,
        progress: 100,
        errors: [],
      });

      const { result } = renderHook(() => useSyncAll());

      act(() => {
        result.current.syncAll();
      });

      await act(async () => {
        mockOnSuccess?.({ jobId: 'job_1', total: 1, existing: false });
        await Promise.resolve();
      });

      expect(result.current.cooldownSeconds).toBe(120);
    });
  });

  describe('job not found', () => {
    it('should clean up when job status is not_found', async () => {
      mockStatusQuery.mockResolvedValue({
        jobId: 'job_1',
        status: 'not_found',
        total: 0,
        completed: 0,
        succeeded: 0,
        failed: 0,
        itemsFound: 0,
        progress: 0,
        errors: [],
      });

      const { result } = renderHook(() => useSyncAll());

      act(() => {
        result.current.syncAll();
      });

      await act(async () => {
        mockOnSuccess?.({ jobId: 'job_1', total: 3, existing: false });
        await Promise.resolve();
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.progress).toBeNull();
    });
  });

  describe('cooldown management', () => {
    it('should countdown cooldown over time', () => {
      const { result } = renderHook(() => useSyncAll());

      act(() => {
        result.current.syncAll();
        mockOnSuccess?.({ jobId: 'job_1', total: 0, existing: false });
      });

      expect(result.current.cooldownSeconds).toBe(120);

      // Advance time by 1 second
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(result.current.cooldownSeconds).toBe(119);

      // Advance time by 10 more seconds
      act(() => {
        jest.advanceTimersByTime(10000);
      });

      expect(result.current.cooldownSeconds).toBe(109);
    });

    it('should reach zero and stop countdown', () => {
      const { result } = renderHook(() => useSyncAll());

      act(() => {
        result.current.syncAll();
        mockOnSuccess?.({ jobId: 'job_1', total: 0, existing: false });
      });

      // Advance past the full cooldown
      act(() => {
        jest.advanceTimersByTime(121000);
      });

      expect(result.current.cooldownSeconds).toBe(0);
    });

    it('should allow syncAll after cooldown expires', () => {
      const { result } = renderHook(() => useSyncAll());

      // First call
      act(() => {
        result.current.syncAll();
        mockOnSuccess?.({ jobId: 'job_1', total: 0, existing: false });
      });

      expect(mockMutate).toHaveBeenCalledTimes(1);
      mockMutate.mockClear();

      // Wait for cooldown to expire
      act(() => {
        jest.advanceTimersByTime(121000);
      });

      expect(result.current.cooldownSeconds).toBe(0);

      // Should work again
      act(() => {
        result.current.syncAll();
      });

      expect(mockMutate).toHaveBeenCalledTimes(1);
    });
  });

  describe('rate limit error handling', () => {
    it('should handle rate limit error', () => {
      const { result } = renderHook(() => useSyncAll());

      act(() => {
        result.current.syncAll();
        mockOnError?.({
          data: { code: 'TOO_MANY_REQUESTS' },
          message: 'Please wait 2 minutes between full syncs',
        });
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.progress).toBeNull();
      expect(result.current.lastResult?.success).toBe(false);
      expect(result.current.cooldownSeconds).toBe(120);
      expect(result.current.lastResult?.message).toBe('Try again in 2 minutes');
    });

    it('should parse cooldown from error message (minutes)', () => {
      const { result } = renderHook(() => useSyncAll());

      act(() => {
        result.current.syncAll();
        mockOnError?.({
          data: { code: 'TOO_MANY_REQUESTS' },
          message: 'Please wait 5 minutes between syncs',
        });
      });

      expect(result.current.cooldownSeconds).toBe(300); // 5 * 60
    });

    it('should parse cooldown from error message (seconds)', () => {
      const { result } = renderHook(() => useSyncAll());

      act(() => {
        result.current.syncAll();
        mockOnError?.({
          data: { code: 'TOO_MANY_REQUESTS' },
          message: 'Please wait 30 seconds',
        });
      });

      expect(result.current.cooldownSeconds).toBe(30);
    });

    it('should use default cooldown if cannot parse from message', () => {
      const { result } = renderHook(() => useSyncAll());

      act(() => {
        result.current.syncAll();
        mockOnError?.({
          data: { code: 'TOO_MANY_REQUESTS' },
          message: 'Rate limited',
        });
      });

      expect(result.current.cooldownSeconds).toBe(120);
    });

    it('should handle non-rate-limit errors', () => {
      const { result } = renderHook(() => useSyncAll());

      act(() => {
        result.current.syncAll();
        mockOnError?.({
          data: { code: 'INTERNAL_SERVER_ERROR' },
          message: 'Something went wrong',
        });
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.lastResult?.success).toBe(false);
      expect(result.current.lastResult?.message).toBe('Something went wrong');
      expect(result.current.cooldownSeconds).toBe(0); // No cooldown for non-rate-limit errors
    });

    it('should handle error with no message', () => {
      const { result } = renderHook(() => useSyncAll());

      act(() => {
        result.current.syncAll();
        mockOnError?.({
          data: { code: 'INTERNAL_SERVER_ERROR' },
        });
      });

      expect(result.current.lastResult?.success).toBe(false);
      expect(result.current.lastResult?.message).toBe('Sync failed');
    });
  });

  describe('existing job handling', () => {
    it('should start polling for existing job', async () => {
      mockStatusQuery.mockResolvedValue({
        jobId: 'existing_job',
        status: 'processing',
        total: 5,
        completed: 2,
        succeeded: 2,
        failed: 0,
        itemsFound: 10,
        progress: 40,
        errors: [],
      });

      const { result } = renderHook(() => useSyncAll());

      act(() => {
        result.current.syncAll();
      });

      // Simulate existing job response
      await act(async () => {
        mockOnSuccess?.({ jobId: 'existing_job', total: 5, existing: true });
        await Promise.resolve();
      });

      // Should have started polling
      expect(mockStatusQuery).toHaveBeenCalledWith({ jobId: 'existing_job' });

      // Progress should reflect polling status
      expect(result.current.progress?.completed).toBe(2);
    });
  });

  describe('app resume with active job', () => {
    it('should resume polling for active job on app resume', async () => {
      mockActiveJobQuery.mockResolvedValue({
        inProgress: true,
        jobId: 'active_job',
        progress: {
          total: 5,
          completed: 3,
          status: 'processing',
        },
      });

      mockStatusQuery.mockResolvedValue({
        jobId: 'active_job',
        status: 'processing',
        total: 5,
        completed: 3,
        succeeded: 3,
        failed: 0,
        itemsFound: 15,
        progress: 60,
        errors: [],
      });

      const { result } = renderHook(() => useSyncAll());

      // Simulate app coming to foreground
      await act(async () => {
        appStateCallback?.('active');
        await Promise.resolve();
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.progress).toEqual({
        total: 5,
        completed: 3,
        percentage: 60,
      });
    });

    it('should not resume if no active job', async () => {
      mockActiveJobQuery.mockResolvedValue({
        inProgress: false,
        jobId: null,
      });

      const { result } = renderHook(() => useSyncAll());

      // Simulate app coming to foreground
      await act(async () => {
        appStateCallback?.('active');
        await Promise.resolve();
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.progress).toBeNull();
    });
  });
});
