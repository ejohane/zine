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
const mockConnectionsSetData = jest.fn();
const mockConnectionsInvalidate = jest.fn();
const mockSubscriptionsCancel = jest.fn();
const mockSubscriptionsGetData = jest.fn();
const mockSubscriptionsSetData = jest.fn();
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
            setData: mockConnectionsSetData,
            invalidate: mockConnectionsInvalidate,
          },
        },
        list: {
          cancel: mockSubscriptionsCancel,
          getData: mockSubscriptionsGetData,
          setData: mockSubscriptionsSetData,
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
import type { SubscriptionsResponse, Subscription } from './use-subscriptions-query';

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

function createSubscription(provider: Subscription['provider']): Subscription {
  return {
    id: `sub-${provider.toLowerCase()}`,
    provider,
    providerChannelId: `channel-${provider.toLowerCase()}`,
    name: `${provider} Channel`,
    imageUrl: null,
    status: 'ACTIVE',
    createdAt: Date.now(),
    lastItemAt: null,
  };
}

function createSubscriptionsResponse(): SubscriptionsResponse {
  return {
    items: [createSubscription('YOUTUBE'), createSubscription('SPOTIFY')],
    nextCursor: null,
    hasMore: false,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  shouldDisconnectError = false;

  const subscriptionsResponse = createSubscriptionsResponse();

  mockGetData.mockReturnValue([createConnection('YOUTUBE'), createConnection('SPOTIFY')]);
  mockSubscriptionsGetData.mockImplementation((input: { limit?: number } | undefined) => {
    if (!input || Object.keys(input).length === 0) {
      return subscriptionsResponse;
    }

    if (input.limit === 50) {
      return subscriptionsResponse;
    }

    return undefined;
  });
});

// ============================================================================
// useDisconnectConnection Tests
// ============================================================================

describe('useDisconnectConnection', () => {
  it('marks the provider as disconnected optimistically', async () => {
    const { result } = renderHook(() => useDisconnectConnection());

    await act(async () => {
      await result.current.mutate({ provider: 'YOUTUBE' });
    });

    const [queryKey, updater] = mockConnectionsSetData.mock.calls[0];
    expect(queryKey).toBeUndefined();

    const updated = updater([createConnection('YOUTUBE'), createConnection('SPOTIFY')]);
    expect(updated).toHaveLength(2);

    const youtubeConnection = updated.find(
      (connection: Connection) => connection.provider === 'YOUTUBE'
    );
    expect(youtubeConnection?.status).toBe('REVOKED');

    const defaultCall = mockSubscriptionsSetData.mock.calls.find(
      ([input]) => input && Object.keys(input).length === 0
    );
    const limitedCall = mockSubscriptionsSetData.mock.calls.find(([input]) => input?.limit === 50);

    expect(defaultCall).toBeDefined();
    expect(limitedCall).toBeDefined();

    const updatedDefault = defaultCall?.[1](createSubscriptionsResponse()) as SubscriptionsResponse;
    const updatedLimited = limitedCall?.[1](createSubscriptionsResponse()) as SubscriptionsResponse;

    expect(
      updatedDefault.items.find((item: Subscription) => item.provider === 'YOUTUBE')?.status
    ).toBe('DISCONNECTED');
    expect(
      updatedLimited.items.find((item: Subscription) => item.provider === 'YOUTUBE')?.status
    ).toBe('DISCONNECTED');
  });

  it('rolls back to previous connections on error', async () => {
    shouldDisconnectError = true;
    const previous = [createConnection('YOUTUBE')];
    const previousSubscriptions = createSubscriptionsResponse();
    mockGetData.mockReturnValue(previous);
    mockSubscriptionsGetData.mockReturnValue(previousSubscriptions);

    const { result } = renderHook(() => useDisconnectConnection());

    await act(async () => {
      await expect(result.current.mutate({ provider: 'YOUTUBE' })).rejects.toThrow(
        'Failed to disconnect'
      );
    });

    const rollbackCall =
      mockConnectionsSetData.mock.calls[mockConnectionsSetData.mock.calls.length - 1];
    expect(rollbackCall[1]).toBe(previous);

    const defaultRollback = mockSubscriptionsSetData.mock.calls.find(
      ([input, data]) => input && Object.keys(input).length === 0 && data === previousSubscriptions
    );
    const limitedRollback = mockSubscriptionsSetData.mock.calls.find(
      ([input, data]) => input?.limit === 50 && data === previousSubscriptions
    );

    expect(defaultRollback).toBeDefined();
    expect(limitedRollback).toBeDefined();
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
