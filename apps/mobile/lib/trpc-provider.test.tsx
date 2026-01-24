/**
 * Tests for providers/trpc-provider.tsx
 *
 * Ensures the offline queue processed callback invalidates
 * the subscription and item queries after queued mutations.
 */

import React from 'react';
import { Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { getQueryKey } from '@trpc/react-query';
import { trpc } from '@/lib/trpc';
import { TRPCProvider } from '@/providers/trpc-provider';
import { setQueueProcessedCallback } from '@/lib/trpc-offline-client';
import { PERSISTENCE_MAX_AGE_MS, PERSISTENCE_STORAGE_PREFIX } from '@/lib/query-persistence';
import { act, create } from 'react-test-renderer';

let mockQueryClient: {
  invalidateQueries: jest.Mock;
  clear: jest.Mock;
};
type PersistOptions = {
  buster: string;
  maxAge: number;
  persister: { removeClient: jest.Mock };
  dehydrateOptions: {
    shouldDehydrateQuery: (query: { queryKey: unknown; state: { status: string } }) => boolean;
  };
};

let mockUserId = 'user-123';
let latestPersistOptions: PersistOptions | null = null;
const mockRemoveClient = jest.fn(async () => undefined);
const mockUseIsRestoring = jest.fn(() => false);

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
}));

const mockGetItem = AsyncStorage.getItem as jest.Mock;

jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query');
  mockQueryClient = new actual.QueryClient();
  return {
    ...actual,
    QueryClient: jest.fn(() => mockQueryClient),
    useIsRestoring: mockUseIsRestoring,
  };
});

jest.mock('@tanstack/react-query-persist-client', () => ({
  PersistQueryClientProvider: ({
    children,
    persistOptions,
  }: {
    children: React.ReactNode;
    persistOptions: PersistOptions;
  }) => {
    latestPersistOptions = persistOptions;
    return <>{children}</>;
  },
}));

jest.mock('@tanstack/query-async-storage-persister', () => ({
  createAsyncStoragePersister: jest.fn(() => ({
    removeClient: mockRemoveClient,
  })),
}));

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({
    getToken: jest.fn(async () => 'token'),
    userId: mockUserId,
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
    mockUserId = 'user-123';
    latestPersistOptions = null;
    mockUseIsRestoring.mockReturnValue(false);
    mockGetItem.mockResolvedValue(null);
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

describe('TRPCProvider cache persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = 'user-123';
    latestPersistOptions = null;
    mockUseIsRestoring.mockReturnValue(false);
    mockGetItem.mockResolvedValue(null);
  });

  it('configures a user-scoped persister with allowlisted queries', () => {
    act(() => {
      create(
        <TRPCProvider>
          <></>
        </TRPCProvider>
      );
    });

    expect(latestPersistOptions).not.toBeNull();
    expect(latestPersistOptions?.maxAge).toBe(PERSISTENCE_MAX_AGE_MS);

    const persisterArgs = (createAsyncStoragePersister as jest.Mock).mock.calls[0][0] as {
      key: string;
    };

    expect(persisterArgs.key).toContain(`${PERSISTENCE_STORAGE_PREFIX}user-123:`);

    const shouldDehydrate = latestPersistOptions?.dehydrateOptions.shouldDehydrateQuery;
    expect(shouldDehydrate?.({ queryKey: [['items', 'home']], state: { status: 'success' } })).toBe(
      true
    );
    expect(
      shouldDehydrate?.({
        queryKey: [['subscriptions', 'connections', 'list']],
        state: { status: 'success' },
      })
    ).toBe(true);
    expect(shouldDehydrate?.({ queryKey: [['items', 'home']], state: { status: 'error' } })).toBe(
      false
    );
    expect(
      shouldDehydrate?.({
        queryKey: [['subscriptions', 'syncStatus']],
        state: { status: 'success' },
      })
    ).toBe(false);
    expect(
      shouldDehydrate?.({
        queryKey: [['creators', 'fetchLatestContent']],
        state: { status: 'success' },
      })
    ).toBe(false);
    expect(
      shouldDehydrate?.({ queryKey: [['bookmarks', 'preview']], state: { status: 'success' } })
    ).toBe(false);
  });

  it('hides children while restoring persisted cache', async () => {
    mockUseIsRestoring.mockReturnValue(true);
    mockGetItem.mockResolvedValueOnce('cached');

    const MockChild = () => <Text>content</Text>;

    let renderer: ReturnType<typeof create> | null = null;

    await act(async () => {
      renderer = create(
        <TRPCProvider>
          <MockChild />
        </TRPCProvider>
      );
      await Promise.resolve();
    });

    const getChild = () => {
      if (!renderer) {
        throw new Error('Renderer not set');
      }
      return renderer.root.findByType(MockChild);
    };

    expect(getChild).toThrow();
  });

  it('renders children during restore when no cache exists', async () => {
    mockUseIsRestoring.mockReturnValue(true);
    mockGetItem.mockResolvedValueOnce(null);

    const MockChild = () => <Text>content</Text>;

    let renderer: ReturnType<typeof create> | null = null;

    await act(async () => {
      renderer = create(
        <TRPCProvider>
          <MockChild />
        </TRPCProvider>
      );
      await Promise.resolve();
    });

    if (!renderer) {
      throw new Error('Renderer not set');
    }

    expect(renderer.root.findByType(MockChild)).toBeTruthy();
  });

  it('clears cache and persisted data on user switch', () => {
    const clearSpy = jest.spyOn(mockQueryClient, 'clear');

    const renderer = create(
      <TRPCProvider>
        <></>
      </TRPCProvider>
    );

    expect(mockRemoveClient).not.toHaveBeenCalled();

    mockUserId = 'user-456';

    act(() => {
      renderer.update(
        <TRPCProvider>
          <></>
        </TRPCProvider>
      );
    });

    expect(mockRemoveClient).toHaveBeenCalledTimes(1);
    expect(clearSpy).toHaveBeenCalledTimes(1);

    const persisterCalls = (createAsyncStoragePersister as jest.Mock).mock.calls;
    expect(persisterCalls.length).toBeGreaterThanOrEqual(2);
    expect(persisterCalls[1][0].key).toContain(`${PERSISTENCE_STORAGE_PREFIX}user-456:`);
  });
});
