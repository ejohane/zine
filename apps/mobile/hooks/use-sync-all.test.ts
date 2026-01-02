/**
 * Tests for hooks/use-sync-all.ts
 *
 * Tests the useSyncAll hook including:
 * - Initial state
 * - syncAll mutation trigger
 * - Success message formatting (items found, all caught up, with errors)
 * - Cooldown management
 * - Rate limit error handling
 * - Inbox invalidation on success
 * - Cooldown prevents multiple calls
 *
 * @see features/subscriptions/frontend-spec.md
 */

import { renderHook, act } from '@testing-library/react-hooks';

// ============================================================================
// Module-level Mocks
// ============================================================================

const mockMutate = jest.fn();
const mockInvalidate = jest.fn();
let mockOnSuccess:
  | ((data: { synced: number; itemsFound: number; errors: string[] }) => void)
  | undefined;
let mockOnError: ((error: { data?: { code?: string }; message?: string }) => void) | undefined;
let mockIsPending = false;

jest.mock('../lib/trpc', () => ({
  trpc: {
    subscriptions: {
      syncAll: {
        useMutation: (options: {
          onSuccess?: (data: { synced: number; itemsFound: number; errors: string[] }) => void;
          onError?: (error: { data?: { code?: string }; message?: string }) => void;
        }) => {
          mockOnSuccess = options.onSuccess;
          mockOnError = options.onError;
          return {
            mutate: mockMutate,
            isPending: mockIsPending,
          };
        },
      },
    },
    useUtils: () => ({
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
  mockIsPending = false;
  mockOnSuccess = undefined;
  mockOnError = undefined;
});

afterEach(() => {
  jest.useRealTimers();
});

// ============================================================================
// Tests
// ============================================================================

describe('useSyncAll', () => {
  describe('initial state', () => {
    it('should return initial state correctly', () => {
      const { result } = renderHook(() => useSyncAll());

      expect(result.current.isLoading).toBe(false);
      expect(result.current.cooldownSeconds).toBe(0);
      expect(result.current.lastResult).toBeNull();
      expect(typeof result.current.syncAll).toBe('function');
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

    it('should not trigger mutation while loading', () => {
      mockIsPending = true;

      const { result } = renderHook(() => useSyncAll());

      act(() => {
        result.current.syncAll();
      });

      expect(mockMutate).not.toHaveBeenCalled();
    });
  });

  describe('success message formatting', () => {
    it('should format success message for found items (singular)', () => {
      const { result } = renderHook(() => useSyncAll());

      act(() => {
        result.current.syncAll();
        mockOnSuccess?.({
          synced: 5,
          itemsFound: 1,
          errors: [],
        });
      });

      expect(result.current.lastResult?.message).toBe('Found 1 new item');
      expect(result.current.lastResult?.success).toBe(true);
    });

    it('should format success message for found items (plural)', () => {
      const { result } = renderHook(() => useSyncAll());

      act(() => {
        result.current.syncAll();
        mockOnSuccess?.({
          synced: 5,
          itemsFound: 3,
          errors: [],
        });
      });

      expect(result.current.lastResult?.message).toBe('Found 3 new items');
      expect(result.current.lastResult?.success).toBe(true);
    });

    it('should format success message for all caught up', () => {
      const { result } = renderHook(() => useSyncAll());

      act(() => {
        result.current.syncAll();
        mockOnSuccess?.({
          synced: 5,
          itemsFound: 0,
          errors: [],
        });
      });

      expect(result.current.lastResult?.message).toBe('All caught up!');
      expect(result.current.lastResult?.success).toBe(true);
    });

    it('should format success message when no subscriptions to sync', () => {
      const { result } = renderHook(() => useSyncAll());

      act(() => {
        result.current.syncAll();
        mockOnSuccess?.({
          synced: 0,
          itemsFound: 0,
          errors: [],
        });
      });

      expect(result.current.lastResult?.message).toBe('No subscriptions to sync');
      expect(result.current.lastResult?.success).toBe(true);
    });

    it('should format success message with errors (singular)', () => {
      const { result } = renderHook(() => useSyncAll());

      act(() => {
        result.current.syncAll();
        mockOnSuccess?.({
          synced: 3,
          itemsFound: 2,
          errors: ['YouTube: Channel1'],
        });
      });

      expect(result.current.lastResult?.message).toBe('Found 2 new items (1 failed)');
      expect(result.current.lastResult?.success).toBe(true);
      expect(result.current.lastResult?.errors).toEqual(['YouTube: Channel1']);
    });

    it('should format success message with multiple errors', () => {
      const { result } = renderHook(() => useSyncAll());

      act(() => {
        result.current.syncAll();
        mockOnSuccess?.({
          synced: 3,
          itemsFound: 0,
          errors: ['YouTube: Channel1', 'Spotify: Show1', 'YouTube: Channel2'],
        });
      });

      expect(result.current.lastResult?.message).toBe('All caught up! (3 failed)');
      expect(result.current.lastResult?.errors).toHaveLength(3);
    });

    it('should store full result data on success', () => {
      const { result } = renderHook(() => useSyncAll());

      act(() => {
        result.current.syncAll();
        mockOnSuccess?.({
          synced: 5,
          itemsFound: 3,
          errors: ['YouTube: Test'],
        });
      });

      expect(result.current.lastResult).toEqual({
        success: true,
        synced: 5,
        itemsFound: 3,
        errors: ['YouTube: Test'],
        message: 'Found 3 new items (1 failed)',
      });
    });
  });

  describe('cooldown management', () => {
    it('should set cooldown after success', () => {
      const { result } = renderHook(() => useSyncAll());

      act(() => {
        result.current.syncAll();
        mockOnSuccess?.({
          synced: 5,
          itemsFound: 3,
          errors: [],
        });
      });

      expect(result.current.cooldownSeconds).toBe(120);
    });

    it('should countdown cooldown over time', () => {
      const { result } = renderHook(() => useSyncAll());

      act(() => {
        result.current.syncAll();
        mockOnSuccess?.({
          synced: 1,
          itemsFound: 0,
          errors: [],
        });
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
        mockOnSuccess?.({
          synced: 1,
          itemsFound: 0,
          errors: [],
        });
      });

      // Advance past the full cooldown
      act(() => {
        jest.advanceTimersByTime(121000);
      });

      expect(result.current.cooldownSeconds).toBe(0);
    });

    it('should not trigger syncAll during cooldown', () => {
      const { result } = renderHook(() => useSyncAll());

      // First call
      act(() => {
        result.current.syncAll();
        mockOnSuccess?.({
          synced: 1,
          itemsFound: 1,
          errors: [],
        });
      });

      expect(mockMutate).toHaveBeenCalledTimes(1);

      // Clear mock to track second call
      mockMutate.mockClear();

      // Try to call again while in cooldown
      act(() => {
        result.current.syncAll();
      });

      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('should allow syncAll after cooldown expires', () => {
      const { result } = renderHook(() => useSyncAll());

      // First call
      act(() => {
        result.current.syncAll();
        mockOnSuccess?.({
          synced: 1,
          itemsFound: 1,
          errors: [],
        });
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
    it('should handle rate limit error with code', () => {
      const { result } = renderHook(() => useSyncAll());

      act(() => {
        result.current.syncAll();
        mockOnError?.({
          data: { code: 'TOO_MANY_REQUESTS' },
          message: 'Please wait 2 minutes between full syncs',
        });
      });

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

  describe('inbox invalidation', () => {
    it('should invalidate inbox on success', () => {
      const { result } = renderHook(() => useSyncAll());

      act(() => {
        result.current.syncAll();
        mockOnSuccess?.({
          synced: 1,
          itemsFound: 1,
          errors: [],
        });
      });

      expect(mockInvalidate).toHaveBeenCalled();
    });

    it('should invalidate inbox even when no new items found', () => {
      const { result } = renderHook(() => useSyncAll());

      act(() => {
        result.current.syncAll();
        mockOnSuccess?.({
          synced: 5,
          itemsFound: 0,
          errors: [],
        });
      });

      expect(mockInvalidate).toHaveBeenCalled();
    });

    it('should not invalidate inbox on error', () => {
      const { result } = renderHook(() => useSyncAll());

      act(() => {
        result.current.syncAll();
        mockOnError?.({
          data: { code: 'INTERNAL_SERVER_ERROR' },
          message: 'Error',
        });
      });

      expect(mockInvalidate).not.toHaveBeenCalled();
    });
  });

  describe('isLoading state', () => {
    it('should expose isPending as isLoading', () => {
      mockIsPending = true;
      const { result } = renderHook(() => useSyncAll());

      expect(result.current.isLoading).toBe(true);
    });
  });
});
