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
const mockNewslettersListCancel = jest.fn();
const mockNewslettersListGetData = jest.fn();
const mockNewslettersListSetData = jest.fn();
const mockNewslettersListInvalidate = jest.fn();
const mockNewslettersStatsCancel = jest.fn();
const mockNewslettersStatsGetData = jest.fn();
const mockNewslettersStatsSetData = jest.fn();
const mockNewslettersStatsInvalidate = jest.fn();
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
              options?.onSuccess?.(undefined, input, context);
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
        newsletters: {
          list: {
            cancel: mockNewslettersListCancel,
            getData: mockNewslettersListGetData,
            setData: mockNewslettersListSetData,
            invalidate: mockNewslettersListInvalidate,
          },
          stats: {
            cancel: mockNewslettersStatsCancel,
            getData: mockNewslettersStatsGetData,
            setData: mockNewslettersStatsSetData,
            invalidate: mockNewslettersStatsInvalidate,
          },
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

function createConnectionsMap() {
  return {
    YOUTUBE: {
      provider: 'YOUTUBE',
      status: 'ACTIVE',
      connectedAt: Date.now(),
      lastRefreshedAt: null,
    },
    SPOTIFY: {
      provider: 'SPOTIFY',
      status: 'ACTIVE',
      connectedAt: Date.now(),
      lastRefreshedAt: null,
    },
    GMAIL: {
      provider: 'GMAIL',
      status: 'ACTIVE',
      connectedAt: Date.now(),
      lastRefreshedAt: null,
    },
  };
}

function createNewsletterStats() {
  return {
    total: 10,
    active: 4,
    hidden: 2,
    unsubscribed: 4,
    lastSyncAt: Date.now(),
    lastSyncStatus: 'SUCCESS',
    lastSyncError: null,
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
  mockNewslettersListGetData.mockReturnValue({
    items: [{ id: 'feed-1' }],
    nextCursor: null,
    hasMore: false,
  });
  mockNewslettersStatsGetData.mockReturnValue(createNewsletterStats());
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
    expect(updated).toHaveLength(1);
    expect(updated[0].provider).toBe('SPOTIFY');

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

  it('handles object-shaped connections cache during optimistic update', async () => {
    const { result } = renderHook(() => useDisconnectConnection());

    await act(async () => {
      await result.current.mutate({ provider: 'GMAIL' });
    });

    const [queryKey, updater] = mockConnectionsSetData.mock.calls[0];
    expect(queryKey).toBeUndefined();

    const updated = updater(createConnectionsMap());
    expect(updated.GMAIL).toBeNull();
    expect(updated.YOUTUBE).not.toBeNull();
    expect(updated.SPOTIFY).not.toBeNull();
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

  it('clears and invalidates newsletter caches for Gmail disconnect', async () => {
    const { result } = renderHook(() => useDisconnectConnection());

    await act(async () => {
      await result.current.mutate({ provider: 'GMAIL' });
    });

    expect(mockNewslettersListCancel).toHaveBeenCalledWith({ limit: 100, search: undefined });
    expect(mockNewslettersStatsCancel).toHaveBeenCalled();

    const listClearCall = mockNewslettersListSetData.mock.calls.find(
      ([input]) => input?.limit === 100 && input?.search === undefined
    );
    expect(listClearCall).toBeDefined();
    expect(listClearCall?.[1]).toEqual({
      items: [],
      nextCursor: null,
      hasMore: false,
    });

    const statsUpdateCall = mockNewslettersStatsSetData.mock.calls.find(
      ([input]) => input === undefined
    );
    expect(statsUpdateCall).toBeDefined();
    const updatedStats = statsUpdateCall?.[1](createNewsletterStats());
    expect(updatedStats.total).toBe(0);
    expect(updatedStats.active).toBe(0);
    expect(updatedStats.lastSyncStatus).toBe('IDLE');

    expect(mockNewslettersListInvalidate).toHaveBeenCalled();
    expect(mockNewslettersStatsInvalidate).toHaveBeenCalled();
  });
});
