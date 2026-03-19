/**
 * Tests for providers/trpc-provider.tsx
 *
 * Ensures the offline queue processed callback invalidates
 * the subscription and item queries after queued mutations.
 */

import React from 'react';
import { AppState, Text } from 'react-native';
import type { AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { httpBatchLink } from '@trpc/client';
import { getQueryKey } from '@trpc/react-query';
import { trpc } from '@/lib/trpc';
import { TRPCProvider } from '@/providers/trpc-provider';
import { setQueueProcessedCallback } from '@/lib/trpc-offline-client';
import { buildMobileTelemetryHeaders, telemetryFetch } from '@/lib/trpc-transport';
import { PERSISTENCE_MAX_AGE_MS, PERSISTENCE_STORAGE_PREFIX } from '@/lib/query-persistence';
import { act, create } from 'react-test-renderer';
type PersistOptions = {
  buster: string;
  maxAge: number;
  persister: { removeClient: jest.Mock };
  dehydrateOptions: {
    shouldDehydrateQuery: (query: { queryKey: unknown; state: { status: string } }) => boolean;
  };
};

let mockUserId = 'user-123';
const mockGetToken = jest.fn();
const mockSignOut = jest.fn(async () => undefined);
const mockUseAuthAvailability = jest.fn(() => ({ isEnabled: true }));
let latestPersistOptions: PersistOptions | null = null;
const mockRemoveClient = jest.fn(async () => undefined);
const mockUseIsRestoring = jest.fn(() => false);
let appStateCallback: ((state: AppStateStatus) => void) | null = null;
const mockAppStateAddEventListener = jest.fn(
  (event: string, callback: (state: AppStateStatus) => void) => {
    if (event === 'change') {
      appStateCallback = callback;
    }

    return { remove: jest.fn() };
  }
);

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
}));

const mockGetItem = AsyncStorage.getItem as jest.Mock;

jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query');
  return {
    ...actual,
    useIsRestoring: () => mockUseIsRestoring(),
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

jest.mock('@trpc/client', () => {
  const actual = jest.requireActual('@trpc/client');
  return {
    ...actual,
    httpBatchLink: jest.fn((options) => {
      const link = jest.fn(() => jest.fn());
      Object.assign(link, { options });
      return link;
    }),
  };
});

jest.mock('superjson', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({
    getToken: mockGetToken,
    isLoaded: true,
    isSignedIn: true,
    userId: mockUserId,
  }),
  useClerk: () => ({
    signOut: mockSignOut,
  }),
}));

jest.mock('@/lib/oauth', () => ({
  setTokenGetter: jest.fn(),
}));

jest.mock('@/lib/trpc-offline-client', () => ({
  setQueueProcessedCallback: jest.fn(),
}));

jest.mock('@/lib/trpc-transport', () => ({
  buildMobileTelemetryHeaders: jest.fn((headers: Record<string, string>) => ({
    ...headers,
    'X-Trace-ID': 'trc_test_header',
  })),
  telemetryFetch: jest.fn(),
}));

jest.mock('@/providers/auth-provider', () => ({
  useAuthAvailability: () => mockUseAuthAvailability(),
}));

// ==========================================================================
// Tests
// ==========================================================================

afterEach(() => {
  jest.restoreAllMocks();
});

describe('TRPCProvider offline queue invalidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = 'user-123';
    mockGetToken.mockResolvedValue('token');
    mockSignOut.mockResolvedValue(undefined);
    latestPersistOptions = null;
    mockUseIsRestoring.mockReturnValue(false);
    mockGetItem.mockResolvedValue(null);
    mockUseAuthAvailability.mockReturnValue({ isEnabled: true });
    appStateCallback = null;
    (AppState.addEventListener as jest.Mock).mockImplementation(mockAppStateAddEventListener);
  });

  it('registers offline queue callback with query invalidations', () => {
    const invalidateSpy = jest.spyOn(QueryClient.prototype, 'invalidateQueries');

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
      getQueryKey(trpc.insights.weeklyRecap),
      getQueryKey(trpc.insights.weeklyRecapTeaser),
    ];

    expect(invalidateSpy).toHaveBeenCalledTimes(expectedQueryKeys.length);

    expectedQueryKeys.forEach((queryKey) => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey });
    });
  });
});

describe('TRPCProvider transport wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = 'user-123';
    mockGetToken.mockResolvedValue('token');
    mockSignOut.mockResolvedValue(undefined);
    latestPersistOptions = null;
    mockUseIsRestoring.mockReturnValue(false);
    mockGetItem.mockResolvedValue(null);
    mockUseAuthAvailability.mockReturnValue({ isEnabled: true });
  });

  it('configures httpBatchLink with telemetry headers and telemetry fetch', async () => {
    act(() => {
      create(
        <TRPCProvider>
          <></>
        </TRPCProvider>
      );
    });

    expect(httpBatchLink).toHaveBeenCalledWith(
      expect.objectContaining({
        fetch: expect.any(Function),
        headers: expect.any(Function),
      })
    );

    const headers = await (httpBatchLink as jest.Mock).mock.calls[0][0].headers();

    expect(buildMobileTelemetryHeaders).toHaveBeenCalledWith({ Authorization: 'Bearer token' });
    expect(headers).toEqual({
      Authorization: 'Bearer token',
      'X-Trace-ID': 'trc_test_header',
    });
  });

  it('refreshes the auth token when the app returns to the foreground', async () => {
    await act(async () => {
      create(
        <TRPCProvider>
          <></>
        </TRPCProvider>
      );
      await Promise.resolve();
    });

    mockGetToken.mockClear();

    await act(async () => {
      appStateCallback?.('background');
      appStateCallback?.('active');
      await Promise.resolve();
    });

    expect(mockGetToken).toHaveBeenCalledWith({ skipCache: true });
  });

  it('omits Clerk auth headers when auth is disabled', async () => {
    mockUseAuthAvailability.mockReturnValue({ isEnabled: false });

    act(() => {
      create(
        <TRPCProvider>
          <></>
        </TRPCProvider>
      );
    });

    expect(httpBatchLink).toHaveBeenCalledWith(
      expect.objectContaining({
        fetch: telemetryFetch,
        headers: expect.any(Function),
      })
    );

    const headers = await (httpBatchLink as jest.Mock).mock.calls[0][0].headers();

    expect(buildMobileTelemetryHeaders).toHaveBeenCalledWith({});
    expect(headers).toEqual({
      'X-Trace-ID': 'trc_test_header',
    });
    expect(mockGetToken).not.toHaveBeenCalled();
    expect(setQueueProcessedCallback).not.toHaveBeenCalled();
  });

  it('retries unauthorized requests with a refreshed token', async () => {
    mockGetToken.mockResolvedValueOnce('refreshed-token');
    const unauthorizedResponse = { status: 401 } as Response;
    const successResponse = { status: 200 } as Response;
    (telemetryFetch as jest.Mock)
      .mockResolvedValueOnce(unauthorizedResponse)
      .mockResolvedValueOnce(successResponse);

    act(() => {
      create(
        <TRPCProvider>
          <></>
        </TRPCProvider>
      );
    });

    const fetchFn = (httpBatchLink as jest.Mock).mock.calls[0][0].fetch as typeof fetch;
    const response = await fetchFn('https://api.myzine.app/trpc/items.home', {
      headers: { Authorization: 'Bearer stale-token' },
      method: 'GET',
    });

    expect(mockGetToken).toHaveBeenCalledWith({ skipCache: true });
    expect(telemetryFetch).toHaveBeenCalledTimes(2);

    const retryInit = (telemetryFetch as jest.Mock).mock.calls[1][1] as RequestInit;
    expect(new Headers(retryInit.headers).get('Authorization')).toBe('Bearer refreshed-token');
    expect(response.status).toBe(200);
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('reuses the forced token refresh started on app resume', async () => {
    const resumeTokenResolver = {
      current: null as ((token: string | null) => void) | null,
    };
    const resumeTokenPromise = new Promise<string | null>((resolve) => {
      resumeTokenResolver.current = resolve;
    });
    mockGetToken.mockImplementationOnce(() => resumeTokenPromise);

    act(() => {
      create(
        <TRPCProvider>
          <></>
        </TRPCProvider>
      );
    });

    act(() => {
      appStateCallback?.('background');
    });

    await act(async () => {
      appStateCallback?.('active');
    });

    const headersPromise = (httpBatchLink as jest.Mock).mock.calls[0][0].headers();

    expect(mockGetToken).toHaveBeenCalledTimes(1);
    expect(mockGetToken).toHaveBeenCalledWith({ skipCache: true });

    if (!resumeTokenResolver.current) {
      throw new Error('Resume token resolver was not set');
    }

    resumeTokenResolver.current('resume-token');
    const headers = await headersPromise;

    expect(buildMobileTelemetryHeaders).toHaveBeenCalledWith({
      Authorization: 'Bearer resume-token',
    });
    expect(headers).toEqual({
      Authorization: 'Bearer resume-token',
      'X-Trace-ID': 'trc_test_header',
    });
  });

  it('signs out after an unauthorized retry also fails', async () => {
    const clearSpy = jest.spyOn(QueryClient.prototype, 'clear');

    mockGetToken.mockResolvedValueOnce('refreshed-token');
    const unauthorizedResponse = { status: 401 } as Response;
    (telemetryFetch as jest.Mock)
      .mockResolvedValueOnce(unauthorizedResponse)
      .mockResolvedValueOnce(unauthorizedResponse);

    act(() => {
      create(
        <TRPCProvider>
          <></>
        </TRPCProvider>
      );
    });

    const fetchFn = (httpBatchLink as jest.Mock).mock.calls[0][0].fetch as typeof fetch;
    const response = await fetchFn('https://api.myzine.app/trpc/items.home', {
      headers: { Authorization: 'Bearer stale-token' },
      method: 'GET',
    });

    expect(mockGetToken).toHaveBeenCalledWith({ skipCache: true });
    expect(response.status).toBe(401);
    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});

describe('TRPCProvider cache persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = 'user-123';
    mockGetToken.mockResolvedValue('token');
    mockSignOut.mockResolvedValue(undefined);
    latestPersistOptions = null;
    mockUseIsRestoring.mockReturnValue(false);
    mockGetItem.mockResolvedValue(null);
    mockUseAuthAvailability.mockReturnValue({ isEnabled: true });
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

  it('clears cache and persisted data on user switch', async () => {
    const clearSpy = jest.spyOn(QueryClient.prototype, 'clear');

    let renderer: ReturnType<typeof create> | null = null;

    await act(async () => {
      renderer = create(
        <TRPCProvider>
          <></>
        </TRPCProvider>
      );
      await Promise.resolve();
    });

    expect(mockRemoveClient).not.toHaveBeenCalled();

    mockUserId = 'user-456';

    await act(async () => {
      if (!renderer) {
        throw new Error('Renderer not set');
      }

      renderer.update(
        <TRPCProvider>
          <></>
        </TRPCProvider>
      );
      await Promise.resolve();
    });

    expect(mockRemoveClient).toHaveBeenCalledTimes(1);
    expect(clearSpy).toHaveBeenCalledTimes(1);

    const persisterCalls = (createAsyncStoragePersister as jest.Mock).mock.calls;
    expect(persisterCalls.length).toBeGreaterThanOrEqual(2);
    expect(persisterCalls[1][0].key).toContain(`${PERSISTENCE_STORAGE_PREFIX}user-456:`);
  });
});
