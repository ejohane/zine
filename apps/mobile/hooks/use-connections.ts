/**
 * useConnections Hook
 *
 * Fetches the user's OAuth connection status for each provider (YouTube, Spotify, Gmail).
 * Used by subscriptions/settings screens to display provider connection status.
 */

import { trpc } from '../lib/trpc';
import type {
  ConnectionsListOutput,
  NewslettersListOutput,
  NewslettersStatsOutput,
  SubscriptionsListOutput,
} from '../lib/trpc-types';

// ============================================================================
// Types
// ============================================================================

export type ConnectionStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED';
export type ConnectionProvider = 'YOUTUBE' | 'SPOTIFY' | 'GMAIL';

export interface Connection {
  id: string;
  provider: ConnectionProvider;
  status: ConnectionStatus;
  providerUserId: string | null;
  createdAt: string;
  lastSyncAt: string | null;
}

export interface DisconnectConnectionInput {
  provider: ConnectionProvider;
}

type ProviderConnectionData = NonNullable<ConnectionsListOutput[ConnectionProvider]>;

// ============================================================================
// Helpers
// ============================================================================

function isConnectionProvider(value: string): value is ConnectionProvider {
  return value === 'YOUTUBE' || value === 'SPOTIFY' || value === 'GMAIL';
}

function transformConnection(
  provider: ConnectionProvider,
  data: ProviderConnectionData
): Connection {
  return {
    id: `connection-${provider.toLowerCase()}`,
    provider,
    status: data.status as ConnectionStatus,
    providerUserId: null,
    createdAt: new Date(data.connectedAt).toISOString(),
    lastSyncAt: data.lastRefreshedAt ? new Date(data.lastRefreshedAt).toISOString() : null,
  };
}

function transformConnectionsResponse(response: ConnectionsListOutput): Connection[] {
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
// Hooks
// ============================================================================

export function useConnections() {
  return trpc.subscriptions.connections.list.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    select: transformConnectionsResponse,
  });
}

export function useConnection(provider: ConnectionProvider) {
  return trpc.subscriptions.connections.list.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    select: (response) => {
      const providerData = response[provider];
      return providerData ? transformConnection(provider, providerData) : undefined;
    },
  });
}

export function useDisconnectConnection(options?: {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  onSettled?: () => void;
}) {
  type DisconnectContext = {
    previousConnections?: ConnectionsListOutput;
    previousSubscriptions?: {
      defaultList?: SubscriptionsListOutput;
      limitedList?: SubscriptionsListOutput;
    };
    previousNewsletters?: {
      listDefault?: NewslettersListOutput;
      listNoSearch?: NewslettersListOutput;
      listUnscoped?: NewslettersListOutput;
      stats?: NewslettersStatsOutput;
    };
  };

  const utils = trpc.useUtils();

  return trpc.subscriptions.connections.disconnect.useMutation({
    onMutate: async (input): Promise<DisconnectContext> => {
      if (!isConnectionProvider(input.provider)) {
        return {};
      }
      const provider = input.provider;

      await utils.subscriptions.connections.list.cancel();
      await utils.subscriptions.list.cancel({});
      await utils.subscriptions.list.cancel({ limit: 50 });

      if (provider === 'GMAIL') {
        await utils.subscriptions.newsletters.list.cancel({
          limit: 100,
          search: undefined,
        });
        await utils.subscriptions.newsletters.list.cancel({
          limit: 100,
        });
        await utils.subscriptions.newsletters.list.cancel();
        await utils.subscriptions.newsletters.stats.cancel();
      }

      const previousConnections = utils.subscriptions.connections.list.getData();
      const previousSubscriptionsDefault = utils.subscriptions.list.getData({});
      const previousSubscriptionsLimited = utils.subscriptions.list.getData({ limit: 50 });
      const previousNewslettersList =
        provider === 'GMAIL'
          ? utils.subscriptions.newsletters.list.getData({ limit: 100, search: undefined })
          : undefined;
      const previousNewslettersListNoSearch =
        provider === 'GMAIL'
          ? utils.subscriptions.newsletters.list.getData({ limit: 100 })
          : undefined;
      const previousNewslettersListDefault =
        provider === 'GMAIL' ? utils.subscriptions.newsletters.list.getData() : undefined;
      const previousNewslettersStats =
        provider === 'GMAIL' ? utils.subscriptions.newsletters.stats.getData() : undefined;

      utils.subscriptions.connections.list.setData(undefined, (old) => {
        if (!old) return old;
        return {
          ...old,
          [provider]: null,
        };
      });

      const updateSubscriptions = (old: SubscriptionsListOutput | undefined) => {
        if (!old) return old;

        return {
          ...old,
          items: old.items.map((subscription: SubscriptionsListOutput['items'][number]) =>
            subscription.provider === provider
              ? { ...subscription, status: 'DISCONNECTED' }
              : subscription
          ),
        };
      };

      utils.subscriptions.list.setData({}, updateSubscriptions);
      utils.subscriptions.list.setData({ limit: 50 }, updateSubscriptions);

      if (provider === 'GMAIL') {
        const emptyNewsletters: NewslettersListOutput = {
          items: [],
          nextCursor: null,
          hasMore: false,
        };

        utils.subscriptions.newsletters.list.setData(
          { limit: 100, search: undefined },
          emptyNewsletters
        );
        utils.subscriptions.newsletters.list.setData({ limit: 100 }, emptyNewsletters);
        utils.subscriptions.newsletters.list.setData(undefined, emptyNewsletters);

        utils.subscriptions.newsletters.stats.setData(undefined, (old) => {
          if (!old) return old;
          return {
            ...old,
            total: 0,
            active: 0,
            hidden: 0,
            unsubscribed: 0,
            lastSyncAt: null,
            lastSyncStatus: 'IDLE',
            lastSyncError: null,
          };
        });
      }

      return {
        previousConnections,
        previousSubscriptions: {
          defaultList: previousSubscriptionsDefault,
          limitedList: previousSubscriptionsLimited,
        },
        previousNewsletters: {
          listDefault: previousNewslettersList,
          listNoSearch: previousNewslettersListNoSearch,
          listUnscoped: previousNewslettersListDefault,
          stats: previousNewslettersStats,
        },
      };
    },
    onError: (error, _input, context) => {
      if (context?.previousConnections !== undefined) {
        utils.subscriptions.connections.list.setData(undefined, context.previousConnections);
      }

      if (context?.previousSubscriptions?.defaultList !== undefined) {
        utils.subscriptions.list.setData({}, context.previousSubscriptions.defaultList);
      }
      if (context?.previousSubscriptions?.limitedList !== undefined) {
        utils.subscriptions.list.setData({ limit: 50 }, context.previousSubscriptions.limitedList);
      }

      if (context?.previousNewsletters?.listDefault !== undefined) {
        utils.subscriptions.newsletters.list.setData(
          { limit: 100, search: undefined },
          context.previousNewsletters.listDefault
        );
      }
      if (context?.previousNewsletters?.listNoSearch !== undefined) {
        utils.subscriptions.newsletters.list.setData(
          { limit: 100 },
          context.previousNewsletters.listNoSearch
        );
      }
      if (context?.previousNewsletters?.listUnscoped !== undefined) {
        utils.subscriptions.newsletters.list.setData(
          undefined,
          context.previousNewsletters.listUnscoped
        );
      }
      if (context?.previousNewsletters?.stats !== undefined) {
        utils.subscriptions.newsletters.stats.setData(undefined, context.previousNewsletters.stats);
      }

      const normalizedError =
        error instanceof Error ? error : new Error('Failed to disconnect provider');
      options?.onError?.(normalizedError);
    },
    onSuccess: (_data, input) => {
      utils.subscriptions.connections.list.invalidate();
      utils.subscriptions.list.invalidate();
      if (isConnectionProvider(input.provider) && input.provider === 'GMAIL') {
        utils.subscriptions.newsletters.list.invalidate();
        utils.subscriptions.newsletters.stats.invalidate();
      }
      options?.onSuccess?.();
    },
    onSettled: () => {
      options?.onSettled?.();
    },
  });
}
