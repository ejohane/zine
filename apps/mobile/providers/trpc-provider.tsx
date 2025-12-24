/**
 * TRPCProvider - React Context for tRPC + React Query state management
 *
 * Provides a tRPC client and QueryClient to the component tree for
 * type-safe API calls with automatic caching and auth integration.
 */

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { useAuth } from '@clerk/clerk-expo';
import { trpc, API_URL } from '@/lib/trpc';
import { setTokenGetter } from '@/lib/oauth';

// ============================================================================
// Provider Component
// ============================================================================

interface TRPCProviderProps {
  children: ReactNode;
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
  const { getToken } = useAuth();

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
          queries: {
            staleTime: 1000 * 60 * 5, // 5 minutes - data considered fresh
            retry: 2, // Retry failed requests twice before giving up
          },
        },
      })
  );

  // ---------------------------------------------------------------------------
  // tRPC Client Configuration
  // ---------------------------------------------------------------------------

  const [trpcClient] = useState(() => {
    const url = `${API_URL}/trpc`;
    console.log('[tRPC] Connecting to:', url);

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
              console.warn('[tRPC] Failed to get auth token:', error);
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

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
