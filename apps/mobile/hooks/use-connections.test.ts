/**
 * Tests for hooks/use-connections.ts
 *
 * Covers optimistic disconnect updates and cache invalidation.
 */

import { renderHook, act } from '@testing-library/react-hooks';

// ============================================================================
// Module-level Mocks
// ============================================================================

const mockCancel = jest.fn();
const mockGetData = jest.fn();
const mockSetData = jest.fn();
const mockConnectionsInvalidate = jest.fn();
const mockSubscriptionsInvalidate = jest.fn();
let shouldDisconnectError = false;

jest.mock('../lib/trpc', () => ({
  trpc: {
    subscriptions: {
      connections: {
        disconnect: {
          useMutation: jest.fn((options) => {
            const runMutation = async (input: unknown) => {
              const context = await options?.onMutate?.(input);
              if (shouldDisconnectError) {
                const error = new Error('Failed to disconnect');
                options?.onError?.(error, input, context);
                options?.onSettled?.();
                throw error;
              }
              options?.onSuccess?.();
              options?.onSettled?.();
              return undefined;
            };

            return {
              mutate: runMutation,
              isPending: false,
            };
          }),
        },
      },
    },
    useUtils: jest.fn(() => ({
      subscriptions: {
        connections: {
          list: {
            cancel: mockCancel,
            getData: mockGetData,
            setData: mockSetData,
            invalidate: mockConnectionsInvalidate,
          },
        },
        list: {
          invalidate: mockSubscriptionsInvalidate,
        },
      },
    })),
  },
}));

// ============================================================================
// Test Setup
// ============================================================================

import { useDisconnectConnection, type Connection } from './use-connections';

function createConnection(provider: Connection['provider']): Connection {
  return {
    id: `connection-${provider.toLowerCase()}`,
    provider,
    status: 'ACTIVE',
    providerUserId: null,
    createdAt: new Date('2024-01-01').toISOString(),
    lastSyncAt: null,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  shouldDisconnectError = false;

  mockGetData.mockReturnValue([createConnection('YOUTUBE'), createConnection('SPOTIFY')]);
});

// ============================================================================
// useDisconnectConnection Tests
// ============================================================================

describe('useDisconnectConnection', () => {
  it('removes the provider optimistically', async () => {
    const { result } = renderHook(() => useDisconnectConnection());

    await act(async () => {
      await result.current.mutate({ provider: 'YOUTUBE' });
    });

    const [queryKey, updater] = mockSetData.mock.calls[0];
    expect(queryKey).toBeUndefined();

    const updated = updater([createConnection('YOUTUBE'), createConnection('SPOTIFY')]);
    expect(updated).toHaveLength(1);
    expect(updated[0].provider).toBe('SPOTIFY');
  });

  it('rolls back to previous connections on error', async () => {
    shouldDisconnectError = true;
    const previous = [createConnection('YOUTUBE')];
    mockGetData.mockReturnValue(previous);

    const { result } = renderHook(() => useDisconnectConnection());

    await act(async () => {
      await expect(result.current.mutate({ provider: 'YOUTUBE' })).rejects.toThrow(
        'Failed to disconnect'
      );
    });

    const rollbackCall = mockSetData.mock.calls[mockSetData.mock.calls.length - 1];
    expect(rollbackCall[1]).toBe(previous);
  });

  it('invalidates caches on success', async () => {
    const { result } = renderHook(() => useDisconnectConnection());

    await act(async () => {
      await result.current.mutate({ provider: 'YOUTUBE' });
    });

    expect(mockConnectionsInvalidate).toHaveBeenCalled();
    expect(mockSubscriptionsInvalidate).toHaveBeenCalled();
  });
});
