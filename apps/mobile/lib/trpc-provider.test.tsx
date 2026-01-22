/**
 * Tests for providers/trpc-provider.tsx
 *
 * Ensures the offline queue processed callback invalidates
 * the subscription and item queries after queued mutations.
 */

import React from 'react';
import { getQueryKey } from '@trpc/react-query';
import { trpc } from '@/lib/trpc';
import { TRPCProvider } from '@/providers/trpc-provider';
import { setQueueProcessedCallback } from '@/lib/trpc-offline-client';
import { act, create } from 'react-test-renderer';

let mockQueryClient: {
  invalidateQueries: jest.Mock;
  clear: jest.Mock;
};

jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query');
  mockQueryClient = new actual.QueryClient();
  return {
    ...actual,
    QueryClient: jest.fn(() => mockQueryClient),
    useIsRestoring: jest.fn(() => false),
  };
});

jest.mock('@tanstack/react-query-persist-client', () => ({
  PersistQueryClientProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@tanstack/query-async-storage-persister', () => ({
  createAsyncStoragePersister: jest.fn(() => ({})),
}));

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({
    getToken: jest.fn(async () => 'token'),
    userId: 'user-123',
  }),
}));

jest.mock('@/lib/oauth', () => ({
  setTokenGetter: jest.fn(),
}));

jest.mock('@/lib/trpc-offline-client', () => ({
  setQueueProcessedCallback: jest.fn(),
}));

// ==========================================================================
// Tests
// ==========================================================================

describe('TRPCProvider offline queue invalidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers offline queue callback with query invalidations', () => {
    const invalidateSpy = jest.spyOn(mockQueryClient, 'invalidateQueries');

    act(() => {
      create(
        <TRPCProvider>
          <></>
        </TRPCProvider>
      );
    });

    expect(setQueueProcessedCallback).toHaveBeenCalledTimes(1);

    const callback = (setQueueProcessedCallback as jest.Mock).mock.calls[0][0] as () => void;

    act(() => {
      callback();
    });

    const expectedQueryKeys = [
      getQueryKey(trpc.subscriptions.list),
      getQueryKey(trpc.subscriptions.connections.list),
      getQueryKey(trpc.items.inbox),
      getQueryKey(trpc.items.library),
      getQueryKey(trpc.items.home),
    ];

    expect(invalidateSpy).toHaveBeenCalledTimes(expectedQueryKeys.length);

    expectedQueryKeys.forEach((queryKey) => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey });
    });
  });
});
