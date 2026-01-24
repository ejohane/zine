/**
 * TRPCProvider - React Context for tRPC + React Query state management
 *
 * Provides a tRPC client and QueryClient to the component tree for
 * type-safe API calls with automatic caching and auth integration.
 */

import { useState, useRef, useEffect, useMemo, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, useIsRestoring, type QueryStatus } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { getQueryKey } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { useAuth } from '@clerk/clerk-expo';
import { trpc, API_URL } from '@/lib/trpc';
import { setTokenGetter } from '@/lib/oauth';
import { setQueueProcessedCallback } from '@/lib/trpc-offline-client';
import { trpcLogger } from '@/lib/logger';
import { DEFAULT_QUERY_OPTIONS } from '@/constants/query';
import {
  buildQueryPersistenceBuster,
  buildQueryPersistenceKey,
  PERSISTENCE_MAX_AGE_MS,
  shouldPersistQuery,
} from '@/lib/query-persistence';

// ============================================================================
// Provider Component
// ============================================================================

interface TRPCProviderProps {
  children: ReactNode;
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
  const { getToken, userId } = useAuth();

  // Store getToken in a ref to avoid recreating the tRPC client when auth changes
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  // ---------------------------------------------------------------------------
  // Initialize OAuth Token Getter
  // ---------------------------------------------------------------------------
  // The vanilla tRPC client in oauth.ts needs access to auth tokens for
  // imperative OAuth operations like connectProvider(). This hooks it up.
  useEffect(() => {
    setTokenGetter(() => getTokenRef.current());
  }, []);

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
      ]);
    });
  }, [queryClient]);

  // ---------------------------------------------------------------------------
  // tRPC Client Configuration
  // ---------------------------------------------------------------------------

  const [trpcClient] = useState(() => {
    const url = `${API_URL}/trpc`;
    trpcLogger.info('Connecting to tRPC server', { url });

    return trpc.createClient({
      links: [
        httpBatchLink({
          url,
          transformer: superjson, // Required for Date serialization - must match server
          headers: async () => {
            try {
              const token = await getTokenRef.current();
              if (token) {
                return { Authorization: `Bearer ${token}` };
              }
            } catch (error) {
              trpcLogger.warn('Failed to get auth token', { error });
            }
            return {};
          },
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
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <HydrationGate shouldBlock={shouldBlockHydration}>{children}</HydrationGate>
      </PersistQueryClientProvider>
    </trpc.Provider>
  );
}
