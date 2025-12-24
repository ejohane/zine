/**
 * Singleton tRPC client for use by the offline queue.
 *
 * This client is separate from the React hooks client but shares
 * the same configuration. It's used by the offline queue to execute
 * mutations when processing queued actions.
 *
 * Important: After successful execution, the queue notifies React Query
 * to invalidate relevant caches via the queueProcessedCallback.
 *
 * @see frontend-spec.md Section 9.3.0 for architecture details
 */

import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import * as SecureStore from 'expo-secure-store';
import type { AppRouter } from '../../worker/src/trpc/router';
import { API_URL } from './trpc';

// ============================================================================
// Callback Registration for Cache Invalidation
// ============================================================================

/**
 * Callback to be invoked when the offline queue successfully processes actions.
 * This is set by the TRPCProvider to enable cache invalidation.
 */
let queueProcessedCallback: (() => void) | null = null;

/**
 * Register a callback to be called when the queue successfully processes actions.
 * The tRPC provider calls this at initialization to enable cache invalidation.
 *
 * @param callback - Function to call after queue processing (typically invalidates React Query cache)
 */
export function setQueueProcessedCallback(callback: () => void): void {
  queueProcessedCallback = callback;
}

/**
 * Notify React Query that queued actions have been processed.
 * Called by the offline queue after successfully executing mutations.
 *
 * This triggers cache invalidation for subscription-related queries,
 * ensuring the UI reflects the server state after offline mutations complete.
 */
export function notifyQueueProcessed(): void {
  queueProcessedCallback?.();
}

// ============================================================================
// Auth Headers for Non-React Context
// ============================================================================

/**
 * Clerk session token key used by expo-secure-store.
 * This must match the key used by Clerk's tokenCache.
 */
const CLERK_SESSION_TOKEN_KEY = '__clerk_client_jwt';

/**
 * Get authentication headers for tRPC requests outside of React context.
 *
 * This function retrieves the Clerk session token from secure storage
 * and returns it as a Bearer token header. Used by the offline queue
 * when processing mutations.
 *
 * @returns Promise resolving to headers object with Authorization if token exists
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const token = await SecureStore.getItemAsync(CLERK_SESSION_TOKEN_KEY);
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
  } catch (error) {
    console.warn('[tRPC Offline] Failed to get auth token from SecureStore:', error);
  }
  return {};
}

// ============================================================================
// Singleton tRPC Client
// ============================================================================

/**
 * Singleton instance of the offline tRPC client.
 * Created lazily on first access via getOfflineTRPCClient().
 */
let offlineClient: ReturnType<typeof createOfflineTRPCClient> | null = null;

/**
 * Create the offline queue's tRPC client.
 *
 * Uses the same API endpoint and transformer as the React hooks client,
 * but is independent of React Query. This allows the offline queue to
 * execute mutations without being tied to the React component lifecycle.
 *
 * @returns A vanilla tRPC client (not React-integrated)
 */
export function createOfflineTRPCClient() {
  const url = `${API_URL}/trpc`;

  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url,
        transformer: superjson, // Must match server configuration
        headers: async () => {
          return getAuthHeaders();
        },
      }),
    ],
  });
}

/**
 * Get the singleton offline tRPC client instance.
 *
 * Creates the client on first call, then returns the same instance
 * for all subsequent calls. This ensures:
 * 1. Consistent client instance across all queue operations
 * 2. Proper auth header injection
 * 3. Efficient resource usage (no redundant client creation)
 *
 * @returns The singleton offline tRPC client
 *
 * @example
 * ```typescript
 * const client = getOfflineTRPCClient();
 * await client.subscriptions.add.mutate({ ... });
 * ```
 */
export function getOfflineTRPCClient() {
  if (!offlineClient) {
    offlineClient = createOfflineTRPCClient();
  }
  return offlineClient;
}
