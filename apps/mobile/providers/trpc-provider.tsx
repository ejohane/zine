/**
 * TRPCProvider - React Context for tRPC + React Query state management
 *
 * Provides a tRPC client and QueryClient to the component tree for
 * type-safe API calls with automatic caching and auth integration.
 */

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { trpc, API_URL } from '@/lib/trpc';

// TODO: Uncomment when @clerk/clerk-expo is added
// import { useAuth } from '@clerk/clerk-expo';

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
  // TODO: Integrate with Clerk auth when @clerk/clerk-expo is added
  // const { getToken } = useAuth();

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
          // TODO: Add auth headers when Clerk is integrated
          // headers: async () => {
          //   const token = await getToken();
          //   return token ? { Authorization: `Bearer ${token}` } : {};
          // },
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
