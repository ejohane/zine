/**
 * TRPCProvider - React Context for tRPC + React Query state management
 *
 * Provides a tRPC client and QueryClient to the component tree for
 * type-safe API calls with automatic caching and auth integration.
 */

import { useState, useRef, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, useIsRestoring, type QueryStatus } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { getQueryKey } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { useAuth, useClerk } from '@clerk/clerk-expo';
import { trpc, API_URL } from '@/lib/trpc';
import { setTokenGetter } from '@/lib/oauth';
import { setQueueProcessedCallback } from '@/lib/trpc-offline-client';
import { trpcLogger } from '@/lib/logger';
import { buildMobileTelemetryHeaders, telemetryFetch } from '@/lib/trpc-transport';
import { DEFAULT_QUERY_OPTIONS } from '@/constants/query';
import {
  buildQueryPersistenceBuster,
  buildQueryPersistenceKey,
  PERSISTENCE_MAX_AGE_MS,
  shouldPersistQuery,
} from '@/lib/query-persistence';
import { useAuthAvailability } from '@/providers/auth-provider';
import { AuthResumeGateContext } from '@/providers/auth-resume-gate';

// ============================================================================
// Provider Component
// ============================================================================

interface TRPCProviderProps {
  children: ReactNode;
}

function isRequest(input: RequestInfo | URL): input is Request {
  return typeof Request !== 'undefined' && input instanceof Request;
}

function isUnauthorizedResponse(response: Response): boolean {
  return response.status === 401;
}

function buildRetryRequest(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  token: string
): { input: RequestInfo | URL; init: RequestInit } {
  const headers = new Headers(init?.headers ?? (isRequest(input) ? input.headers : undefined));
  headers.set('Authorization', `Bearer ${token}`);

  return {
    input: isRequest(input) ? input.clone() : input,
    init: {
      ...init,
      headers,
    },
  };
}

function HydrationGate({ children, shouldBlock }: { children: ReactNode; shouldBlock: boolean }) {
  const isRestoring = useIsRestoring();

  if (isRestoring && shouldBlock) {
    return null;
  }

  return <>{children}</>;
}

/**
 * Provides a tRPC client and QueryClient to the component tree.
 *
 * Integrates with Clerk authentication to automatically include
 * Bearer tokens in API requests.
 *
 * @example
 * ```tsx
 * <TRPCProvider>
 *   <App />
 * </TRPCProvider>
 * ```
 */
export function TRPCProvider({ children }: TRPCProviderProps) {
  const { isEnabled } = useAuthAvailability();

  if (!isEnabled) {
    return <UnauthenticatedTRPCProvider>{children}</UnauthenticatedTRPCProvider>;
  }

  return <AuthenticatedTRPCProvider>{children}</AuthenticatedTRPCProvider>;
}

function AuthenticatedTRPCProvider({ children }: TRPCProviderProps) {
  const { getToken, userId, isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();

  // Store getToken in a ref to avoid recreating the tRPC client when auth changes
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;
  const hasTriggeredSignOutRef = useRef(false);
  const authRefreshPromiseRef = useRef<Promise<boolean> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // ---------------------------------------------------------------------------
  // Initialize OAuth Token Getter
  // ---------------------------------------------------------------------------
  // The vanilla tRPC client in oauth.ts needs access to auth tokens for
  // imperative OAuth operations like connectProvider(). This hooks it up.
  useEffect(() => {
    setTokenGetter(() => getTokenRef.current());
  }, []);

  useEffect(() => {
    hasTriggeredSignOutRef.current = false;
  }, [userId]);

  const ensureFreshAuthToken = useCallback(async (): Promise<boolean> => {
    if (!isLoaded || !isSignedIn) {
      return false;
    }

    if (!authRefreshPromiseRef.current) {
      const refreshPromise = getTokenRef
        .current({ skipCache: true })
        .then((token) => {
          if (!token) {
            trpcLogger.warn(
              'Skipped app resume network work because auth refresh returned no token'
            );
            return false;
          }

          return true;
        })
        .catch((error) => {
          trpcLogger.warn('Skipped app resume network work because auth refresh failed', {
            error,
          });
          return false;
        })
        .finally(() => {
          if (authRefreshPromiseRef.current === refreshPromise) {
            authRefreshPromiseRef.current = null;
          }
        });

      authRefreshPromiseRef.current = refreshPromise;
    }

    return authRefreshPromiseRef.current;
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      const wasInBackground = /inactive|background/.test(appStateRef.current);

      appStateRef.current = nextState;

      if (wasInBackground && nextState === 'active') {
        void ensureFreshAuthToken();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => subscription.remove();
  }, [ensureFreshAuthToken]);

  // ---------------------------------------------------------------------------
  // QueryClient Configuration
  // ---------------------------------------------------------------------------
  // Create clients in useState to avoid SSR/hydration issues and ensure
  // stable references across re-renders.

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: DEFAULT_QUERY_OPTIONS,
        },
      })
  );

  // ---------------------------------------------------------------------------
  // Persistence Configuration
  // ---------------------------------------------------------------------------

  const persistenceBuster = useMemo(() => buildQueryPersistenceBuster(), []);
  const persistenceKey = useMemo(
    () => buildQueryPersistenceKey(userId, persistenceBuster),
    [userId, persistenceBuster]
  );
  const persister = useMemo(
    () => createAsyncStoragePersister({ storage: AsyncStorage, key: persistenceKey }),
    [persistenceKey]
  );
  const persistOptions = useMemo(
    () => ({
      persister,
      maxAge: PERSISTENCE_MAX_AGE_MS,
      buster: persistenceBuster,
      dehydrateOptions: {
        shouldDehydrateQuery: ({
          queryKey,
          state,
        }: {
          queryKey: unknown;
          state: { status: QueryStatus };
        }) => shouldPersistQuery({ queryKey, status: state.status }),
      },
    }),
    [persister, persistenceBuster]
  );

  const [hasPersistedClient, setHasPersistedClient] = useState<boolean | null>(null);

  useEffect(() => {
    let isActive = true;

    setHasPersistedClient(null);

    AsyncStorage.getItem(persistenceKey)
      .then((storedValue) => {
        if (isActive) {
          setHasPersistedClient(Boolean(storedValue));
        }
      })
      .catch(() => {
        if (isActive) {
          setHasPersistedClient(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [persistenceKey]);

  const previousPersisterRef = useRef(persister);

  useEffect(() => {
    if (previousPersisterRef.current !== persister) {
      void previousPersisterRef.current.removeClient();
      queryClient.clear();
      previousPersisterRef.current = persister;
    }
  }, [persister, queryClient]);

  // ---------------------------------------------------------------------------
  // Offline Queue Cache Invalidation
  // ---------------------------------------------------------------------------

  useEffect(() => {
    setQueueProcessedCallback(() => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: getQueryKey(trpc.subscriptions.list) }),
        queryClient.invalidateQueries({
          queryKey: getQueryKey(trpc.subscriptions.connections.list),
        }),
        queryClient.invalidateQueries({ queryKey: getQueryKey(trpc.items.inbox) }),
        queryClient.invalidateQueries({ queryKey: getQueryKey(trpc.items.library) }),
        queryClient.invalidateQueries({ queryKey: getQueryKey(trpc.items.home) }),
        queryClient.invalidateQueries({ queryKey: getQueryKey(trpc.insights.weeklyRecap) }),
        queryClient.invalidateQueries({ queryKey: getQueryKey(trpc.insights.weeklyRecapTeaser) }),
      ]);
    });
  }, [queryClient]);

  // ---------------------------------------------------------------------------
  // tRPC Client Configuration
  // ---------------------------------------------------------------------------

  const [trpcClient] = useState(() => {
    const url = `${API_URL}/trpc`;
    trpcLogger.info('Connecting to tRPC server', { url });

    const fetchWithAuthRecovery: typeof fetch = async (input, init) => {
      const response = await telemetryFetch(isRequest(input) ? input.clone() : input, init);

      if (!isUnauthorizedResponse(response)) {
        return response;
      }

      try {
        const refreshedToken = await getTokenRef.current({ skipCache: true });

        if (refreshedToken) {
          trpcLogger.warn('Retrying unauthorized tRPC request with refreshed auth token', {
            url,
            httpStatus: response.status,
          });

          const retryRequest = buildRetryRequest(input, init, refreshedToken);
          const retryResponse = await telemetryFetch(retryRequest.input, retryRequest.init);

          if (!isUnauthorizedResponse(retryResponse)) {
            return retryResponse;
          }
        } else {
          trpcLogger.warn(
            'Skipping unauthorized tRPC retry because auth refresh returned no token',
            {
              url,
            }
          );
        }
      } catch (error) {
        trpcLogger.warn('Failed to refresh auth token after unauthorized tRPC request', {
          error,
          url,
        });
      }

      if (!hasTriggeredSignOutRef.current) {
        hasTriggeredSignOutRef.current = true;
        queryClient.clear();
        void signOutRef.current().catch((error) => {
          trpcLogger.warn('Failed to sign out after repeated unauthorized tRPC request', {
            error,
            url,
          });
        });
      }

      return response;
    };

    return trpc.createClient({
      links: [
        httpBatchLink({
          url,
          transformer: superjson, // Required for Date serialization - must match server
          headers: async () => {
            try {
              const token = await getTokenRef.current();
              if (token) {
                return buildMobileTelemetryHeaders({ Authorization: `Bearer ${token}` });
              }
            } catch (error) {
              trpcLogger.warn('Failed to get auth token', { error });
            }
            return buildMobileTelemetryHeaders({});
          },
          fetch: fetchWithAuthRecovery,
        }),
      ],
    });
  });

  // ---------------------------------------------------------------------------
  // Provider Tree
  // ---------------------------------------------------------------------------
  // Note: QueryClientProvider must be inside trpc.Provider for proper integration

  const shouldBlockHydration = hasPersistedClient === true;

  return (
    <AuthResumeGateContext.Provider value={{ ensureFreshAuthToken }}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
          <HydrationGate shouldBlock={shouldBlockHydration}>{children}</HydrationGate>
        </PersistQueryClientProvider>
      </trpc.Provider>
    </AuthResumeGateContext.Provider>
  );
}

function UnauthenticatedTRPCProvider({ children }: TRPCProviderProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: DEFAULT_QUERY_OPTIONS,
        },
      })
  );
  const persistenceKey = useMemo(
    () => buildQueryPersistenceKey(null, buildQueryPersistenceBuster()),
    []
  );

  const [trpcClient] = useState(() => {
    const url = `${API_URL}/trpc`;
    trpcLogger.info('Connecting to tRPC server without Clerk auth', { url });

    return trpc.createClient({
      links: [
        httpBatchLink({
          url,
          transformer: superjson,
          headers: async () => buildMobileTelemetryHeaders({}),
          fetch: telemetryFetch,
        }),
      ],
    });
  });

  useEffect(() => {
    if (__DEV__ && typeof AsyncStorage.removeItem === 'function') {
      void AsyncStorage.removeItem(persistenceKey);
    }
  }, [persistenceKey]);

  if (__DEV__) {
    return (
      <AuthResumeGateContext.Provider value={{ ensureFreshAuthToken: async () => true }}>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <HydrationGate shouldBlock={false}>{children}</HydrationGate>
        </trpc.Provider>
      </AuthResumeGateContext.Provider>
    );
  }

  return (
    <AuthResumeGateContext.Provider value={{ ensureFreshAuthToken: async () => true }}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister: createAsyncStoragePersister({
              storage: AsyncStorage,
              key: persistenceKey,
            }),
            maxAge: PERSISTENCE_MAX_AGE_MS,
            buster: buildQueryPersistenceBuster(),
            dehydrateOptions: {
              shouldDehydrateQuery: ({
                queryKey,
                state,
              }: {
                queryKey: unknown;
                state: { status: QueryStatus };
              }) => shouldPersistQuery({ queryKey, status: state.status }),
            },
          }}
        >
          <HydrationGate shouldBlock={false}>{children}</HydrationGate>
        </PersistQueryClientProvider>
      </trpc.Provider>
    </AuthResumeGateContext.Provider>
  );
}
