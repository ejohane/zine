/**
 * useConnections Hook
 *
 * Fetches the user's OAuth connection status for each provider (YouTube, Spotify).
 * Used by the Settings screen to display provider connection status.
 *
 * Backend API: subscriptions.connections.list
 * Note: The backend router needs to wire connectionsRouter under subscriptions router.
 *
 * @see features/subscriptions/frontend-spec.md Section 3.1.1
 */

import { trpc } from '../lib/trpc';
import type { SubscriptionsResponse, Subscription } from './use-subscriptions-query';

// ============================================================================
// Types
// ============================================================================

/**
 * Connection status values
 */
export type ConnectionStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED';

/**
 * Supported OAuth providers
 */
export type ConnectionProvider = 'YOUTUBE' | 'SPOTIFY' | 'GMAIL';

/**
 * Connection type returned from the backend.
 * Represents an OAuth connection to a provider (YouTube, Spotify).
 */
export interface Connection {
  /** Unique connection identifier */
  id: string;
  /** The OAuth provider */
  provider: ConnectionProvider;
  /** Current connection status */
  status: ConnectionStatus;
  /** Provider-specific user ID (e.g., YouTube channel ID) */
  providerUserId: string | null;
  /** When the connection was established (ISO 8601 string) */
  createdAt: string;
  /** When the last sync occurred (ISO 8601 string or null if never) */
  lastSyncAt: string | null;
}

/**
 * Payload for disconnecting a provider connection.
 */
export interface DisconnectConnectionInput {
  provider: ConnectionProvider;
}

/**
 * Individual provider connection data from backend
 */
interface ProviderConnectionData {
  provider: string;
  status: string;
  connectedAt: number;
  lastRefreshedAt: number | null;
}

/**
 * Backend response shape from connections.list
 * Returns a map with provider keys containing connection info or null
 */
interface ConnectionsListResponse {
  YOUTUBE: ProviderConnectionData | null;
  SPOTIFY: ProviderConnectionData | null;
  GMAIL: ProviderConnectionData | null;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Transform backend connection response to Connection interface
 *
 * The backend returns timestamps as numbers (epoch ms), while the
 * frontend spec expects ISO 8601 strings.
 */
function transformConnection(
  provider: ConnectionProvider,
  data: ProviderConnectionData
): Connection {
  return {
    // Backend doesn't return an ID, generate a stable one from provider
    id: `connection-${provider.toLowerCase()}`,
    provider,
    status: data.status as ConnectionStatus,
    // Backend doesn't return providerUserId in list endpoint
    providerUserId: null,
    // Convert epoch ms to ISO 8601
    createdAt: new Date(data.connectedAt).toISOString(),
    lastSyncAt: data.lastRefreshedAt ? new Date(data.lastRefreshedAt).toISOString() : null,
  };
}

/**
 * Transform backend response map to Connection array
 */
function transformConnectionsResponse(response: ConnectionsListResponse): Connection[] {
  const connections: Connection[] = [];

  if (response.YOUTUBE) {
    connections.push(transformConnection('YOUTUBE', response.YOUTUBE));
  }

  if (response.SPOTIFY) {
    connections.push(transformConnection('SPOTIFY', response.SPOTIFY));
  }

  if (response.GMAIL) {
    connections.push(transformConnection('GMAIL', response.GMAIL));
  }

  return connections;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to fetch the user's connected provider accounts.
 *
 * Returns a React Query result with an array of connections for all
 * providers the user has connected (YouTube, Spotify).
 *
 * The data is cached for 5 minutes (staleTime) and garbage collected
 * after 24 hours (gcTime) to minimize API calls while ensuring
 * reasonably fresh connection status.
 *
 * @returns Query result with connections array
 *
 * @example
 * ```tsx
 * function SettingsScreen() {
 *   const { data: connections, isLoading, error } = useConnections();
 *
 *   if (isLoading) return <LoadingSpinner />;
 *   if (error) return <ErrorMessage error={error} />;
 *
 *   const youtubeConnection = connections?.find(c => c.provider === 'YOUTUBE');
 *   const spotifyConnection = connections?.find(c => c.provider === 'SPOTIFY');
 *
 *   return (
 *     <View>
 *       <Text>YouTube: {youtubeConnection?.status ?? 'Not connected'}</Text>
 *       <Text>Spotify: {spotifyConnection?.status ?? 'Not connected'}</Text>
 *     </View>
 *   );
 * }
 * ```
 */
export function useConnections() {
  // API path: subscriptions.connections.list
  // Note: Backend router needs connectionsRouter wired under subscriptions
  // Using type assertion until router is updated with proper typing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (trpc as any).subscriptions.connections.list.useQuery(undefined, {
    // Cache for 5 minutes - connection status doesn't change frequently
    staleTime: 5 * 60 * 1000,
    // Keep in cache for 24 hours
    gcTime: 24 * 60 * 60 * 1000,
    // Transform the backend response to match the expected Connection[] format
    select: transformConnectionsResponse,
  });
}

/**
 * Hook to get connection for a specific provider
 *
 * Convenience wrapper around useConnections for cases where
 * you only need one provider's connection status.
 *
 * @param provider - The provider to get connection for
 * @returns Query result with connection or undefined if not connected
 *
 * @example
 * ```tsx
 * function YouTubeSettings() {
 *   const { data: connection, isLoading } = useConnection('YOUTUBE');
 *
 *   if (connection?.status === 'ACTIVE') {
 *     return <Text>Connected to YouTube</Text>;
 *   }
 *
 *   return <Button onPress={connectYouTube}>Connect YouTube</Button>;
 * }
 * ```
 */
export function useConnection(provider: ConnectionProvider) {
  // API path: subscriptions.connections.list
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (trpc as any).subscriptions.connections.list.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    select: (response: ConnectionsListResponse) => {
      const providerData = response[provider];
      return providerData ? transformConnection(provider, providerData) : undefined;
    },
  });
}

/**
 * Hook to disconnect a provider connection with optimistic updates.
 */
export function useDisconnectConnection(options?: {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  onSettled?: () => void;
}) {
  type DisconnectContext = {
    previousConnections?: Connection[];
    previousSubscriptions?: {
      defaultList?: SubscriptionsResponse;
      limitedList?: SubscriptionsResponse;
    };
  };

  // Using type assertion until router types are updated
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const utils = trpc.useUtils() as any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (trpc as any).subscriptions.connections.disconnect.useMutation({
    onMutate: async ({ provider }: DisconnectConnectionInput): Promise<DisconnectContext> => {
      await utils.subscriptions?.connections?.list?.cancel?.();
      await utils.subscriptions?.list?.cancel?.({});
      await utils.subscriptions?.list?.cancel?.({ limit: 50 });

      const previousConnections = utils.subscriptions?.connections?.list?.getData?.();
      const previousSubscriptionsDefault = utils.subscriptions?.list?.getData?.({});
      const previousSubscriptionsLimited = utils.subscriptions?.list?.getData?.({ limit: 50 });

      utils.subscriptions?.connections?.list?.setData?.(
        undefined,
        (old: Connection[] | undefined) =>
          old ? old.filter((connection) => connection.provider !== provider) : old
      );

      const updateSubscriptions = (old: SubscriptionsResponse | undefined) => {
        if (!old) return old;

        return {
          ...old,
          items: old.items.map((subscription: Subscription) =>
            subscription.provider === provider
              ? { ...subscription, status: 'DISCONNECTED' }
              : subscription
          ),
        };
      };

      utils.subscriptions?.list?.setData?.({}, updateSubscriptions);
      utils.subscriptions?.list?.setData?.({ limit: 50 }, updateSubscriptions);

      return {
        previousConnections,
        previousSubscriptions: {
          defaultList: previousSubscriptionsDefault,
          limitedList: previousSubscriptionsLimited,
        },
      };
    },
    onError: (error: Error, _input: DisconnectConnectionInput, context?: DisconnectContext) => {
      if (context?.previousConnections !== undefined) {
        utils.subscriptions?.connections?.list?.setData?.(undefined, context.previousConnections);
      }

      if (context?.previousSubscriptions?.defaultList !== undefined) {
        utils.subscriptions?.list?.setData?.({}, context.previousSubscriptions.defaultList);
      }

      if (context?.previousSubscriptions?.limitedList !== undefined) {
        utils.subscriptions?.list?.setData?.(
          { limit: 50 },
          context.previousSubscriptions.limitedList
        );
      }

      options?.onError?.(error);
    },
    onSuccess: () => {
      utils.subscriptions?.connections?.list?.invalidate?.();
      utils.subscriptions?.list?.invalidate?.();
      options?.onSuccess?.();
    },
    onSettled: () => {
      options?.onSettled?.();
    },
  });
}
